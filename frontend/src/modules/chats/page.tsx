import { createQuery, useQueryClient } from '@tanstack/solid-query';
import { useBeforeLeave, useNavigate, useParams, useSearchParams, type RouteSectionProps } from '@solidjs/router';
import { createEffect, createMemo, createSignal, on, onCleanup, Show, untrack, type JSX } from 'solid-js';

import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { useToasts } from '@/app/providers';
import { coreApiClient, createAssistantChatMessage, createUserChatMessage, ensureChatPayload } from '@/lib/api/core-client';
import { ApiError, getErrorMessage } from '@/lib/api/http';
import { nativeBridge } from '@/lib/native/bridge';
import { getGreeting, locale } from '@/shared/i18n';
import { LoadingBlock } from '@/shared/components/ui';
import { createCreateDate } from '@/shared/utils/format';
import {
  getChatMessages,
  type AppSettings,
  type ChatPayload,
  type ChatProviderDraft,
  type RendererAction,
  type RendererManifest,
  type ChatSessionSummary,
  type GenerationRequest,
  type ProviderSource,
  type SessionBindings,
} from '@/types/domain';
import { multiplayerEnvelopeSchema, roomSnapshotSchema, roomStatusSchema, type ContributionAddedPayload, type RoomSnapshot } from '@/types/multiplayer';

import { SessionBindingOverlay, type SessionBindingTab } from './components/SessionBindingOverlay';
import { ChatSessionContextMenu } from './components/ChatSessionContextMenu';
import { CreateSessionGreetingModal } from './components/CreateSessionGreetingModal';
import { CreateSessionModeModal } from './components/CreateSessionModeModal';
import { ChatSessionEditorModal } from './components/ChatSessionEditorModal';
import { ChatSessionPane } from './components/ChatSessionPane';
import { ChatWelcome } from './components/ChatWelcome';
import { RendererWorkspace } from './components/RendererWorkspace';
import { JoinRoomModal } from './components/JoinRoomModal';
import { RoomPanelModal } from './components/RoomPanelModal';
import {
  appendAssistantPlaceholder,
  appendContinuationToSwipe,
  appendReasoningToSwipe,
  cycleSwipe,
  deleteMessage,
  getPayloadMessage,
  replaceCurrentSwipeText,
  truncateTimelineForRegenerate,
} from './payload';
import { readProviderSettings, setProviderModel, setProviderSource, writeProviderSettings } from './provider-settings';
import { buildMessageSourceContent } from './message-display';
import { readUiRendererSettings } from './renderer-settings';
import { createChatSessionCatalogController } from './session-catalog-controller';
import { createChatsStore } from './store';
import { findApiProfile, getApiProfiles, resolveBoundPreset } from './session-bindings';
import { resolveMultiplayerMessageMeta, resolveSessionBindings, resolveSessionState, withMultiplayerMessageMeta, withSessionBindings, withSessionRendererBinding, withSessionState } from './session-metadata';
import { buildRendererWorkspaceVm } from './renderers/workspace-vm';
import { BUILTIN_NATIVE_RENDERER_ID, detectRendererEnvironment, listKnownRenderers, readHostThemeTokens, resolveRendererSelection } from './renderers/registry';
import { hydrateCompleteChatPayload, loadChatWindowBefore, loadInitialChatWindow, markWindowStateDirty, saveChatWindow, type WindowedChatState, type WindowedChatTarget } from './windowed-chat';
import { applyMultiplayerEnvelope } from './multiplayer/event-apply';
import { applyRoomStatus, createDefaultRoomState } from './multiplayer/room-state';
import { PRESET_COPY } from '@/modules/presets/copy';

type ChatsPageProps = Partial<RouteSectionProps<unknown>> & {
  layout?: 'desktop' | 'mobile';
  onBack?: () => void;
};

type PreparedTokenUsage = Awaited<ReturnType<typeof coreApiClient.generation.prepareRequest>>['usage'];

function extractModels(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) {
    return [];
  }

  const candidates = payload.data;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return '';
      }

      const record = item as Record<string, unknown>;
      return String(record.id ?? record.name ?? '').trim();
    })
    .filter(Boolean);
}

function collectChunkTextParts(source: unknown): { content: string; reasoning: string } {
  if (typeof source === 'string') {
    return { content: source, reasoning: '' };
  }

  if (!Array.isArray(source)) {
    return { content: '', reasoning: '' };
  }

  return source.reduce<{ content: string; reasoning: string }>((accumulator, part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) {
      return accumulator;
    }

    const record = part as Record<string, unknown>;
    const type = String(record.type ?? '');
    const text = typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : '';

    if (!text) {
      return accumulator;
    }

    if (type.includes('reason') || type.includes('think')) {
      accumulator.reasoning += text;
      return accumulator;
    }

    accumulator.content += text;
    return accumulator;
  }, { content: '', reasoning: '' });
}

function extractChunkDelta(chunk: Record<string, unknown>): { content: string; reasoning: string } {
  const choices = chunk.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>;
    const delta = choice.delta;
    if (delta && typeof delta === 'object' && !Array.isArray(delta)) {
      const deltaRecord = delta as Record<string, unknown>;
      const parts = collectChunkTextParts(deltaRecord.content);
      const reasoning = typeof deltaRecord.reasoning === 'string'
        ? deltaRecord.reasoning
        : typeof deltaRecord.reasoning_content === 'string'
          ? deltaRecord.reasoning_content
          : typeof deltaRecord.thinking === 'string'
            ? deltaRecord.thinking
            : parts.reasoning;
      if (parts.content || reasoning) {
        return {
          content: parts.content,
          reasoning,
        };
      }
    }
  }

  const claudeDelta = chunk.delta;
  if (claudeDelta && typeof claudeDelta === 'object' && !Array.isArray(claudeDelta)) {
    const deltaRecord = claudeDelta as Record<string, unknown>;
    const text = typeof deltaRecord.text === 'string' ? deltaRecord.text : '';
    const thinking = typeof deltaRecord.thinking === 'string' ? deltaRecord.thinking : '';
    if (text || thinking) {
      return {
        content: text,
        reasoning: thinking,
      };
    }
  }

  const candidates = chunk.candidates;
  if (Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object') {
    const content = (candidates[0] as Record<string, unknown>).content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      const parts = (content as Record<string, unknown>).parts;
      if (Array.isArray(parts)) {
        return parts.reduce<{ content: string; reasoning: string }>((accumulator, part) => {
          if (!part || typeof part !== 'object' || Array.isArray(part)) {
            return accumulator;
          }

          const record = part as Record<string, unknown>;
          const text = typeof record.text === 'string' ? record.text : '';
          if (!text) {
            return accumulator;
          }

          if (record.thought === true) {
            accumulator.reasoning += text;
          } else {
            accumulator.content += text;
          }
          return accumulator;
        }, { content: '', reasoning: '' });
      }
    }
  }

  return { content: '', reasoning: '' };
}

function extractCompletionText(payload: Record<string, unknown>): string {
  const root = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : payload;

  const choices = root.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message;
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string') {
        return content;
      }
    }
    const text = choice.text;
    if (typeof text === 'string') {
      return text;
    }
    const delta = choice.delta;
    if (delta && typeof delta === 'object' && !Array.isArray(delta)) {
      const deltaContent = (delta as Record<string, unknown>).content;
      if (typeof deltaContent === 'string') {
        return deltaContent;
      }
    }
  }

  if (typeof root.content === 'string') {
    return root.content;
  }

  return '';
}

function extractCompletionTextFromError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '';
  }

  const payload = error.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }

  return extractCompletionText(payload as Record<string, unknown>);
}

function normalizeChatFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('.jsonl') ? trimmed : `${trimmed}.jsonl`;
}

function stripJsonlSuffix(value: string): string {
  return String(value || '').replace(/\.jsonl$/i, '');
}

