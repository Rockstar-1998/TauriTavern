import { createEffect, onCleanup, type JSX } from 'solid-js';

import { nativeBridge } from '@/lib/native/bridge';
import type { ChatMessage, RendererAction, RendererWorkspaceVm, TokenUsage } from '@/types/domain';

import { ChatWorkspace } from './ChatWorkspace';
import type { ResolvedChatRenderer } from '../renderers/registry';

type EditingMessageState = {
  index: number;
  text: string;
} | null;

type ChatWorkspaceProps = {
  busy: boolean;
  composer: string;
  title: string;
  messages: ChatMessage[];
  editingMessage: EditingMessageState;
  allowGenerateReply?: boolean;
  allowStopGenerate?: boolean;
  generating?: boolean;
  canLoadMoreBefore?: boolean;
  loadingMoreBefore?: boolean;
  worldInfoSummary: string;
  presetSummary: string;
  apiProfileSummary: string;
  roomSummary?: string;
  bindingReadOnly?: boolean;
  fullscreen?: boolean;
  rendererTheme?: Record<string, string | number>;
  blurEnabled?: boolean;
  blurPx?: number;
  animationMs?: number;
  interactivePreviewLimit?: number;
  onComposerChange: (value: string) => void;
  onAppendUserMessage: () => void;
  onGenerateReply: () => void;
  onStop: () => void;
  onLoadMoreBefore?: () => void;
  onOpenWorldInfoBinding: () => void;
  onOpenPresetBinding: () => void;
  onOpenApiProfileBinding: () => void;
  onToggleFullscreen?: () => void;
  onOpenRoomPanel?: () => void;
  onStartEdit: (index: number, message: ChatMessage) => void;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteMessage: (index: number) => void;
  onWithdrawMessage?: (index: number) => void;
  onRegenerate: (index: number) => void;
  onContinue: (index: number) => void;
  onPrevSwipe: (index: number) => void;
  onNextSwipe: (index: number) => void;
  onBack?: () => void;
};

function IframeRendererWorkspace(props: {
  renderer: ResolvedChatRenderer;
  workspaceVm: RendererWorkspaceVm;
  onRendererAction: (action: RendererAction) => void;
}): JSX.Element {
  let iframeRef: HTMLIFrameElement | undefined;

  const postSync = () => {
    if (!iframeRef?.contentWindow) {
      return;
    }

    iframeRef.contentWindow.postMessage({
      type: 'tauritavern-renderer-sync',
      payload: props.workspaceVm,
    }, '*');
  };

  createEffect(() => {
    props.workspaceVm;
    postSync();
  });

  createEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef?.contentWindow || event.source !== iframeRef.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return;
      }

      if (data.type === 'tauritavern-renderer-ready' || data.type === 'tauritavern-renderer-request-sync') {
        postSync();
        return;
      }

      if (data.type !== 'tauritavern-renderer-action') {
        return;
      }

      const action = data.action;
      if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') {
        return;
      }

      if (!props.renderer.capabilities.includes(action.type)) {
        return;
      }

      props.onRendererAction(action as RendererAction);
    };

    window.addEventListener('message', handleMessage);
    onCleanup(() => window.removeEventListener('message', handleMessage));
  });

  const src = () => {
    const entryPath = props.renderer.manifest.entry_asset_path || props.renderer.manifest.entry;
    return entryPath ? nativeBridge.assetUrl(entryPath) : '';
  };

  return (
    <div class="h-full min-h-0 overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white/70">
      <iframe
        ref={iframeRef}
        title={props.renderer.manifest.name || 'Renderer workspace'}
        class="h-full w-full border-0"
        sandbox="allow-scripts allow-forms allow-modals"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={src()}
        onLoad={postSync}
      />
    </div>
  );
}

function resolveTokenUsage(workspaceVm: RendererWorkspaceVm): TokenUsage | null {
  const usage = workspaceVm.token_usage;
  if (!usage) {
    return null;
  }

  return {
    model: String(usage.model ?? ''),
    promptTokens: Number(usage.prompt_tokens ?? 0),
    maxContextTokens: Number(usage.max_context_tokens ?? 0),
    remainingContextTokens: Number(usage.remaining_context_tokens ?? 0),
    usageRatio: Number(usage.usage_ratio ?? 0),
    withinLimit: Boolean(usage.within_limit),
  };
}

export function RendererWorkspace(props: {
  renderer: ResolvedChatRenderer;
  workspaceVm: RendererWorkspaceVm;
  onRendererAction: (action: RendererAction) => void;
} & ChatWorkspaceProps): JSX.Element {
  if (props.renderer.manifest.mode === 'iframe-dev-v1' && props.renderer.manifest.entry_asset_path) {
    return (
      <IframeRendererWorkspace
        renderer={props.renderer}
        workspaceVm={props.workspaceVm}
        onRendererAction={props.onRendererAction}
      />
    );
  }

  return (
    <ChatWorkspace
      busy={props.busy}
      composer={props.composer}
      title={props.title}
      messages={props.messages}
      editingMessage={props.editingMessage}
      allowGenerateReply={props.allowGenerateReply}
      allowStopGenerate={props.allowStopGenerate}
      generating={props.generating}
      canLoadMoreBefore={props.canLoadMoreBefore}
      loadingMoreBefore={props.loadingMoreBefore}
      worldInfoSummary={props.worldInfoSummary}
      presetSummary={props.presetSummary}
      apiProfileSummary={props.apiProfileSummary}
      roomSummary={props.roomSummary}
      bindingReadOnly={props.bindingReadOnly}
      fullscreen={props.fullscreen}
      rendererTheme={props.rendererTheme}
      blurEnabled={props.blurEnabled}
      blurPx={props.blurPx}
      animationMs={props.animationMs}
      interactivePreviewLimit={props.interactivePreviewLimit}
      tokenUsage={resolveTokenUsage(props.workspaceVm)}
      onComposerChange={props.onComposerChange}
      onAppendUserMessage={props.onAppendUserMessage}
      onGenerateReply={props.onGenerateReply}
      onStop={props.onStop}
      onLoadMoreBefore={props.onLoadMoreBefore}
      onOpenWorldInfoBinding={props.onOpenWorldInfoBinding}
      onOpenPresetBinding={props.onOpenPresetBinding}
      onOpenApiProfileBinding={props.onOpenApiProfileBinding}
      onToggleFullscreen={props.onToggleFullscreen}
      onOpenRoomPanel={props.onOpenRoomPanel}
      onStartEdit={props.onStartEdit}
      onEditingTextChange={props.onEditingTextChange}
      onSaveEdit={props.onSaveEdit}
      onCancelEdit={props.onCancelEdit}
      onDeleteMessage={props.onDeleteMessage}
      onWithdrawMessage={props.onWithdrawMessage}
      onRegenerate={props.onRegenerate}
      onContinue={props.onContinue}
      onPrevSwipe={props.onPrevSwipe}
      onNextSwipe={props.onNextSwipe}
      onBack={props.onBack}
    />
  );
}