function ensureJsonlName(value: string): string {
  return normalizeChatFileName(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function buildSessionKey(session: Pick<ChatSessionSummary, 'source_type' | 'scope_id' | 'file_name'>): string {
  return `${session.source_type}:${session.scope_id}:${ensureJsonlName(session.file_name)}`;
}

function clampMenuPosition(position: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return position;
  }

  return {
    x: Math.max(12, Math.min(position.x, window.innerWidth - 196)),
    y: Math.max(12, Math.min(position.y, window.innerHeight - 72)),
  };
}

function buildSessionHref(session: ChatSessionSummary): string {
  if (session.source_type === 'group') {
    return `/chats/group/${encodeURIComponent(session.scope_id)}?file=${encodeURIComponent(ensureJsonlName(session.file_name))}`;
  }

  return `/chats/character/${encodeURIComponent(session.scope_id)}?file=${encodeURIComponent(ensureJsonlName(session.file_name))}`;
}

function createDefaultMultiplayerSessionMetadata(scopeId: string, fileName: string) {
  return {
    version: 1 as const,
    mode: 'multiplayer' as const,
    bindings: {
      world_info_names: [],
      preset_ref: null,
      api_profile_id: null,
    },
    renderer: {
      mode: 'inherit' as const,
      renderer_id: null,
    },
    multiplayer: {
      created_from: {
        scope: 'character' as const,
        scope_id: scopeId,
        file_name: fileName,
      },
      transcript_mode: 'player-bubbles-host-concat-v1' as const,
    },
  };
}

function appendMultiplayerContribution(payload: ChatPayload, contribution: ContributionAddedPayload): ChatPayload {
  const nextPayload = [...payload] as ChatPayload;
  const message = withMultiplayerMessageMeta(createUserChatMessage(contribution.nickname, contribution.content), {
    kind: 'room_player_message',
    room_round_id: contribution.room_round_id,
    participant_id: contribution.participant_id,
    nickname: contribution.nickname,
    pending: contribution.pending,
    contribution_id: contribution.contribution_id,
    seq: contribution.sent_at,
  });
  nextPayload.push(message);
  return nextPayload;
}

function withdrawMultiplayerContribution(payload: ChatPayload, contributionId: string): ChatPayload {
  const nextPayload = [...payload] as ChatPayload;
  const messageIndex = getChatMessages(nextPayload).findIndex((message) => resolveMultiplayerMessageMeta(message)?.contribution_id === contributionId);
  if (messageIndex >= 0) {
    nextPayload.splice(messageIndex + 1, 1);
  }
  return nextPayload;
}

function commitPendingMultiplayerMessages(payload: ChatPayload): ChatPayload {
  const nextPayload = [...payload] as ChatPayload;
  const messages = getChatMessages(nextPayload);
  messages.forEach((message, index) => {
    const meta = resolveMultiplayerMessageMeta(message);
    if (!meta?.pending) {
      return;
    }
    nextPayload[index + 1] = withMultiplayerMessageMeta(message, {
      ...meta,
      pending: false,
    });
  });
  return nextPayload;
}

function findMessageIndexBySendDate(payload: ChatPayload, sendDate: string): number {
  return getChatMessages(payload).findIndex((message) => String(message.send_date ?? '') === sendDate);
}

function appendAssistantPlaceholderWithKey(payload: ChatPayload, assistantName: string, key: string): { payload: ChatPayload; messageIndex: number } {
  const nextPayload = [...payload] as ChatPayload;
  const placeholder = { ...createAssistantChatMessage(assistantName, ''), send_date: key };
  nextPayload.push(placeholder);
  return { payload: nextPayload, messageIndex: getChatMessages(nextPayload).length - 1 };
}

export default function ChatsPage(props: ChatsPageProps = {}): JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams<{ file?: string; create?: string; join?: string }>();
  const toast = useToasts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const store = createChatsStore(readProviderSettings(undefined));

  const [loadedSessionKey, setLoadedSessionKey] = createSignal('');
  const [pendingNewFile, setPendingNewFile] = createSignal('');
  const [modelStatusPayload, setModelStatusPayload] = createSignal<Record<string, unknown>>({});
  const [tokenUsage, setTokenUsage] = createSignal<PreparedTokenUsage>(null);
  const [lastPromptNoticeKey, setLastPromptNoticeKey] = createSignal('');
  const [lastBindingNoticeKey, setLastBindingNoticeKey] = createSignal('');
  const [modelOptions, setModelOptions] = createSignal<string[]>([]);
  const [loadingModels, setLoadingModels] = createSignal(false);
  const [savingProviderDefaults, setSavingProviderDefaults] = createSignal(false);
  const [contextMenuState, setContextMenuState] = createSignal<{ session: ChatSessionSummary; x: number; y: number } | null>(null);
  const [editorOpen, setEditorOpen] = createSignal(false);
  const [editorTab, setEditorTab] = createSignal<'session' | 'settings'>('session');
  const [editorSession, setEditorSession] = createSignal<ChatSessionSummary | null>(null);
  const [bindingOverlayOpen, setBindingOverlayOpen] = createSignal(false);
  const [bindingOverlayTab, setBindingOverlayTab] = createSignal<SessionBindingTab>('world-info');
  const [savingBindings, setSavingBindings] = createSignal(false);
  const [editorRendererMode, setEditorRendererMode] = createSignal<'inherit' | 'override'>('inherit');
  const [editorRendererId, setEditorRendererId] = createSignal<string | null>('native');
  const [createModeOpen, setCreateModeOpen] = createSignal(false);
  const [greetingModalOpen, setGreetingModalOpen] = createSignal(false);
  const [pendingGreetingMode, setPendingGreetingMode] = createSignal<'single' | 'multiplayer' | null>(null);
  const [greetingOptions, setGreetingOptions] = createSignal<string[]>([]);
  const [joinRoomOpen, setJoinRoomOpen] = createSignal(false);
  const [roomPanelOpen, setRoomPanelOpen] = createSignal(false);
  const [roomState, setRoomState] = createSignal(createDefaultRoomState());
  const [chatWindowState, setChatWindowState] = createSignal<WindowedChatState | null>(null);
  const [loadingMoreBefore, setLoadingMoreBefore] = createSignal(false);
  const [workspaceFullscreen, setWorkspaceFullscreen] = createSignal(false);
  let tokenUsageRefreshVersion = 0;

  const scope = createMemo<'character' | 'group' | null>(() => {
    const rawScope = params.scope;
    return rawScope === 'character' || rawScope === 'group' ? rawScope : null;
  });
  const rawId = createMemo(() => (params.id ? decodeURIComponent(params.id) : ''));
  const avatarUrl = createMemo(() => (scope() === 'character' && rawId() ? `${rawId()}.png` : ''));
  const requestedFileName = createMemo(() => ensureJsonlName(decodeURIComponent(searchParams.file ?? '')));
  const createRequest = createMemo(() => (searchParams.create ?? '').trim());
  const joinRequest = createMemo(() => (searchParams.join ?? '').trim());

  const settingsQuery = createQuery(() => ({ queryKey: ['settings'], queryFn: () => coreApiClient.getSettings() }));
  const renderersQuery = createQuery(() => ({
    queryKey: ['renderer-packages'],
    queryFn: () => nativeBridge.chatTransport.listRendererPackages(),
    staleTime: 60_000,
  }));
  const presetNamesQuery = createQuery(() => ({
    queryKey: ['preset-names', 'openai'],
    queryFn: () => coreApiClient.presets.list('openai'),
  }));
  const sessionCatalog = createChatSessionCatalogController();
  const characterQuery = createQuery(() => ({
    queryKey: ['character', avatarUrl()],
    enabled: Boolean(scope() === 'character' && avatarUrl()),
    queryFn: () => coreApiClient.characters.get(avatarUrl()),
  }));
  const groupQuery = createQuery(() => ({
    queryKey: ['group', rawId()],
    enabled: Boolean(scope() === 'group' && rawId()),
    queryFn: () => coreApiClient.groups.get(rawId()),
  }));

  const currentScopeName = createMemo(() => {
    if (scope() === 'character') {
      return characterQuery.data?.name ?? rawId();
    }
    if (scope() === 'group') {
      return groupQuery.data?.name ?? rawId();
    }
    return '';
  });

  const currentFileName = createMemo(() => {
    if (scope() === 'character') {
      return requestedFileName();
    }

    if (scope() === 'group') {
      if (requestedFileName()) {
        return requestedFileName();
      }

      const fallback = String(groupQuery.data?.chat_id || '').trim();
      return fallback ? ensureJsonlName(fallback) : '';
    }

    return '';
  });

  const currentGroupChatId = createMemo(() => (scope() === 'group' ? stripJsonlSuffix(currentFileName()) : ''));
  const currentSessionKey = createMemo(() => {
    if (!scope() || !rawId() || !currentFileName()) {
      return '';
    }

    return `${scope()}:${rawId()}:${currentFileName()}`;
  });
  const currentWindowTarget = createMemo<WindowedChatTarget | null>(() => {
    if (scope() === 'character' && rawId() && avatarUrl() && currentFileName()) {
      return {
        kind: 'character',
        characterName: rawId(),
        avatarUrl: avatarUrl(),
        fileName: currentFileName(),
      };
    }

    if (scope() === 'group' && currentGroupChatId()) {
      return {
        kind: 'group',
        id: currentGroupChatId(),
      };
    }

    return null;
  });
  const hasAvailableSessions = createMemo(() => (sessionCatalog.sessionsQuery.data?.length ?? 0) > 0);

  createEffect(() => {
    if (sessionCatalog.sessionsQuery.isPending || currentSessionKey() || pendingNewFile() || createRequest() || joinRequest()) {
      return;
    }

    const firstSession = sessionCatalog.sessionsQuery.data?.[0];
    if (!firstSession) {
      return;
    }

    navigate(buildSessionHref(firstSession), { replace: true });
  });

  const [lastCreateRequest, setLastCreateRequest] = createSignal('');

  createEffect(() => {
    if (!createRequest()) {
      if (lastCreateRequest()) {
        setLastCreateRequest('');
      }
      return;
    }

    if (scope() !== 'character' || !rawId()) {
      return;
    }

    const key = `${rawId()}:${createRequest()}`;
    if (key === lastCreateRequest()) {
      return;
    }

    setLastCreateRequest(key);

    if (createRequest() === 'single' || createRequest() === 'multiplayer') {
      void createCharacterChatWithMode(createRequest() as 'single' | 'multiplayer');
      return;
    }

    void createNewCharacterChat();
  });

  const [lastJoinRequest, setLastJoinRequest] = createSignal('');

  createEffect(() => {
    if (joinRequest() !== 'room') {
      if (lastJoinRequest()) {
        setLastJoinRequest('');
      }
      return;
    }

    if (scope() !== 'character' || !rawId() || characterQuery.isPending || !characterQuery.data) {
      return;
    }

    const key = `${rawId()}:${currentFileName()}:${joinRequest()}`;
    if (key === lastJoinRequest()) {
      return;
    }

    setLastJoinRequest(key);
    setJoinRoomOpen(true);
  });

  const characterChatQuery = createQuery(() => ({
    queryKey: ['character-chat', avatarUrl(), currentFileName()],
    enabled: Boolean(scope() === 'character' && avatarUrl() && currentFileName() && pendingNewFile() !== currentFileName()),
    queryFn: () => loadInitialChatWindow({
      kind: 'character',
      characterName: rawId(),
      avatarUrl: avatarUrl(),
      fileName: currentFileName(),
    }),
  }));
  const groupChatQuery = createQuery(() => ({
    queryKey: ['group-chat', rawId(), currentGroupChatId()],
    enabled: Boolean(scope() === 'group' && rawId() && currentGroupChatId()),
    queryFn: () => loadInitialChatWindow({
      kind: 'group',
      id: currentGroupChatId(),
    }),
  }));

  const currentMessages = createMemo(() => getChatMessages(store.draftPayload()));
  const currentSessionState = createMemo(() => resolveSessionState(store.draftPayload()));
  const currentSessionBindings = createMemo(() => resolveSessionBindings(store.draftPayload()));
  const currentUiRendererSettings = createMemo(() => readUiRendererSettings(settingsQuery.data));
  const rendererEnvironment = createMemo(() => detectRendererEnvironment());
  const availableRenderers = createMemo(() => listKnownRenderers((renderersQuery.data ?? []) as RendererManifest[]));
  const resolvedRenderer = createMemo(() => resolveRendererSelection({
    installedRenderers: ((renderersQuery.data ?? []) as RendererManifest[])
      .filter((renderer) => currentUiRendererSettings().iframe_dev_mode_enabled || renderer.mode !== 'iframe-dev-v1'),
    settings: currentUiRendererSettings(),
    sessionBinding: currentSessionState().renderer,
    env: rendererEnvironment(),
  }));
  const rendererTheme = createMemo(() => readHostThemeTokens(resolvedRenderer().manifest));
  const apiProfiles = createMemo(() => getApiProfiles(settingsQuery.data));
  const currentBoundApiProfile = createMemo(() => findApiProfile(settingsQuery.data, currentSessionBindings().api_profile_id));
  const missingBoundWorldInfoNames = createMemo(() => currentSessionBindings().world_info_names.filter((name) => !(settingsQuery.data?.world_names ?? []).includes(name)));
  const worldInfoBindingSummary = createMemo(() => {
    const count = currentSessionBindings().world_info_names.length;
    if (count === 0) {
      return locale.chats.bindingNone;
    }

    const summary = locale.chats.bindingCountSummary.replace('{count}', String(count));
    return missingBoundWorldInfoNames().length > 0 ? `${summary} ? ${locale.chats.bindingMissingResource}` : summary;
  });
  const presetBindingSummary = createMemo(() => {
    const presetName = currentSessionBindings().preset_ref?.name;
    if (!presetName) {
      return locale.chats.bindingNone;
    }

    return presetName;
  });
  const apiProfileBindingSummary = createMemo(() => {
    if (!currentSessionBindings().api_profile_id) {
      return locale.chats.bindingGlobalDefault;
    }

    return currentBoundApiProfile()?.name || locale.chats.bindingMissingResource;
  });
  const savedProviderDraft = createMemo(() => readProviderSettings(settingsQuery.data));
  const activeSessionSummary = createMemo<ChatSessionSummary | null>(() => {
    const fromList = (sessionCatalog.sessionsQuery.data ?? []).find((session) => buildSessionKey(session) === currentSessionKey());
    if (fromList) {
      return fromList;
    }

    const currentScope = scope();
    if (!currentScope || !rawId() || !currentFileName()) {
      return null;
    }

    return {
      source_type: currentScope,
      scope_id: rawId(),
      scope_name: currentScopeName(),
      file_name: currentFileName(),
      preview_message: '',
      last_mes: 0,
      message_count: currentMessages().length,
      session_mode: currentSessionState().mode,
      avatar: avatarUrl(),
      group_id: currentScope === 'group' ? rawId() : '',
    };
  });

  const isMultiplayerSession = createMemo(() => currentSessionState().mode === 'multiplayer');
  const isCharacterSession = createMemo(() => scope() === 'character');
  const canManageMultiplayer = createMemo(() => isCharacterSession() && isMultiplayerSession());
  const bindingReadOnly = createMemo(() => isMultiplayerSession() && roomState().connectionState !== 'idle' && !roomState().isHost);
  const allowGenerateReply = createMemo(() => isMultiplayerSession() && roomState().connectionState === 'hosting');
  const allowStopGenerate = createMemo(() => !isMultiplayerSession() || roomState().isHost);
  const roomStatus = createMemo(() => roomStatusSchema.parse({
    state: roomState().connectionState,
    room_id: roomState().roomId || null,
    address: roomState().address || null,
    participant_id: roomState().localParticipantId || null,
    nickname: roomState().nickname || null,
    is_host: roomState().isHost,
  }));
  const roomSummary = createMemo(() => {
    if (!isMultiplayerSession()) {
      return '\u5f53\u524d\u4f1a\u8bdd\u672a\u542f\u7528\u8054\u673a\u3002';
    }

    switch (roomState().connectionState) {
      case 'idle':
        return '\u672a\u8fde\u63a5\uff0c\u53ef\u542f\u52a8\u623f\u95f4\u6216\u7b49\u5f85\u52a0\u5165\u3002';
      case 'joining':
        return '\u6b63\u5728\u7b49\u5f85\u623f\u4e3b\u5ba1\u6279\u3002';
      case 'hosting':
        return `\u623f\u4e3b \u00b7 ${currentScopeName() || activeSessionSummary()?.scope_name || '\u5f53\u524d\u4f1a\u8bdd'}`;
      case 'joined':
        return `\u5df2\u52a0\u5165 \u00b7 ${roomState().address || '\u8fdc\u7a0b\u623f\u95f4'}`;
      default:
        return '\u8054\u673a\u72b6\u6001\u672a\u77e5\u3002';
    }
  });

  createEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    const providerDraft = savedProviderDraft();
    if (!store.providerInitialized()) {
      store.setProviderDraft(providerDraft);
      store.setProviderInitialized(true);
      setModelStatusPayload({});
      setModelOptions([]);
      return;
    }

    const currentDraft = store.providerDraft();
    if (!currentDraft.model && providerDraft.model) {
      store.setProviderDraft(providerDraft);
      setModelStatusPayload({});
      setModelOptions([]);
    }
  });

  createEffect(() => {
    const sessionKey = currentSessionKey();
    const loadedKey = loadedSessionKey();
    const payload = store.draftPayload();
    const composer = store.composer();
    const fallbackDraft = buildRequestDraft();
    const userName = currentUserName();
    const assistantName = currentAssistantName();
    const character = characterQuery.data ?? null;
    const group = groupQuery.data ?? null;
    const multiplayer = isMultiplayerSession();
    const windowState = chatWindowState();
    const windowTarget = currentWindowTarget();

    if (!sessionKey || loadedKey !== sessionKey) {
      tokenUsageRefreshVersion += 1;
      setTokenUsage(null);
      return;
    }

    if (store.abortController()) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshTokenUsagePreview({
        payload,
        composer,
        fallbackDraft,
        userName,
        assistantName,
        character,
        group,
        multiplayer,
        sessionKey,
        windowState,
        windowTarget,
      });
    }, 180);

    onCleanup(() => window.clearTimeout(timer));
  });

  createEffect(() => {
    if (scope() === 'character' && !currentFileName() && !pendingNewFile()) {
      store.setDraftPayload([]);
      store.setRenameText('');
      store.setEditingMessage(null);
      store.setDirty(false);
      store.setPersistedSession(false);
      setChatWindowState(null);
      setLoadedSessionKey('');
    }
  });

  createEffect(() => {
    const key = currentSessionKey();
    if (scope() !== 'character' || !key || pendingNewFile() === currentFileName()) {
      return;
    }
    const result = characterChatQuery.data;
    const payload = result?.payload;
    if (!payload || loadedSessionKey() === key) {
      return;
    }

    const state = result?.state ?? null;
    store.setDraftPayload(payload);
    store.setRenameText(currentFileName());
    store.setEditingMessage(null);
    store.setDirty(false);
    store.setPersistedSession(true);
    setChatWindowState(state);
    setLoadedSessionKey(key);
  });

  createEffect(() => {
    const key = currentSessionKey();
    if (scope() !== 'group' || !key) {
      return;
    }
    const result = groupChatQuery.data;
    const payload = result?.payload;
    if (!payload || loadedSessionKey() === key) {
      return;
    }

    const state = result?.state ?? null;
    store.setDraftPayload(payload);
    store.setRenameText(currentFileName());
    store.setEditingMessage(null);
    store.setDirty(false);
    store.setPersistedSession(true);
    setChatWindowState(state);
    setLoadedSessionKey(key);
  });

  createEffect(on(
    () => [
      currentSessionKey(),
      loadedSessionKey(),
      chatWindowState()?.startIndex ?? -1,
      chatWindowState()?.savedMessageCount ?? currentMessages().length,
    ],
    ([key, loadedKey]) => {
      if (!key || loadedKey !== key) {
        return;
      }

      if (store.abortController()) {
        return;
      }

      const currentPayload = untrack(() => store.draftPayload());
      void (async () => {
        const projectedPayload = await applyVisibleRegexProjection(currentPayload, untrack(chatWindowState));
        if (untrack(() => store.draftPayload()) !== currentPayload) {
          return;
        }
        if (projectedPayload !== currentPayload) {
          store.setDraftPayload(projectedPayload);
        }
      })();
    },
    { defer: true },
  ));

  createEffect(() => {
    if (!editorOpen()) {
      return;
    }

    const active = activeSessionSummary();
    if (active && buildSessionKey(active) === currentSessionKey()) {
      setEditorSession(active);
    }
  });

  createEffect(() => {
    if (!editorOpen()) {
      return;
    }

    const binding = currentSessionState().renderer;
    setEditorRendererMode(binding.mode);
    setEditorRendererId(binding.renderer_id ?? BUILTIN_NATIVE_RENDERER_ID);
  });

  useBeforeLeave((event) => {
    if (!store.dirty() || store.abortController() || event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    setTimeout(async () => {
      const shouldSave = window.confirm(locale.chats.dirtyLeaveConfirm);
      if (shouldSave) {
        const saved = await savePayload(store.draftPayload(), { notifySuccess: true });
        if (saved) {
          event.retry(true);
        }
        return;
      }

      if (window.confirm(locale.chats.discardLeaveConfirm)) {
        event.retry(true);
      }
    }, 0);
  });

  createEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!store.dirty() || store.abortController()) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    onCleanup(() => window.removeEventListener('beforeunload', handler));
  });

  async function refreshModelStatus(draft = store.providerDraft()): Promise<void> {
    setLoadingModels(true);
    try {
      const payload = await coreApiClient.generation.listModels(draft.chat_completion_source, {
        reverse_proxy: draft.reverse_proxy,
        proxy_password: draft.proxy_password,
        custom_url: draft.custom_url,
        custom_include_headers: draft.custom_include_headers,
        bypass_status_check: draft.bypass_status_check,
      });
      setModelStatusPayload(payload);
      setModelOptions(extractModels(payload));
    } catch (error) {
      const message = getErrorMessage(error);
      setModelStatusPayload({ error: message });
      setModelOptions([]);
      toast.push({ title: locale.chats.modelLoadFailed, description: message, tone: 'danger' });
    } finally {
      setLoadingModels(false);
    }
  }

  async function refreshTokenUsagePreview(input: {
    payload: ChatPayload;
    composer: string;
    fallbackDraft: ChatProviderDraft;
    userName: string;
    assistantName: string;
    character: Record<string, unknown> | null;
    group: Record<string, unknown> | null;
    multiplayer: boolean;
    sessionKey: string;
    windowState: WindowedChatState | null;
    windowTarget: WindowedChatTarget | null;
  }): Promise<void> {
    const refreshVersion = ++tokenUsageRefreshVersion;

    try {
      const basePayload = input.windowTarget && input.windowState?.hasMoreBefore
        ? await hydrateCompleteChatPayload(input.windowTarget, input.payload, input.windowState)
        : input.payload;
      const trimmedComposer = input.composer.trim();
      const previewPayload = !input.multiplayer && trimmedComposer
        ? [...basePayload, createUserChatMessage(input.userName, trimmedComposer)] as ChatPayload
        : basePayload;
      const composeMessageCount = getChatMessages(previewPayload).length;
      const composeTotalMessages = previewPayload === input.payload
        ? Math.max(input.windowState?.savedMessageCount ?? composeMessageCount, composeMessageCount)
        : composeMessageCount;
      const composeStartIndex = previewPayload === input.payload
        ? Math.max(0, input.windowState?.startIndex ?? Math.max(0, composeTotalMessages - composeMessageCount))
        : 0;
      const prepared = await coreApiClient.generation.prepareRequest({
        payload: previewPayload,
        mode: 'reply',
        fallbackDraft: input.fallbackDraft,
        userName: input.userName,
        assistantName: input.assistantName,
        character: input.character,
        group: input.group,
        hydrated: previewPayload !== input.payload,
        totalMessages: composeTotalMessages,
        startIndex: composeStartIndex,
      });

      if (refreshVersion !== tokenUsageRefreshVersion || currentSessionKey() !== input.sessionKey) {
        return;
      }

      setTokenUsage(prepared.usage);
    } catch {
      if (refreshVersion === tokenUsageRefreshVersion && currentSessionKey() === input.sessionKey) {
        setTokenUsage(null);
      }
    }
  }

  async function invalidateChatQueries(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['character-chat'] }),
      queryClient.invalidateQueries({ queryKey: ['group-chat'] }),
    ]);
  }

  function currentUserName(): string {
    return settingsQuery.data?.name1 ?? locale.chats.defaultUserName;
  }

  function currentAssistantName(): string {
    return activeSessionSummary()?.scope_name || currentScopeName() || locale.chats.defaultAssistantName;
  }

  async function resolveCurrentProjectionPresetDraft(): Promise<Record<string, unknown> | null> {
    const bindings = currentSessionBindings();
    const presetName = String(bindings.preset_ref?.name ?? '').trim();
    if (!presetName) {
      return null;
    }

    try {
      const resolved = await resolveBoundPreset(bindings);
      return resolved?.preset ?? null;
    } catch {
      return null;
    }
  }

  function resolveRegexWindowMetrics(payload: ChatPayload, state: WindowedChatState | null): { totalMessages: number; startIndex: number } {
    const loadedMessageCount = getChatMessages(payload).length;
    const totalMessages = state?.savedMessageCount ?? loadedMessageCount;
    const startIndex = state?.startIndex ?? Math.max(0, totalMessages - loadedMessageCount);
    return { totalMessages, startIndex };
  }

  async function applyVisibleRegexProjection(
    payload: ChatPayload,
    state: WindowedChatState | null,
  ): Promise<ChatPayload> {
    const { totalMessages, startIndex } = resolveRegexWindowMetrics(payload, state);
    const presetDraft = await resolveCurrentProjectionPresetDraft();

    return coreApiClient.generation.projectDisplay({
      payload,
      presetDraft,
      startIndex,
      totalMessages,
      userName: currentUserName(),
      assistantName: currentAssistantName(),
      groupName: scope() === 'group' ? groupQuery.data?.name ?? currentScopeName() : '',
      isGroup: scope() === 'group',
    });
  }

  async function applyAssistantRegexProjection(
    payload: ChatPayload,
    messageIndex: number,
    options?: {
      persistCanonical?: boolean;
      reason?: 'default' | 'edit';
      sourceTextOverride?: string | null;
    },
  ): Promise<ChatPayload> {
    const state = chatWindowState();
    const { totalMessages, startIndex } = resolveRegexWindowMetrics(payload, state);
    const message = getPayloadMessage(payload, messageIndex);
    if (!message || message.is_user || message.is_system) {
      return payload;
    }
    const presetDraft = await resolveCurrentProjectionPresetDraft();

    return coreApiClient.generation.projectDisplay({
      payload,
      presetDraft,
      startIndex,
      totalMessages,
      targetMessageIndex: messageIndex,
      persistCanonical: options?.persistCanonical ?? false,
      sourceTextOverride: options?.sourceTextOverride ?? null,
      reason: options?.reason ?? 'default',
      userName: currentUserName(),
      assistantName: currentAssistantName(),
      groupName: scope() === 'group' ? groupQuery.data?.name ?? currentScopeName() : '',
      isGroup: scope() === 'group',
    });
  }

  function resolveAssistantSourceText(payload: ChatPayload, messageIndex: number): string {
    const message = getPayloadMessage(payload, messageIndex);
    if (!message || message.is_user || message.is_system) {
      return '';
    }
    return buildMessageSourceContent(message);
  }

  async function finalizeAssistantProjectionFromRawSource(
    payload: ChatPayload,
    messageIndex: number,
    rawSourceText: string,
  ): Promise<ChatPayload> {
    return applyAssistantRegexProjection(payload, messageIndex, {
      persistCanonical: true,
      sourceTextOverride: rawSourceText,
    });
  }

  function logGeneration(stage: string, detail?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const payload = {
      stage,
      timestamp,
      scope: scope(),
      sessionKey: currentSessionKey(),
      ...detail,
    };
    console.info(`[generation] ${timestamp} ${stage}`, payload);
    if (import.meta.env.DEV) {
      void coreApiClient.debug.log(`${timestamp} ${stage}`, payload);
    }
  }

  function ensureMultiplayerHostReady(action: 'generate' | 'edit'): boolean {
    if (!isMultiplayerSession()) {
      return true;
    }

    if (roomState().connectionState !== 'hosting') {
      toast.push({
        title: action === 'generate'
          ? '\u8bf7\u5148\u542f\u52a8\u8054\u673a\u623f\u95f4\u540e\u518d\u751f\u6210\u56de\u590d\u3002'
          : '\u8bf7\u5148\u542f\u52a8\u8054\u673a\u623f\u95f4\u540e\u518d\u4fee\u6539\u4f1a\u8bdd\u3002',
        tone: 'danger',
      });
      return false;
    }

    if (!roomState().isHost) {
      toast.push({
        title: action === 'generate'
          ? '\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u751f\u6210\u56de\u590d\u3002'
          : '\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u4fee\u6539\u8054\u673a\u4f1a\u8bdd\u5386\u53f2\u3002',
        tone: 'danger',
      });
      return false;
    }

    return true;
  }

  function ensureMultiplayerEditable(): boolean {
    if (bindingReadOnly()) {
      toast.push({ title: '\u5f53\u524d\u8054\u673a\u4f1a\u8bdd\u4ec5\u623f\u4e3b\u53ef\u4fee\u6539\u3002', tone: 'danger' });
      return false;
    }

    return true;
  }

  async function broadcastSnapshot(payload = store.draftPayload()): Promise<void> {
    if (!roomState().isHost || !isMultiplayerSession() || !currentSessionKey() || scope() !== 'character' || !currentFileName()) {
      return;
    }

    await nativeBridge.multiplayer.broadcastSnapshot({
      room_id: roomState().roomId || currentSessionKey(),
      session_key: currentSessionKey(),
      session_file: currentFileName(),
      scope_id: rawId(),
      scope_name: currentScopeName(),
      bindings: currentSessionBindings(),
      payload,
    });
  }

  async function startHostingCurrentSession(): Promise<void> {
    if (!isCharacterSession() || !isMultiplayerSession() || !currentSessionKey() || !currentFileName() || !avatarUrl()) {
      toast.push({ title: locale.chats.multiplayerSessionInvalid, tone: 'danger' });
      return;
    }

    const payload = ensureConversationPayload();
    if (!store.persistedSession()) {
      const saved = await savePayload(payload, { notifySuccess: false });
      if (!saved) {
        return;
      }
    }

    const currentCharacter = characterQuery.data;
    if (!currentCharacter) {
      toast.push({ title: locale.chats.multiplayerSessionInvalid, tone: 'danger' });
      return;
    }

    try {
      const status = await nativeBridge.multiplayer.startHost({
        room_id: currentSessionKey(),
        session_key: currentSessionKey(),
        scope_id: rawId(),
        scope_name: currentScopeName() || currentAssistantName(),
        session_file: currentFileName(),
        nickname: currentUserName(),
        character_name: currentAssistantName(),
        character_avatar: avatarUrl() ?? '',
        character_card: currentCharacter,
      });

      setRoomState((current) => applyRoomStatus(current, roomStatusSchema.parse(status)));
      await broadcastSnapshot(payload);
      setRoomPanelOpen(true);
    } catch (error) {
      toast.push({ title: '\u542f\u52a8\u8054\u673a\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function stopOrLeaveRoom(): Promise<void> {
    try {
      const status = roomState().isHost
        ? await nativeBridge.multiplayer.stopHost()
        : await nativeBridge.multiplayer.leave();
      setRoomState((current) => applyRoomStatus(current, roomStatusSchema.parse(status)));
      setRoomPanelOpen(false);
    } catch (error) {
      toast.push({ title: roomState().isHost ? '\u52a0\u5165\u623f\u95f4\u5931\u8d25' : '\u52a0\u5165\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function joinRoom(input: { address: string; nickname: string }): Promise<void> {
    if (!input.address.trim() || !input.nickname.trim()) {
      toast.push({ title: '\u8bf7\u8f93\u5165\u623f\u95f4\u5730\u5740\u548c\u6635\u79f0\u3002', tone: 'danger' });
      return;
    }

    const currentCharacter = characterQuery.data;
    if (!currentCharacter) {
      toast.push({ title: locale.chats.multiplayerSessionInvalid, tone: 'danger' });
      return;
    }

    try {
      const status = await nativeBridge.multiplayer.join({
        address: input.address.trim(),
        nickname: input.nickname.trim(),
        character_name: currentAssistantName(),
        character_avatar: avatarUrl() ?? '',
        character_card: currentCharacter,
      });
      setJoinRoomOpen(false);
      setRoomState((current) => applyRoomStatus(current, roomStatusSchema.parse(status)));
      setRoomPanelOpen(true);
    } catch (error) {
      toast.push({ title: '\u52a0\u5165\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function approveJoinRequest(requestId: string, accept: boolean): Promise<void> {
    try {
      const status = await nativeBridge.multiplayer.approveJoin({ request_id: requestId, accept });
      setRoomState((current) => applyRoomStatus(current, roomStatusSchema.parse(status)));
    } catch (error) {
      toast.push({ title: accept ? '\u542f\u52a8\u8054\u673a\u623f\u95f4\u5931\u8d25' : '\u542f\u52a8\u8054\u673a\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function collectGreetingOptions(): string[] {
    const character = characterQuery.data;
    if (!character) {
      return [];
    }
    const options: string[] = [];
    const firstMessage = String(character.first_mes ?? '').trim();
    if (firstMessage) {
      options.push(firstMessage);
    }
    const alternates = Array.isArray(character.alternate_greetings) ? character.alternate_greetings : [];
    for (const greeting of alternates) {
      const trimmed = String(greeting ?? '').trim();
      if (trimmed) {
        options.push(trimmed);
      }
    }
    return options;
  }

  function resetGreetingState(): void {
    setGreetingModalOpen(false);
    setPendingGreetingMode(null);
    setGreetingOptions([]);
  }

  async function createCharacterChatWithGreeting(mode: 'single' | 'multiplayer', greeting: string): Promise<void> {
    const fileName = `${currentScopeName() || locale.chats.defaultChatName} - ${createCreateDate()}.jsonl`;
    await guardDirtyAction(async () => {
      let payload = coreApiClient.chats.createEmpty(currentAssistantName(), currentUserName());
      if (greeting) {
        payload = [...payload, createAssistantChatMessage(currentAssistantName(), greeting)];
      }
      if (mode === 'multiplayer') {
        payload = withSessionState(payload, createDefaultMultiplayerSessionMetadata(rawId(), fileName));
      }
      setPendingNewFile(fileName);
      setLoadedSessionKey(`character:${rawId()}:${fileName}`);
      setChatWindowState(null);
      store.setDraftPayload(payload);
      store.setRenameText(fileName);
      store.setEditingMessage(null);
      store.setDirty(false);
      store.setPersistedSession(false);
      const joinQuery = joinRequest() === 'room' ? '&join=room' : '';
      navigate(`/chats/character/${encodeURIComponent(rawId())}?file=${encodeURIComponent(fileName)}${joinQuery}`);
      setCreateModeOpen(false);
      if (mode === 'multiplayer') {
        setRoomPanelOpen(true);
      }
    });
  }

  async function createCharacterChatWithMode(mode: 'single' | 'multiplayer'): Promise<void> {
    if (!isCharacterSession()) {
      return;
    }
    if (mode === 'single' && joinRequest() === 'room') {
      await createCharacterChatWithGreeting('single', '');
      return;
    }
    const greetings = collectGreetingOptions();
    if (greetings.length > 1) {
      setGreetingOptions(greetings);
      setPendingGreetingMode(mode);
      setGreetingModalOpen(true);
      setCreateModeOpen(false);
      return;
    }
    const greeting = greetings[0] ?? '';
    await createCharacterChatWithGreeting(mode, greeting);
  }

  function handleGreetingSelect(greeting: string): void {
    const mode = pendingGreetingMode() ?? 'single';
    resetGreetingState();
    void createCharacterChatWithGreeting(mode, greeting);
  }

  async function createMultiplayerCopy(): Promise<void> {
    if (!isCharacterSession() || !currentFileName() || !avatarUrl()) {
      return;
    }

    const sourcePayload = ensureConversationPayload();
    const sourceState = resolveSessionState(sourcePayload);
    const nextFile = `${currentScopeName() || locale.chats.defaultChatName} ${locale.chats.defaultRoomName} - ${createCreateDate()}.jsonl`;
    const payload = withSessionState(sourcePayload, {
      ...sourceState,
      mode: 'multiplayer',
      multiplayer: {
        created_from: {
          scope: 'character',
          scope_id: rawId(),
          file_name: currentFileName(),
        },
        transcript_mode: 'player-bubbles-host-concat-v1',
      },
    });

    await guardDirtyAction(async () => {
      await coreApiClient.chats.saveCharacter(avatarUrl(), nextFile, payload);
      await invalidateChatQueries();
      navigate(`/chats/character/${encodeURIComponent(rawId())}?file=${encodeURIComponent(nextFile)}`);
      setEditorOpen(false);
      setRoomPanelOpen(true);
    });
  }

  async function submitMultiplayerContribution(): Promise<void> {
    const content = store.composer().trim();
    if (!content) {
      toast.push({ title: locale.chats.appendUserFirst, tone: 'danger' });
      return;
    }
    if (roomState().connectionState !== 'hosting' && roomState().connectionState !== 'joined') {
      toast.push({ title: locale.chats.multiplayerConnectionRequired, tone: 'danger' });
      return;
    }

    try {
      await nativeBridge.multiplayer.submitContribution({ content });
      store.setComposer('');
    } catch (error) {
      toast.push({ title: '\u542f\u52a8\u8054\u673a\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function withdrawContributionAt(messageIndex: number): Promise<void> {
    const message = getPayloadMessage(store.draftPayload(), messageIndex);
    const meta = resolveMultiplayerMessageMeta(message);
    if (!meta?.contribution_id) {
      return;
    }

    try {
      await nativeBridge.multiplayer.withdrawContribution({ contribution_id: meta.contribution_id });
    } catch (error) {
      toast.push({ title: '\u542f\u52a8\u8054\u673a\u623f\u95f4\u5931\u8d25', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function handleIncomingSnapshot(snapshot: RoomSnapshot): Promise<void> {
    const normalizedPayload = withSessionState(snapshot.payload, {
      version: 1,
      mode: 'multiplayer',
      bindings: snapshot.bindings,
      renderer: {
        mode: 'inherit',
        renderer_id: null,
      },
      multiplayer: {
        created_from: {
          scope: 'character',
          scope_id: snapshot.scope_id,
          file_name: snapshot.session_file,
        },
        transcript_mode: 'player-bubbles-host-concat-v1',
      },
    });

    if (roomState().isHost) {
      return;
    }

    const targetFile = currentSessionKey() && currentSessionState().mode === 'multiplayer' && scope() === 'character' && rawId() === snapshot.scope_id && currentFileName()
      ? currentFileName()
      : `${snapshot.scope_name || locale.chats.defaultRoomName}-room-${createCreateDate()}.jsonl`;

    await coreApiClient.chats.saveCharacter(`${snapshot.scope_id}.png`, targetFile, normalizedPayload);
    setPendingNewFile('');
    setLoadedSessionKey(`character:${snapshot.scope_id}:${targetFile}`);
    setChatWindowState(null);
    store.setDraftPayload(normalizedPayload);
    store.setRenameText(targetFile);
    store.setPersistedSession(true);
    store.setDirty(false);
    navigate(`/chats/character/${encodeURIComponent(snapshot.scope_id)}?file=${encodeURIComponent(targetFile)}`);
  }

  createEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void nativeBridge.multiplayer.listenEvents((payload) => {
      if (disposed) {
        return;
      }

      const { state, effects, ignored } = applyMultiplayerEnvelope(roomState(), multiplayerEnvelopeSchema.parse(payload));
      if (ignored) {
        return;
      }

      setRoomState(state);

      if (effects.roomError) {
        toast.push({ title: effects.roomError, tone: 'danger' });
      }
      if (effects.joinRejectedMessage) {
        toast.push({ title: effects.joinRejectedMessage, tone: 'danger' });
      }
      if (effects.snapshot) {
        void handleIncomingSnapshot(roomSnapshotSchema.parse(effects.snapshot));
      }
      if (effects.bindingsUpdated && !state.isHost) {
        void applyPayloadChange(withSessionBindings(ensureConversationPayload(), effects.bindingsUpdated), { autoPersist: true });
      }
      if (effects.contributionAdded) {
        const nextPayload = appendMultiplayerContribution(ensureConversationPayload(), effects.contributionAdded);
        void (async () => {
          await applyPayloadChange(nextPayload);
          if (state.isHost) {
            await broadcastSnapshot(nextPayload);
          }
        })();
      }
      if (effects.contributionWithdrawn) {
        const nextPayload = withdrawMultiplayerContribution(ensureConversationPayload(), effects.contributionWithdrawn.contribution_id);
        void (async () => {
          await applyPayloadChange(nextPayload);
          if (state.isHost) {
            await broadcastSnapshot(nextPayload);
          }
        })();
      }
      if (!state.isHost && effects.assistantStarted) {
        const basePayload = ensureConversationPayload();
        const { payload: nextPayload } = appendAssistantPlaceholderWithKey(basePayload, currentAssistantName(), effects.assistantStarted.assistant_message_key);
        void applyPayloadChange(nextPayload, { autoPersist: true });
      }
      if (!state.isHost && effects.assistantDelta) {
        const index = findMessageIndexBySendDate(ensureConversationPayload(), effects.assistantDelta.assistant_message_key);
        if (index >= 0 && (effects.assistantDelta.delta || effects.assistantDelta.reasoning)) {
          let nextPayload = ensureConversationPayload();
          if (effects.assistantDelta.delta) {
            nextPayload = appendContinuationToSwipe(nextPayload, index, effects.assistantDelta.delta);
          }
          if (effects.assistantDelta.reasoning) {
            nextPayload = appendReasoningToSwipe(nextPayload, index, effects.assistantDelta.reasoning, 'Reasoning');
          }
          void applyPayloadChange(nextPayload, { autoPersist: false });
        }
      }
      if (!state.isHost && (effects.assistantDone || effects.assistantAborted)) {
        const currentPayload = store.draftPayload();
        const assistantIndex = effects.assistantDone?.assistant_message_key || effects.assistantAborted?.assistant_message_key
          ? findMessageIndexBySendDate(currentPayload, effects.assistantDone?.assistant_message_key ?? effects.assistantAborted?.assistant_message_key ?? '')
          : -1;
        void (async () => {
          const finalizedPayload = assistantIndex >= 0
            ? await finalizeAssistantProjectionFromRawSource(
              currentPayload,
              assistantIndex,
              resolveAssistantSourceText(currentPayload, assistantIndex),
            )
            : currentPayload;
          store.setDraftPayload(finalizedPayload);
          await savePayload(finalizedPayload, { notifySuccess: false });
        })();
      }
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    });

    onCleanup(() => {
      disposed = true;
      unlisten?.();
    });
  });

  function openBindingOverlay(tab: SessionBindingTab): void {
    setBindingOverlayTab(tab);
    setBindingOverlayOpen(true);
  }

  async function saveSessionBindings(bindings: SessionBindings): Promise<void> {
    if (bindingReadOnly()) {
      toast.push({ title: '\u5f53\u524d\u8054\u673a\u4f1a\u8bdd\u4ec5\u623f\u4e3b\u53ef\u4fee\u6539\u7ed1\u5b9a\u3002', tone: 'danger' });
      return;
    }

    if (savingBindings()) {
      return;
    }

    if (scope() === 'character') {
      if (!avatarUrl() || !currentFileName()) {
        toast.push({ title: locale.chats.chooseChatFile, tone: 'danger' });
        return;
      }
    } else if (scope() === 'group') {
      if (!currentGroupChatId()) {
        toast.push({ title: locale.chats.invalidCurrentGroup, tone: 'danger' });
        return;
      }
    } else {
      toast.push({ title: locale.chats.openContextFirst, tone: 'danger' });
      return;
    }

    setSavingBindings(true);
    try {
      const nextPayload = withSessionBindings(ensureConversationPayload(), bindings);
      const saved = await savePayload(nextPayload, { notifySuccess: false });
      if (!saved) {
        return;
      }

      if (roomState().isHost && isMultiplayerSession()) {
        await nativeBridge.multiplayer.broadcastBindings(bindings as unknown as Record<string, unknown>);
        await broadcastSnapshot(nextPayload);
      }
      setBindingOverlayOpen(false);
      toast.push({ title: locale.chats.bindingSaved, tone: 'success' });
    } catch (error) {
      toast.push({ title: locale.chats.bindingSaveFailed, description: getErrorMessage(error), tone: 'danger' });
    } finally {
      setSavingBindings(false);
    }
  }

  async function saveSessionRenderer(mode: 'inherit' | 'override', rendererId: string | null): Promise<void> {
    const nextPayload = withSessionRendererBinding(ensureConversationPayload(), {
      mode,
      renderer_id: mode === 'override' ? rendererId : null,
    });
    const saved = await savePayload(nextPayload, { notifySuccess: false });
    if (saved) {
      toast.push({ title: 'Renderer saved', tone: 'success' });
    }
  }

  async function resolveGenerationRequest(
    payload: ChatPayload,
    mode: 'reply' | 'regenerate' | 'continue',
    targetMessageIndex?: number,
    allowAutoRebind = true,
  ): Promise<{ request: GenerationRequest; presetDraft: Record<string, unknown> | null } | null> {
    logGeneration('resolve_request_start', {
      mode,
      bindings: resolveSessionState(payload).bindings,
    });

    async function attemptAutoRebind(missingName?: string | null): Promise<ChatPayload | null> {
      const names = presetNamesQuery.data ?? await coreApiClient.presets.list('openai');
      if (names.length !== 1) {
        return null;
      }
      const target = names[0];
      if (missingName && missingName === target) {
        return null;
      }
      const message = missingName
        ? locale.chats.bindingPresetReplaceSingle.replace('{missing}', missingName).replace('{target}', target)
        : locale.chats.bindingPresetAutoBindSingle.replace('{target}', target);
      if (!window.confirm(message)) {
        return null;
      }
      const nextBindings = {
        ...resolveSessionState(payload).bindings,
        preset_ref: { api_id: 'openai' as const, name: target },
      };
      const nextPayload = withSessionBindings(payload, nextBindings);
      await applyPayloadChange(nextPayload);
      return nextPayload;
    }

    function pushPreparedNotice(notice: Awaited<ReturnType<typeof coreApiClient.generation.prepareRequest>>['notices'][number]): void {
      const tone = notice.tone === 'danger' || notice.tone === 'warning' || notice.tone === 'success'
        ? notice.tone
        : 'default';

      if (notice.code === 'stream_unsupported') {
        toast.push({ title: locale.chats.streamUnsupported, tone: 'warning' });
        return;
      }

      if (notice.code === 'params_ignored') {
        toast.push({
          title: locale.chats.paramsIgnored.replace('{params}', notice.description ?? ''),
          tone: 'warning',
        });
        return;
      }

      if (notice.code === 'logit_bias_failed') {
        toast.push({
          title: locale.chats.logitBiasFailed,
          description: notice.description ?? undefined,
          tone: 'danger',
        });
        return;
      }

      if (notice.code === 'stop_strings_invalid') {
        toast.push({
          title: locale.chats.stopStringsInvalid,
          description: notice.description ?? undefined,
          tone: 'danger',
        });
        return;
      }

      if (notice.code === 'prompt_inherited') {
        toast.push({ title: PRESET_COPY.promptManagerInherited, tone: 'warning' });
        return;
      }

      if (notice.code === 'prompt_migrated_map') {
        toast.push({ title: PRESET_COPY.promptManagerMigratedMap, tone: 'default' });
        return;
      }

      if (notice.code === 'prompt_migrated') {
        toast.push({ title: PRESET_COPY.promptManagerMigrated, tone: 'default' });
        return;
      }

      if (notice.code === 'prompt_repaired') {
        toast.push({
          title: PRESET_COPY.promptManagerAutoRepaired,
          description: notice.description ?? undefined,
          tone,
        });
        return;
      }

      if (notice.code === 'preset_restored_default') {
        toast.push({
          title: locale.chats.bindingPresetRestored,
          description: notice.description ?? undefined,
          tone,
        });
        return;
      }

      if (notice.code === 'preset_normalized') {
        toast.push({
          title: notice.description ?? locale.chats.bindingPresetNormalized,
          tone,
        });
        return;
      }

      if (notice.title || notice.description) {
        toast.push({
          title: notice.title ?? notice.description ?? notice.code,
          description: notice.title && notice.description ? notice.description : undefined,
          tone,
        });
      }
    }

    const composePayload = currentWindowTarget() && chatWindowState()?.hasMoreBefore
      ? await hydrateCompleteChatPayload(currentWindowTarget()!, payload, chatWindowState()!)
      : payload;
    const composeTargetMessageIndex = typeof targetMessageIndex === 'number'
      ? targetMessageIndex + Math.max(0, getChatMessages(composePayload).length - getChatMessages(payload).length)
      : undefined;
    const composeMessageCount = getChatMessages(composePayload).length;
    const composeTotalMessages = composePayload === payload
      ? Math.max(chatWindowState()?.savedMessageCount ?? composeMessageCount, composeMessageCount)
      : composeMessageCount;
    const composeStartIndex = composePayload === payload
      ? Math.max(0, chatWindowState()?.startIndex ?? Math.max(0, composeTotalMessages - composeMessageCount))
      : 0;

    let prepared: Awaited<ReturnType<typeof coreApiClient.generation.prepareRequest>>;
    try {
      prepared = await coreApiClient.generation.prepareRequest({
        payload: composePayload,
        mode,
        targetMessageIndex: composeTargetMessageIndex,
        fallbackDraft: buildRequestDraft(),
        userName: currentUserName(),
        assistantName: currentAssistantName(),
        character: characterQuery.data ?? null,
        group: groupQuery.data ?? null,
        multiplayerParticipants: isMultiplayerSession()
          ? roomState().participants as unknown as Array<Record<string, unknown>>
          : [],
        hydrated: composePayload !== payload,
        totalMessages: composeTotalMessages,
        startIndex: composeStartIndex,
      });
    } catch (error) {
      logGeneration('prepare_request_failed', { message: getErrorMessage(error) });
      toast.push({ title: locale.chats.generationFailed, description: getErrorMessage(error), tone: 'danger' });
      return null;
    }

    setTokenUsage(prepared.usage);

    logGeneration('prepare_request_done', {
      hasRequest: Boolean(prepared.request),
      hasPresetDraft: Boolean(prepared.presetDraft),
      issueCount: prepared.issues.length,
      noticeCount: prepared.notices.length,
      promptRepaired: prepared.promptStatus.repaired,
      removedParamCount: prepared.requestStatus.removed.length,
      hydratedHistory: composePayload !== payload,
    });

    for (const issue of prepared.issues) {
      logGeneration('prepare_issue', { code: issue.code, severity: issue.severity, details: issue.details });
      if (issue.code === 'missing_world_info' && issue.severity === 'warning') {
        toast.push({ title: locale.chats.bindingMissingWorldInfo, description: issue.details?.join(', '), tone: 'default' });
        continue;
      }

      if (issue.code === 'missing_preset_binding') {
        if (allowAutoRebind) {
          const reboundPayload = await attemptAutoRebind(null);
          if (reboundPayload) {
            return resolveGenerationRequest(reboundPayload, mode, targetMessageIndex, false);
          }
        }
        toast.push({ title: locale.chats.bindingPresetRequired, tone: 'danger' });
        openBindingOverlay('preset');
        logGeneration('prepare_blocked_missing_preset_binding');
        return null;
      }

      if (issue.code === 'missing_preset') {
        if (allowAutoRebind) {
          const missingName = issue.details?.[0] ?? null;
          const reboundPayload = await attemptAutoRebind(missingName);
          if (reboundPayload) {
            return resolveGenerationRequest(reboundPayload, mode, targetMessageIndex, false);
          }
        }
        toast.push({ title: locale.chats.bindingMissingPreset, description: issue.details?.join(', '), tone: 'danger' });
        openBindingOverlay('preset');
        logGeneration('prepare_blocked_missing_preset', { missingName: issue.details?.[0] ?? null });
        return null;
      }

      if (issue.code === 'missing_api_profile') {
        toast.push({ title: locale.chats.bindingMissingApiProfile, description: issue.details?.join(', '), tone: 'danger' });
        openBindingOverlay('api-profile');
        logGeneration('prepare_blocked_missing_api_profile', { missingId: issue.details?.[0] ?? null });
        return null;
      }

      if (issue.code === 'missing_model') {
        toast.push({ title: locale.chats.noModel, tone: 'danger' });
        logGeneration('prepare_blocked_missing_model');
        return null;
      }

      if (issue.code === 'multi_swipe_unsupported') {
        toast.push({ title: locale.chats.presetMultiSwipeUnsupported, tone: 'danger' });
        logGeneration('prepare_blocked_multi_swipe');
        return null;
      }

      if (issue.code === 'multiplayer_round_incomplete') {
        toast.push({
          title: '当前联机回合仍有玩家未提交发言。',
          description: issue.details?.join('、') || undefined,
          tone: 'danger',
        });
        logGeneration('prepare_blocked_multiplayer_round_incomplete', { missingParticipants: issue.details ?? [] });
        return null;
      }

      if (issue.severity === 'blocking') {
        toast.push({
          title: locale.chats.generationFailed,
          description: issue.details?.join(', ') || issue.code,
          tone: 'danger',
        });
        logGeneration('prepare_blocked_generic_issue', { code: issue.code });
        return null;
      }
    }

    if (prepared.normalizedBindings && !bindingReadOnly()) {
      void applyPayloadChange(withSessionBindings(payload, prepared.normalizedBindings));
    }

    const bindingNotices = prepared.notices.filter((notice) => notice.code.startsWith('preset_'));
    const promptNotices = prepared.notices.filter((notice) => !notice.code.startsWith('preset_'));

    const bindingNoticeKey = bindingNotices.map((notice) => `${notice.code}:${notice.description ?? ''}:${notice.title ?? ''}`).join('|');
    if (bindingNoticeKey && bindingNoticeKey !== lastBindingNoticeKey()) {
      setLastBindingNoticeKey(bindingNoticeKey);
      bindingNotices.forEach(pushPreparedNotice);
    }

    const promptNoticeKey = promptNotices.map((notice) => `${notice.code}:${notice.description ?? ''}:${notice.title ?? ''}`).join('|');
    if (promptNoticeKey && promptNoticeKey !== lastPromptNoticeKey()) {
      setLastPromptNoticeKey(promptNoticeKey);
      promptNotices.forEach(pushPreparedNotice);
    }

    if (!prepared.request) {
      logGeneration('prepare_blocked_request_missing');
      return null;
    }

    return { request: prepared.request, presetDraft: prepared.presetDraft };

  }

  function ensureConversationPayload(): ChatPayload {
    return ensureChatPayload(currentAssistantName(), currentUserName(), store.draftPayload());
  }

  async function guardDirtyAction(action: () => void | Promise<void>): Promise<void> {
    if (!store.dirty() || store.abortController()) {
      await action();
      return;
    }

    const shouldSave = window.confirm(locale.chats.dirtyActionConfirm);
    if (shouldSave) {
      const saved = await savePayload(store.draftPayload(), { notifySuccess: true });
      if (!saved) {
        return;
      }
      await action();
      return;
    }

    if (window.confirm(locale.chats.discardActionConfirm)) {
      store.setDirty(false);
      await action();
    }
  }
  async function savePayload(payload: ChatPayload, options?: { notifySuccess?: boolean }): Promise<boolean> {
    try {
      const target = currentWindowTarget();
      if (!target) {
        toast.push({ title: locale.chats.openContextFirst, tone: 'danger' });
        return false;
      }

      const nextWindowState = await saveChatWindow(target, payload, chatWindowState(), true);
      if (target.kind === 'character') {
        setPendingNewFile('');
      }

      store.setDraftPayload(payload);
      setChatWindowState(nextWindowState);
      store.setDirty(false);
      store.setPersistedSession(true);
      if (options?.notifySuccess ?? false) {
        toast.push({ title: locale.chats.saved, tone: 'success' });
      }
      await invalidateChatQueries();
      return true;
    } catch (error) {
      toast.push({ title: locale.chats.saveFailed, description: getErrorMessage(error), tone: 'danger' });
      store.setDraftPayload(payload);
      store.setDirty(true);
      return false;
    }
  }

  async function applyPayloadChange(payload: ChatPayload, options?: { autoPersist?: boolean }): Promise<void> {
    const nextWindowState = markWindowStateDirty(store.draftPayload(), payload, chatWindowState());
    store.setDraftPayload(payload);
    setChatWindowState(nextWindowState);
    store.setEditingMessage(null);

    if (options?.autoPersist !== false && store.persistedSession()) {
      const saved = await savePayload(payload, { notifySuccess: false });
      if (!saved) {
        store.setDirty(true);
      }
      return;
    }

    store.setDirty(true);
  }

  async function loadMoreBefore(): Promise<void> {
    const target = currentWindowTarget();
    const windowState = chatWindowState();
    if (!target || !windowState?.hasMoreBefore || loadingMoreBefore()) {
      return;
    }

    setLoadingMoreBefore(true);
    try {
      const result = await loadChatWindowBefore(target, store.draftPayload(), windowState);
      store.setDraftPayload(await applyVisibleRegexProjection(result.payload, result.state));
      setChatWindowState(result.state);
    } catch (error) {
      toast.push({ title: 'Failed to load earlier messages', description: getErrorMessage(error), tone: 'danger' });
    } finally {
      setLoadingMoreBefore(false);
    }
  }

  async function openSession(session: ChatSessionSummary): Promise<void> {
    await guardDirtyAction(async () => {
      setPendingNewFile('');
      setLoadedSessionKey('');
      store.setPersistedSession(true);
      store.setEditingMessage(null);
      setChatWindowState(null);
      navigate(buildSessionHref(session));
    });
  }

  async function createNewCharacterChat(): Promise<void> {
    setCreateModeOpen(true);
  }

  async function handleCreateSession(): Promise<void> {
    if (scope() === 'character' && rawId()) {
      await createNewCharacterChat();
      return;
    }

    toast.push({ title: locale.chats.selectCharacterToStart, tone: 'warning' });
    navigate('/characters');
  }

  async function renameCurrentChat(): Promise<void> {
    const nextName = normalizeChatFileName(store.renameText());
    if (!nextName) {
      toast.push({ title: locale.chats.invalidFileName, tone: 'danger' });
      return;
    }

    if (scope() === 'character') {
      if (!currentFileName()) {
        return;
      }

      if (!store.persistedSession()) {
        setPendingNewFile(nextName);
        store.setRenameText(nextName);
        setLoadedSessionKey(`character:${rawId()}:${nextName}`);
        setChatWindowState(null);
        navigate(`/chats/character/${encodeURIComponent(rawId())}?file=${encodeURIComponent(nextName)}`);
        toast.push({ title: locale.chats.renamePending, tone: 'success' });
        return;
      }

      try {
        await coreApiClient.chats.renameCharacter(avatarUrl(), currentFileName(), nextName);
        store.setRenameText(nextName);
        setLoadedSessionKey('');
        setChatWindowState(null);
        navigate(`/chats/character/${encodeURIComponent(rawId())}?file=${encodeURIComponent(nextName)}`);
        toast.push({ title: locale.chats.renamed, tone: 'success' });
        await invalidateChatQueries();
      } catch (error) {
        toast.push({ title: locale.chats.renameFailed, description: getErrorMessage(error), tone: 'danger' });
      }
      return;
    }

    if (scope() === 'group') {
      if (!currentGroupChatId()) {
        toast.push({ title: locale.chats.invalidCurrentGroup, tone: 'danger' });
        return;
      }

      try {
        await coreApiClient.chats.renameGroup(currentGroupChatId(), nextName);
        store.setRenameText(nextName);
        setLoadedSessionKey('');
        setChatWindowState(null);
        navigate(`/chats/group/${encodeURIComponent(rawId())}?file=${encodeURIComponent(nextName)}`);
        toast.push({ title: locale.chats.renamed, tone: 'success' });
        await invalidateChatQueries();
      } catch (error) {
        toast.push({ title: locale.chats.renameFailed, description: getErrorMessage(error), tone: 'danger' });
      }
    }
  }

  async function deleteCurrentChat(): Promise<void> {
    if (!window.confirm(locale.chats.deleteConfirm)) {
      return;
    }

    try {
      if (scope() === 'character') {
        if (!currentFileName()) {
          return;
        }

        if (!store.persistedSession()) {
          setPendingNewFile('');
          setLoadedSessionKey('');
          setChatWindowState(null);
          store.setDraftPayload([]);
          store.setDirty(false);
          store.setPersistedSession(false);
          navigate('/chats');
          toast.push({ title: locale.chats.unsavedRemoved, tone: 'success' });
          return;
        }

        await coreApiClient.chats.deleteCharacter(avatarUrl(), currentFileName());
      } else if (scope() === 'group') {
        if (!currentGroupChatId()) {
          toast.push({ title: locale.chats.invalidCurrentGroup, tone: 'danger' });
          return;
        }

        await coreApiClient.chats.deleteGroup(currentGroupChatId());
      } else {
        return;
      }

      setPendingNewFile('');
      setLoadedSessionKey('');
      setChatWindowState(null);
      store.setDraftPayload([]);
      store.setDirty(false);
      store.setPersistedSession(false);
      setEditorOpen(false);
      navigate('/chats');
      toast.push({ title: locale.chats.deleted, tone: 'success' });
      await invalidateChatQueries();
    } catch (error) {
      toast.push({ title: locale.chats.deleteFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function exportCurrentChat(): Promise<void> {
    try {
      if (scope() === 'character') {
        if (!currentFileName()) {
          toast.push({ title: locale.chats.chooseChatFile, tone: 'danger' });
          return;
        }
        await coreApiClient.chats.exportCharacter(avatarUrl(), currentFileName());
      } else if (scope() === 'group') {
        if (!currentGroupChatId()) {
          toast.push({ title: locale.chats.invalidCurrentGroup, tone: 'danger' });
          return;
        }
        await coreApiClient.chats.exportGroup(currentGroupChatId());
      } else {
        toast.push({ title: locale.chats.openContextFirst, tone: 'danger' });
        return;
      }

      toast.push({ title: locale.chats.exported, tone: 'success' });
    } catch (error) {
      toast.push({ title: locale.chats.exportFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function saveProviderDefaults(): Promise<void> {
    const settings = settingsQuery.data as AppSettings | undefined;
    if (!settings) {
      return;
    }

    setSavingProviderDefaults(true);
    try {
      const nextSettings = writeProviderSettings(settings, buildRequestDraft());
      await coreApiClient.settings.save(nextSettings as Record<string, unknown>);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      store.setProviderDraft(readProviderSettings(nextSettings));
      toast.push({ title: locale.chats.providerConfigSaved, tone: 'success' });
    } catch (error) {
      toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' });
    } finally {
      setSavingProviderDefaults(false);
    }
  }

  function resetProviderDefaults(): void {
    const nextDraft = readProviderSettings(settingsQuery.data);
    store.setProviderDraft(nextDraft);
    setModelStatusPayload({});
    setModelOptions([]);
    toast.push({ title: locale.chats.providerConfigReset, tone: 'success' });
  }

  async function appendUserMessage(): Promise<void> {
    logGeneration('send_click', {
      mode: isMultiplayerSession() ? 'multiplayer' : 'single',
      composerLength: store.composer().length,
      busy: Boolean(store.abortController()),
    });
    if (isMultiplayerSession()) {
      await submitMultiplayerContribution();
      return;
    }

    const content = store.composer().trim();
    if (!content) {
      logGeneration('send_blocked_empty');
      toast.push({ title: locale.chats.appendUserFirst, tone: 'danger' });
      return;
    }

    const payload = [...ensureConversationPayload(), createUserChatMessage(currentUserName(), content)] as ChatPayload;
    store.setComposer('');
    await applyPayloadChange(payload);
    logGeneration('user_message_appended', { payloadLength: payload.length });
    await generateReply(payload);
  }

  function buildRequestDraft(): ChatProviderDraft {
    return setProviderModel(store.providerDraft(), store.providerDraft().model.trim());
  }

  async function runNonStreamingGeneration(options: {
    initialPayload: ChatPayload;
    fallbackPayload: ChatPayload;
    targetMessageIndex: number;
    request: GenerationRequest;
    presetDraft: Record<string, unknown> | null;
  }): Promise<void> {
    logGeneration('non_stream_start', {
      targetMessageIndex: options.targetMessageIndex,
      model: options.request.model,
    });
    const controller = new AbortController();
    let workingPayload = options.initialPayload;
    let producedText = false;
    let wasAborted = false;
    let streamNoticeSent = false;
    const assistantMessageKey = String(getPayloadMessage(options.initialPayload, options.targetMessageIndex)?.send_date ?? Date.now());

    store.setAbortController(controller);
    store.setEditingMessage(null);
    store.setDraftPayload(workingPayload);
    store.setDirty(true);

    if (roomState().isHost && isMultiplayerSession()) {
      if (store.persistedSession()) {
        await savePayload(workingPayload, { notifySuccess: false });
      }
      await broadcastSnapshot(workingPayload);
      await nativeBridge.multiplayer.broadcastAssistantStarted({ assistant_message_key: assistantMessageKey });
    }

    try {
      const response = await coreApiClient.generation.generate(options.request, controller.signal);
      const text = extractCompletionText(response);
      if (text) {
        producedText = true;
        workingPayload = replaceCurrentSwipeText(workingPayload, options.targetMessageIndex, text);
        store.setDraftPayload(workingPayload);
      }
    } catch (error) {
      wasAborted = isAbortError(error);
      logGeneration('non_stream_error', {
        aborted: wasAborted,
        message: getErrorMessage(error),
      });
      if (!wasAborted) {
        const recoveredText = extractCompletionTextFromError(error);
        if (recoveredText) {
          producedText = true;
          streamNoticeSent = true;
          workingPayload = replaceCurrentSwipeText(workingPayload, options.targetMessageIndex, recoveredText);
          store.setDraftPayload(workingPayload);
          toast.push({ title: locale.chats.streamFallback, tone: 'warning' });
        } else {
          streamNoticeSent = true;
          toast.push({ title: locale.chats.generationFailed, description: getErrorMessage(error), tone: 'danger' });
        }
      }
    } finally {
      store.setAbortController(null);
      logGeneration('non_stream_end', { producedText, wasAborted });
    }

    if (!producedText) {
      if (!wasAborted && !streamNoticeSent) {
        toast.push({ title: locale.chats.generationFailed, tone: 'danger' });
      }
      store.setDraftPayload(options.fallbackPayload);
      if (roomState().isHost && isMultiplayerSession()) {
        if (store.persistedSession()) {
          await savePayload(options.fallbackPayload, { notifySuccess: false });
        }
        await broadcastSnapshot(options.fallbackPayload);
        await nativeBridge.multiplayer.broadcastAssistantAborted({ assistant_message_key: assistantMessageKey });
      }
      return;
    }

    const rawSourceText = resolveAssistantSourceText(workingPayload, options.targetMessageIndex);
    workingPayload = await finalizeAssistantProjectionFromRawSource(
      workingPayload,
      options.targetMessageIndex,
      rawSourceText,
    );
    store.setDraftPayload(workingPayload);

    if (store.persistedSession()) {
      const saved = await savePayload(workingPayload, { notifySuccess: false });
      if (!saved) {
        store.setDirty(true);
      }
      if (roomState().isHost && isMultiplayerSession()) {
        await broadcastSnapshot(workingPayload);
        if (wasAborted) {
          await nativeBridge.multiplayer.broadcastAssistantAborted({ assistant_message_key: assistantMessageKey });
        } else {
          await nativeBridge.multiplayer.broadcastAssistantDone({ assistant_message_key: assistantMessageKey });
        }
      }
      return;
    }

    store.setDraftPayload(workingPayload);
    store.setDirty(true);
  }

  async function runStreamingGeneration(options: {
    initialPayload: ChatPayload;
    fallbackPayload: ChatPayload;
    targetMessageIndex: number;
    request: GenerationRequest;
    presetDraft: Record<string, unknown> | null;
  }): Promise<void> {
    logGeneration('stream_start', {
      targetMessageIndex: options.targetMessageIndex,
      model: options.request.model,
    });
    const controller = new AbortController();
    let workingPayload = options.initialPayload;
    let producedText = false;
    let wasAborted = false;
    const assistantMessageKey = String(getPayloadMessage(options.initialPayload, options.targetMessageIndex)?.send_date ?? Date.now());

    store.setAbortController(controller);
    store.setEditingMessage(null);
    store.setDraftPayload(workingPayload);
    store.setDirty(true);

    if (roomState().isHost && isMultiplayerSession()) {
      if (store.persistedSession()) {
        await savePayload(workingPayload, { notifySuccess: false });
      }
      await broadcastSnapshot(workingPayload);
      await nativeBridge.multiplayer.broadcastAssistantStarted({ assistant_message_key: assistantMessageKey });
    }

    try {
      await coreApiClient.generation.stream(
        options.request,
        (chunk) => {
          const delta = extractChunkDelta(chunk);
          if (!delta.content && !delta.reasoning) {
            return;
          }

          producedText = producedText || Boolean(delta.content || delta.reasoning);
          if (delta.content) {
            workingPayload = appendContinuationToSwipe(workingPayload, options.targetMessageIndex, delta.content);
          }
          if (delta.reasoning) {
            workingPayload = appendReasoningToSwipe(workingPayload, options.targetMessageIndex, delta.reasoning, 'Reasoning');
          }
          store.setDraftPayload(workingPayload);
          if (roomState().isHost && isMultiplayerSession()) {
            void nativeBridge.multiplayer.broadcastAssistantDelta({
              assistant_message_key: assistantMessageKey,
              delta: delta.content,
              reasoning: delta.reasoning,
            });
          }
        },
        controller.signal,
      );
    } catch (error) {
      wasAborted = isAbortError(error);
      logGeneration('stream_error', { aborted: wasAborted, message: getErrorMessage(error) });
      if (!wasAborted) {
        toast.push({ title: locale.chats.generationFailed, description: getErrorMessage(error), tone: 'danger' });
      }
    } finally {
      store.setAbortController(null);
      logGeneration('stream_end', { producedText, wasAborted });
    }

    if (!producedText) {
      store.setDraftPayload(options.fallbackPayload);
      if (roomState().isHost && isMultiplayerSession()) {
        if (store.persistedSession()) {
          await savePayload(options.fallbackPayload, { notifySuccess: false });
        }
        await broadcastSnapshot(options.fallbackPayload);
        await nativeBridge.multiplayer.broadcastAssistantAborted({ assistant_message_key: assistantMessageKey });
      }
      return;
    }

    const rawSourceText = resolveAssistantSourceText(workingPayload, options.targetMessageIndex);
    workingPayload = await finalizeAssistantProjectionFromRawSource(
      workingPayload,
      options.targetMessageIndex,
      rawSourceText,
    );
    store.setDraftPayload(workingPayload);

    if (store.persistedSession()) {
      const saved = await savePayload(workingPayload, { notifySuccess: false });
      if (!saved) {
        store.setDirty(true);
      }
      if (roomState().isHost && isMultiplayerSession()) {
        await broadcastSnapshot(workingPayload);
        if (wasAborted) {
          await nativeBridge.multiplayer.broadcastAssistantAborted({ assistant_message_key: assistantMessageKey });
        } else {
          await nativeBridge.multiplayer.broadcastAssistantDone({ assistant_message_key: assistantMessageKey });
        }
      }
      return;
    }

    store.setDraftPayload(workingPayload);
    store.setDirty(true);
  }

  async function runGeneration(options: {
    initialPayload: ChatPayload;
    fallbackPayload: ChatPayload;
    targetMessageIndex: number;
    request: GenerationRequest;
    presetDraft: Record<string, unknown> | null;
  }): Promise<void> {
    logGeneration('generation_dispatch', {
      stream: options.request.stream !== false,
      model: options.request.model,
    });
    if (options.request.stream === false) {
      await runNonStreamingGeneration(options);
      return;
    }
    await runStreamingGeneration(options);
  }

  async function generateReply(basePayloadOverride?: ChatPayload): Promise<void> {
    logGeneration('generate_start', { override: Boolean(basePayloadOverride) });
    if (store.abortController()) {
      logGeneration('generate_blocked_busy');
      return;
    }
    if (isMultiplayerSession() && !ensureMultiplayerHostReady('generate')) {
      logGeneration('generate_blocked_multiplayer');
      return;
    }

    let basePayload = basePayloadOverride ?? ensureConversationPayload();
    if (isMultiplayerSession()) {
      basePayload = commitPendingMultiplayerMessages(basePayload);
      await applyPayloadChange(basePayload);
      if (roomState().isHost) {
        await broadcastSnapshot(basePayload);
      }
    } else if (!basePayloadOverride) {
      const composerText = store.composer().trim();
      if (composerText) {
        basePayload = [...basePayload, createUserChatMessage(currentUserName(), composerText)] as ChatPayload;
        store.setComposer('');
      }
    }

    const messages = getChatMessages(basePayload);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || (!lastMessage.is_user && !lastMessage.is_system)) {
      logGeneration('generate_blocked_last_message', {
        lastMessageRole: lastMessage ? (lastMessage.is_system ? 'system' : lastMessage.is_user ? 'user' : 'assistant') : 'none',
      });
      toast.push({ title: locale.chats.replyFirst, tone: 'danger' });
      return;
    }

    const resolvedRequest = await resolveGenerationRequest(basePayload, 'reply');
    if (!resolvedRequest) {
      logGeneration('generate_blocked_resolve');
      return;
    }

    logGeneration('generate_request_ready', {
      model: resolvedRequest.request.model,
      stream: resolvedRequest.request.stream !== false,
      source: resolvedRequest.request.chat_completion_source,
      messageCount: Array.isArray(resolvedRequest.request.messages) ? resolvedRequest.request.messages.length : 0,
    });

    const { payload, messageIndex } = appendAssistantPlaceholder(basePayload, currentAssistantName());
    await runGeneration({
      initialPayload: payload,
      fallbackPayload: basePayload,
      targetMessageIndex: messageIndex,
      request: resolvedRequest.request,
      presetDraft: resolvedRequest.presetDraft,
    });
  }

  async function continueAssistantMessage(messageIndex: number): Promise<void> {
    if (store.abortController()) {
      return;
    }
    if (isMultiplayerSession() && !ensureMultiplayerHostReady('generate')) {
      return;
    }

    const message = getPayloadMessage(store.draftPayload(), messageIndex);
    if (!message || message.is_user || message.is_system) {
      toast.push({ title: locale.chats.continueOnlyAssistant, tone: 'danger' });
      return;
    }

    const resolvedRequest = await resolveGenerationRequest(store.draftPayload(), 'continue', messageIndex);
    if (!resolvedRequest) {
      return;
    }

    await runGeneration({
      initialPayload: store.draftPayload(),
      fallbackPayload: store.draftPayload(),
      targetMessageIndex: messageIndex,
      request: resolvedRequest.request,
      presetDraft: resolvedRequest.presetDraft,
    });
  }

  async function regenerateAssistantMessage(messageIndex: number): Promise<void> {
    if (store.abortController()) {
      return;
    }
    if (isMultiplayerSession() && !ensureMultiplayerHostReady('generate')) {
      return;
    }

    const message = getPayloadMessage(store.draftPayload(), messageIndex);
    if (!message || message.is_user || message.is_system) {
      toast.push({ title: locale.chats.regenerateOnlyAssistant, tone: 'danger' });
      return;
    }

    if (messageIndex < currentMessages().length - 1) {
      const confirmed = window.confirm(locale.chats.regenerateBranchConfirm);
      if (!confirmed) {
        return;
      }
    }

    const truncatedPayload = truncateTimelineForRegenerate(store.draftPayload(), messageIndex);
    const resolvedRequest = await resolveGenerationRequest(truncatedPayload, 'regenerate', messageIndex);
    if (!resolvedRequest) {
      return;
    }

    await runGeneration({
      initialPayload: truncatedPayload,
      fallbackPayload: store.draftPayload(),
      targetMessageIndex: messageIndex,
      request: resolvedRequest.request,
      presetDraft: resolvedRequest.presetDraft,
    });
  }

  async function saveEditedMessage(): Promise<void> {
    if (!ensureMultiplayerEditable()) {
      return;
    }

    const editingMessage = store.editingMessage();
    if (!editingMessage) {
      return;
    }

    let nextPayload = replaceCurrentSwipeText(store.draftPayload(), editingMessage.index, editingMessage.text);
    const editedMessage = getPayloadMessage(nextPayload, editingMessage.index);
    if (editedMessage && !editedMessage.is_user && !editedMessage.is_system) {
      nextPayload = await applyAssistantRegexProjection(nextPayload, editingMessage.index, {
        persistCanonical: true,
        reason: 'edit',
      });
    }
    await applyPayloadChange(nextPayload);
    if (roomState().connectionState === 'hosting' && roomState().isHost && isMultiplayerSession()) {
      await broadcastSnapshot(nextPayload);
    }
  }

  async function deleteMessageAt(messageIndex: number): Promise<void> {
    const message = getPayloadMessage(store.draftPayload(), messageIndex);
    const meta = resolveMultiplayerMessageMeta(message);
    if (meta?.pending && meta.contribution_id) {
      await withdrawContributionAt(messageIndex);
      return;
    }

    if (!ensureMultiplayerEditable()) {
      return;
    }

    if (!window.confirm(locale.chats.deleteMessageConfirm)) {
      return;
    }

    const nextPayload = deleteMessage(store.draftPayload(), messageIndex);
    await applyPayloadChange(nextPayload);
    if (roomState().connectionState === 'hosting' && roomState().isHost && isMultiplayerSession()) {
      await broadcastSnapshot(nextPayload);
    }
  }

  async function cycleMessageSwipe(messageIndex: number, direction: -1 | 1): Promise<void> {
    if (!ensureMultiplayerEditable()) {
      return;
    }

    const nextPayload = cycleSwipe(store.draftPayload(), messageIndex, direction);
    await applyPayloadChange(nextPayload);
    if (roomState().connectionState === 'hosting' && roomState().isHost && isMultiplayerSession()) {
      await broadcastSnapshot(nextPayload);
    }
  }

  function handleProviderSourceChange(source: ProviderSource): void {
    const nextDraft = setProviderSource(store.providerDraft(), source);
    store.setProviderDraft(nextDraft);
    setModelStatusPayload({});
    setModelOptions([]);
  }

  function handleProviderModelChange(model: string): void {
    store.setProviderDraft((current) => setProviderModel(current, model));
  }

  function handleProviderFieldChange(field: keyof ChatProviderDraft, value: string | boolean): void {
    store.setProviderDraft((current) => ({ ...current, [field]: value }));
  }

  async function importChatFile(file: File): Promise<void> {
    try {
      if (scope() === 'character' && avatarUrl()) {
        await coreApiClient.chats.importCharacter(avatarUrl(), file);
      } else if (scope() === 'group' && rawId()) {
        await coreApiClient.chats.importGroup(file);
      } else {
        toast.push({ title: locale.chats.openContextFirst, tone: 'danger' });
        return;
      }

      toast.push({ title: locale.chats.importSuccess, tone: 'success' });
      await invalidateChatQueries();
    } catch (error) {
      toast.push({ title: locale.chats.importFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function openSessionMenu(session: ChatSessionSummary, position: { x: number; y: number }): void {
    const next = clampMenuPosition(position);
    setContextMenuState({ session, ...next });
  }

  async function openSessionEditor(session: ChatSessionSummary, tab: 'session' | 'settings' = 'session'): Promise<void> {
    setEditorTab(tab);
    setEditorSession(session);

    if (buildSessionKey(session) === currentSessionKey()) {
      setEditorOpen(true);
      return;
    }

    await guardDirtyAction(async () => {
      setPendingNewFile('');
      setLoadedSessionKey('');
      store.setPersistedSession(true);
      store.setEditingMessage(null);
      setChatWindowState(null);
      navigate(buildSessionHref(session));
      setEditorOpen(true);
    });
  }

  const loadingWorkspace = createMemo(() => {
    if (scope() === 'character' && currentFileName() && pendingNewFile() !== currentFileName()) {
      return characterChatQuery.isPending;
    }
    if (scope() === 'group' && currentGroupChatId()) {
      return groupChatQuery.isPending;
    }
    return false;
  });

  const showWorkspace = createMemo(() => Boolean(currentSessionKey()));
  const switchingWorkspace = createMemo(() => Boolean(currentSessionKey()) && loadedSessionKey() !== currentSessionKey() && loadingWorkspace());
  const canRenderWorkspace = createMemo(() => {
    if (!showWorkspace()) {
      return false;
    }
    return loadedSessionKey() === currentSessionKey() || currentMessages().length > 0;
  });
  const interactionLocked = createMemo(() => Boolean(store.abortController()) || switchingWorkspace());
  const pageLayout = () => props.layout ?? 'desktop';
  createEffect(() => {
    if (pageLayout() !== 'desktop' && workspaceFullscreen()) {
      setWorkspaceFullscreen(false);
    }
  });

  createEffect(() => {
    if (!workspaceFullscreen()) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWorkspaceFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown));
  });

  const rendererWorkspaceVm = createMemo(() => buildRendererWorkspaceVm({
    sessionKey: currentSessionKey(),
    sessionTitle: activeSessionSummary()?.scope_name || currentScopeName() || locale.chats.title,
    layout: rendererEnvironment().target,
    busy: interactionLocked(),
    canLoadMoreBefore: Boolean(chatWindowState()?.hasMoreBefore),
    loadingMoreBefore: loadingMoreBefore(),
    canSend: !interactionLocked(),
    canStop: Boolean(store.abortController()),
    tokenUsage: tokenUsage(),
    messages: currentMessages(),
    effectPolicy: resolvedRenderer().effectPolicy as unknown as Record<string, unknown>,
  }));

  function handleRendererAction(action: RendererAction): void {
    switch (action.type) {
      case 'send':
        if (typeof action.content === 'string') {
          store.setComposer(action.content);
        }
        void appendUserMessage();
        return;
      case 'edit': {
        if (!ensureMultiplayerEditable() || typeof action.message_index !== 'number') {
          return;
        }
        const message = getPayloadMessage(store.draftPayload(), action.message_index);
        if (!message) {
          return;
        }
        store.setEditingMessage({ index: action.message_index, text: typeof action.content === 'string' ? action.content : message.mes ?? '' });
        return;
      }
      case 'delete':
        if (typeof action.message_index === 'number') {
          void deleteMessageAt(action.message_index);
        }
        return;
      case 'withdraw':
        if (typeof action.message_index === 'number') {
          void withdrawContributionAt(action.message_index);
        }
        return;
      case 'regenerate':
        if (typeof action.message_index === 'number') {
          void regenerateAssistantMessage(action.message_index);
        }
        return;
      case 'continue':
        if (typeof action.message_index === 'number') {
          void continueAssistantMessage(action.message_index);
        }
        return;
      case 'load_more_before':
        void loadMoreBefore();
        return;
      case 'stop':
        logGeneration('stop_click');
        store.abortController()?.abort();
        return;
      case 'open_session_menu': {
        const session = activeSessionSummary();
        if (session) {
          void openSessionEditor(session, 'session');
        }
        return;
      }
      default:
        return;
    }
  }

  const workspaceContent = (
    <Show
      when={showWorkspace()}
      fallback={sessionCatalog.sessionsQuery.isPending || hasAvailableSessions() ? <LoadingBlock /> : <ChatWelcome greeting={getGreeting()} />}
    >
      <Show when={canRenderWorkspace()} fallback={<LoadingBlock />}>
        <div class="flex h-full min-h-0 flex-col">
          <Show
            when={switchingWorkspace() || loadingWorkspace()}
            fallback={(
              <RendererWorkspace
                renderer={resolvedRenderer()}
                workspaceVm={rendererWorkspaceVm()}
                onRendererAction={handleRendererAction}
                busy={interactionLocked()}
                composer={store.composer()}
                title={activeSessionSummary()?.scope_name || currentScopeName() || locale.chats.title}
                messages={currentMessages()}
                editingMessage={store.editingMessage()}
                canLoadMoreBefore={Boolean(chatWindowState()?.hasMoreBefore)}
                loadingMoreBefore={loadingMoreBefore()}
                worldInfoSummary={worldInfoBindingSummary()}
                presetSummary={presetBindingSummary()}
                apiProfileSummary={apiProfileBindingSummary()}
                roomSummary={roomSummary()}
                bindingReadOnly={bindingReadOnly()}
                fullscreen={workspaceFullscreen()}
                allowGenerateReply={allowGenerateReply()}
                allowStopGenerate={allowStopGenerate()}
                generating={Boolean(store.abortController())}
                rendererTheme={rendererTheme()}
                blurEnabled={resolvedRenderer().effectPolicy.blurEnabled}
                blurPx={resolvedRenderer().effectPolicy.blurPx}
                animationMs={resolvedRenderer().effectPolicy.animationMs}
                interactivePreviewLimit={resolvedRenderer().effectPolicy.interactivePreviewLimit}
                onComposerChange={store.setComposer}
                onAppendUserMessage={() => void appendUserMessage()}
                onGenerateReply={() => void generateReply()}
                onStop={() => {
                  logGeneration('stop_click');
                  store.abortController()?.abort();
                }}
                onLoadMoreBefore={() => void loadMoreBefore()}
                onOpenWorldInfoBinding={() => openBindingOverlay('world-info')}
                onOpenPresetBinding={() => openBindingOverlay('preset')}
                onOpenApiProfileBinding={() => openBindingOverlay('api-profile')}
                onToggleFullscreen={pageLayout() === 'desktop' ? () => setWorkspaceFullscreen((current) => !current) : undefined}
                onOpenRoomPanel={canManageMultiplayer() ? () => setRoomPanelOpen(true) : undefined}
                onBack={props.onBack}
                onStartEdit={(index, message) => {
                  if (!ensureMultiplayerEditable()) {
                    return;
                  }
                  store.setEditingMessage({ index, text: message.mes ?? '' });
                }}
                onEditingTextChange={(value) => store.setEditingMessage((current) => (current ? { ...current, text: value } : current))}
                onSaveEdit={() => void saveEditedMessage()}
                onCancelEdit={() => store.setEditingMessage(null)}
                onDeleteMessage={(index) => void deleteMessageAt(index)}
                onWithdrawMessage={(index) => void withdrawContributionAt(index)}
                onRegenerate={(index) => void regenerateAssistantMessage(index)}
                onContinue={(index) => void continueAssistantMessage(index)}
                onPrevSwipe={(index) => void cycleMessageSwipe(index, -1)}
                onNextSwipe={(index) => void cycleMessageSwipe(index, 1)}
              />
            )}
          >
            <LoadingBlock />
          </Show>
        </div>
      </Show>
    </Show>
  );

  return (
    <div class={pageLayout() === 'mobile' ? 'flex h-full flex-col bg-white' : 'flex h-full min-h-0 gap-4 overflow-hidden'}>
      <Show
        when={pageLayout() === 'desktop'}
        fallback={(
          <main class="min-h-0 flex-1 overflow-hidden">{workspaceContent}</main>
        )}
      >
        <Show
          when={!workspaceFullscreen()}
          fallback={(
            <div class="fixed inset-0 z-[80] bg-slate-100/90 px-4 py-4 backdrop-blur-sm md:px-5">
              <div class="mx-auto flex h-full min-h-0 max-w-[1800px]">
                <DesktopWorkspaceBoard scrollMode="contained" showLeadingMenu={false}>
                  {workspaceContent}
                </DesktopWorkspaceBoard>
              </div>
            </div>
          )}
        >
          <DesktopContextPane
            scrollMode="contained"
            floatingActionLabel={locale.chats.newChat}
            onFloatingAction={() => void handleCreateSession()}
          >
            <ChatSessionPane
              search={sessionCatalog.search()}
              filter={sessionCatalog.filter()}
              sessions={sessionCatalog.sessionsQuery.data ?? []}
              activeSessionKey={currentSessionKey()}
              canCreate={scope() === 'character' && Boolean(rawId())}
              onCreate={() => void handleCreateSession()}
              onJoinRoom={() => setJoinRoomOpen(true)}
              onSearchChange={sessionCatalog.setSearch}
              onFilterChange={sessionCatalog.setFilter}
              onOpenSession={(session) => void openSession(session)}
              onOpenSessionMenu={(session, position) => openSessionMenu(session, position)}
              onImport={(file) => void importChatFile(file)}
            />
          </DesktopContextPane>

          <DesktopWorkspaceBoard scrollMode="contained" showLeadingMenu={false}>
            {workspaceContent}
          </DesktopWorkspaceBoard>
        </Show>
      </Show>

      <SessionBindingOverlay
        open={bindingOverlayOpen()}
        activeTab={bindingOverlayTab()}
        bindings={currentSessionBindings()}
        worldInfoNames={settingsQuery.data?.world_names ?? []}
        presetNames={presetNamesQuery.data ?? []}
        apiProfiles={apiProfiles()}
        loadingPresets={presetNamesQuery.isPending}
        saving={savingBindings()}
        readOnly={bindingReadOnly()}
        onClose={() => setBindingOverlayOpen(false)}
        onTabChange={setBindingOverlayTab}
        onSave={(bindings) => void saveSessionBindings(bindings)}
      />

      <ChatSessionContextMenu
        open={Boolean(contextMenuState())}
        x={contextMenuState()?.x ?? 0}
        y={contextMenuState()?.y ?? 0}
        onClose={() => setContextMenuState(null)}
        onEdit={() => {
          const menu = contextMenuState();
          setContextMenuState(null);
          if (menu) {
            void openSessionEditor(menu.session, 'session');
          }
        }}
      />

      <ChatSessionEditorModal
        open={editorOpen()}
        onClose={() => setEditorOpen(false)}
        tab={editorTab()}
        onTabChange={setEditorTab}
        session={editorSession() ?? activeSessionSummary()}
        renameText={store.renameText()}
        messageCount={currentMessages().length}
        worldInfoSummary={worldInfoBindingSummary()}
        presetSummary={presetBindingSummary()}
        apiProfileSummary={apiProfileBindingSummary()}
        dirty={store.dirty()}
        draft={!store.persistedSession()}
        disabled={interactionLocked()}
        loadingModels={loadingModels()}
        savingDefaults={savingProviderDefaults()}
        modelOptions={modelOptions()}
        statusPayload={modelStatusPayload()}
        draftSettings={store.providerDraft()}
        onRenameTextChange={store.setRenameText}
        onRename={() => void renameCurrentChat()}
        onSaveChat={() => void savePayload(store.draftPayload(), { notifySuccess: true })}
        onExportChat={() => void exportCurrentChat()}
        onDeleteChat={() => void deleteCurrentChat()}
        rendererBinding={{ mode: editorRendererMode(), renderer_id: editorRendererId() }}
        availableRenderers={availableRenderers()}
        onRendererModeChange={setEditorRendererMode}
        onRendererIdChange={setEditorRendererId}
        onSaveRenderer={() => void saveSessionRenderer(editorRendererMode(), editorRendererMode() === 'override' ? editorRendererId() : null)}
        canCreateMultiplayerCopy={isCharacterSession() && currentSessionState().mode === 'single'}
        onCreateMultiplayerCopy={() => void createMultiplayerCopy()}
        onOpenWorldInfoBinding={() => {
          setEditorOpen(false);
          openBindingOverlay('world-info');
        }}
        onOpenPresetBinding={() => {
          setEditorOpen(false);
          openBindingOverlay('preset');
        }}
        onOpenApiProfileBinding={() => {
          setEditorOpen(false);
          openBindingOverlay('api-profile');
        }}
        onSourceChange={handleProviderSourceChange}
        onModelChange={handleProviderModelChange}
        onFieldChange={handleProviderFieldChange}
        onRefreshModels={() => void refreshModelStatus()}
        onSaveDefaults={() => void saveProviderDefaults()}
        onResetDefaults={resetProviderDefaults}
      />


      <CreateSessionModeModal
        open={createModeOpen()}
        onClose={() => setCreateModeOpen(false)}
        onSelectSingle={() => void createCharacterChatWithMode('single')}
        onSelectMultiplayer={() => void createCharacterChatWithMode('multiplayer')}
      />
      <CreateSessionGreetingModal
        open={greetingModalOpen()}
        greetings={greetingOptions()}
        onClose={resetGreetingState}
        onSelect={handleGreetingSelect}
      />

      <JoinRoomModal
        open={joinRoomOpen()}
        initialNickname={currentUserName()}
        onClose={() => setJoinRoomOpen(false)}
        onJoin={(input) => void joinRoom(input)}
      />

      <RoomPanelModal
        open={roomPanelOpen()}
        status={roomStatus()}
        roomSummary={roomSummary()}
        participants={roomState().participants}
        pendingJoinRequests={roomState().pendingJoinRequests}
        onClose={() => setRoomPanelOpen(false)}
        onStartHost={canManageMultiplayer() ? () => void startHostingCurrentSession() : undefined}
        onOpenJoin={() => setJoinRoomOpen(true)}
        onStopOrLeave={() => void stopOrLeaveRoom()}
        onApproveJoin={(requestId, accept) => void approveJoinRequest(requestId, accept)}
      />
    </div>
  );
}




