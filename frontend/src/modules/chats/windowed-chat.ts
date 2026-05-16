import { coreApiClient } from '@/lib/api/core-client';
import { nativeBridge } from '@/lib/native/bridge';
import { isMobileLayout } from '@/shared/utils/platform';
import {
  getChatMessages,
  type ChatPayload,
  type ChatPayloadCursor,
  type ChatPayloadPatch,
} from '@/types/domain';

export const DEFAULT_CHAT_WINDOW_LINES_DESKTOP = 100;
export const DEFAULT_CHAT_WINDOW_LINES_MOBILE = 50;
export const CHAT_WINDOW_PREPEND_LINES = 50;

export type WindowedChatTarget =
  | {
      kind: 'character';
      characterName: string;
      avatarUrl: string;
      fileName: string;
    }
  | {
      kind: 'group';
      id: string;
    };

export type WindowedChatState = {
  cursor: ChatPayloadCursor | null;
  hasMoreBefore: boolean;
  startIndex: number;
  savedMessageCount: number;
  dirtyFromIndex: number;
};

function normalizeChatFileName(value: string): string {
  return String(value || '').trim().replace(/\.jsonl$/i, '');
}

function normalizeAvatarFileName(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  const decoded = decodeURIComponent(trimmed.split('?')[0].split('#')[0]);
  const normalized = decoded.replace(/[\\/]+/g, '/');
  const fileName = normalized.split('/').pop() ?? '';
  return fileName || null;
}

function resolveCharacterDirectoryId(characterName: string, avatarUrl: string): string {
  const avatarFile = normalizeAvatarFileName(avatarUrl);
  if (avatarFile) {
    return avatarFile.replace(/\.[^/.]+$/, '');
  }
  return String(characterName || '').trim();
}

function getInitialWindowSize(): number {
  return isMobileLayout() ? DEFAULT_CHAT_WINDOW_LINES_MOBILE : DEFAULT_CHAT_WINDOW_LINES_DESKTOP;
}

function parseJsonLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function serializePayloadHeader(payload: ChatPayload): string {
  const header = payload[0];
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    throw new Error('Chat payload header is missing');
  }
  return JSON.stringify(header);
}

function serializeMessageLines(payload: ChatPayload): string[] {
  return payload.slice(1).map((entry) => JSON.stringify(entry));
}

function parsePayloadFromJsonLines(header: string, lines: string[]): ChatPayload {
  return [parseJsonLine(header), ...lines.map(parseJsonLine)] as ChatPayload;
}

function parseMessageLines(lines: string[]): ChatPayload {
  return lines.map(parseJsonLine) as ChatPayload;
}

function attachCursorWindowMetadata(cursor: ChatPayloadCursor | null, startIndex: number, totalMessages: number): ChatPayloadCursor | null {
  if (!cursor) {
    return null;
  }

  return {
    ...cursor,
    startIndex,
    totalMessages,
  };
}

function resolveSavedLoadedCount(state: WindowedChatState): number {
  return Math.max(0, state.savedMessageCount - state.startIndex);
}

function createWindowState(
  payload: ChatPayload,
  cursor: ChatPayloadCursor | null,
  hasMoreBefore: boolean,
  startIndex: number,
  totalMessages: number,
): WindowedChatState {
  const loadedMessageCount = getChatMessages(payload).length;
  const normalizedStartIndex = Math.max(0, startIndex);
  const normalizedSavedCount = Math.max(totalMessages, normalizedStartIndex + loadedMessageCount);
  return {
    cursor: attachCursorWindowMetadata(cursor, normalizedStartIndex, normalizedSavedCount),
    hasMoreBefore,
    startIndex: normalizedStartIndex,
    savedMessageCount: normalizedSavedCount,
    dirtyFromIndex: loadedMessageCount,
  };
}

function finalizeWindowState(payload: ChatPayload, state: WindowedChatState): WindowedChatState {
  const loadedMessageCount = getChatMessages(payload).length;
  const normalizedStartIndex = Math.max(0, state.startIndex);
  const normalizedSavedCount = Math.max(state.savedMessageCount, normalizedStartIndex + loadedMessageCount);
  const normalizedDirtyIndex = Math.min(Math.max(0, state.dirtyFromIndex), loadedMessageCount);
  return {
    ...state,
    cursor: attachCursorWindowMetadata(state.cursor, normalizedStartIndex, normalizedSavedCount),
    startIndex: normalizedStartIndex,
    savedMessageCount: normalizedSavedCount,
    dirtyFromIndex: normalizedDirtyIndex,
  };
}

function findFirstDifference(previousPayload: ChatPayload, nextPayload: ChatPayload): number {
  const previousMessages = getChatMessages(previousPayload);
  const nextMessages = getChatMessages(nextPayload);
  const maxLength = Math.max(previousMessages.length, nextMessages.length);

  for (let index = 0; index < maxLength; index += 1) {
    const previousLine = previousMessages[index] ? JSON.stringify(previousMessages[index]) : null;
    const nextLine = nextMessages[index] ? JSON.stringify(nextMessages[index]) : null;
    if (previousLine !== nextLine) {
      return index;
    }
  }

  return maxLength;
}

export function markWindowStateDirty(previousPayload: ChatPayload, nextPayload: ChatPayload, state: WindowedChatState | null): WindowedChatState | null {
  if (!state) {
    return state;
  }

  const diffIndex = findFirstDifference(previousPayload, nextPayload);
  return {
    ...state,
    dirtyFromIndex: Math.min(state.dirtyFromIndex, diffIndex),
  };
}

export function shiftWindowStateAfterPrepend(state: WindowedChatState, prependedMessages: number): WindowedChatState {
  return {
    ...state,
    startIndex: Math.max(0, state.startIndex - prependedMessages),
    savedMessageCount: state.savedMessageCount,
    dirtyFromIndex: state.dirtyFromIndex + prependedMessages,
  };
}

export function buildWindowedPayloadPatch(payload: ChatPayload, state: WindowedChatState): {
  patch: ChatPayloadPatch;
  savedMessageCount: number;
  dirtyFromIndex: number;
} {
  const messages = getChatMessages(payload);
  const dirtyFromIndex = Number(state.dirtyFromIndex);
  const savedLoadedCount = resolveSavedLoadedCount(state);

  if (dirtyFromIndex < savedLoadedCount) {
    return {
      patch: {
        kind: 'rewriteFromIndex',
        startIndex: dirtyFromIndex,
        lines: messages.slice(dirtyFromIndex).map((entry) => JSON.stringify(entry)),
      },
      savedMessageCount: state.startIndex + messages.length,
      dirtyFromIndex: messages.length,
    };
  }

  if (messages.length < savedLoadedCount) {
    return {
      patch: {
        kind: 'rewriteFromIndex',
        startIndex: messages.length,
        lines: [],
      },
      savedMessageCount: state.startIndex + messages.length,
      dirtyFromIndex: messages.length,
    };
  }

  if (messages.length > savedLoadedCount) {
    return {
      patch: {
        kind: 'append',
        lines: messages.slice(savedLoadedCount).map((entry) => JSON.stringify(entry)),
      },
      savedMessageCount: state.startIndex + messages.length,
      dirtyFromIndex: messages.length,
    };
  }

  return {
    patch: { kind: 'append', lines: [] },
    savedMessageCount: state.startIndex + messages.length,
    dirtyFromIndex: messages.length,
  };
}

async function loadCharacterTail(target: Extract<WindowedChatTarget, { kind: 'character' }>, maxLines: number): Promise<{ payload: ChatPayload; state: WindowedChatState }> {
  const result = await nativeBridge.chatTransport.getCharacterPayloadTail(
    resolveCharacterDirectoryId(target.characterName, target.avatarUrl),
    normalizeChatFileName(target.fileName),
    maxLines,
    true,
  );

  if (!result?.header) {
    return {
      payload: [],
      state: createWindowState([], null, false, 0, 0),
    };
  }

  const payload = parsePayloadFromJsonLines(result.header, result.lines ?? []);
  const messageCount = getChatMessages(payload).length;
  const totalMessages = Number(result.totalMessages ?? result.cursor?.totalMessages ?? messageCount);
  const startIndex = Number(result.startIndex ?? result.cursor?.startIndex ?? Math.max(0, totalMessages - messageCount));
  const state = createWindowState(payload, result.cursor ?? null, Boolean(result.hasMoreBefore), startIndex, totalMessages);
  return {
    payload,
    state,
  };
}

async function loadGroupTail(target: Extract<WindowedChatTarget, { kind: 'group' }>, maxLines: number): Promise<{ payload: ChatPayload; state: WindowedChatState }> {
  const result = await nativeBridge.chatTransport.getGroupPayloadTail(normalizeChatFileName(target.id), maxLines, true);

  if (!result?.header) {
    return {
      payload: [],
      state: createWindowState([], null, false, 0, 0),
    };
  }

  const payload = parsePayloadFromJsonLines(result.header, result.lines ?? []);
  const messageCount = getChatMessages(payload).length;
  const totalMessages = Number(result.totalMessages ?? result.cursor?.totalMessages ?? messageCount);
  const startIndex = Number(result.startIndex ?? result.cursor?.startIndex ?? Math.max(0, totalMessages - messageCount));
  return {
    payload,
    state: createWindowState(payload, result.cursor ?? null, Boolean(result.hasMoreBefore), startIndex, totalMessages),
  };
}

export async function loadInitialChatWindow(target: WindowedChatTarget): Promise<{ payload: ChatPayload; state: WindowedChatState }> {
  if (!nativeBridge.isTauri()) {
    if (target.kind === 'character') {
      const result = await coreApiClient.chats.getCharacter(target.avatarUrl, target.fileName);
      return {
        payload: result.payload,
        state: createWindowState(result.payload, null, false, 0, getChatMessages(result.payload).length),
      };
    }

    const result = await coreApiClient.chats.getGroup(target.id);
    return {
      payload: result.payload,
      state: createWindowState(result.payload, null, false, 0, getChatMessages(result.payload).length),
    };
  }

  const maxLines = getInitialWindowSize();
  if (target.kind === 'character') {
    return loadCharacterTail(target, maxLines);
  }

  return loadGroupTail(target, maxLines);
}

export async function loadChatWindowBefore(target: WindowedChatTarget, payload: ChatPayload, state: WindowedChatState): Promise<{ payload: ChatPayload; state: WindowedChatState }> {
  if (!nativeBridge.isTauri() || !state.hasMoreBefore || !state.cursor || payload.length === 0) {
    return { payload, state };
  }

  const result = target.kind === 'character'
    ? await nativeBridge.chatTransport.getCharacterPayloadBefore(
        resolveCharacterDirectoryId(target.characterName, target.avatarUrl),
        normalizeChatFileName(target.fileName),
        state.cursor,
        CHAT_WINDOW_PREPEND_LINES,
      )
    : await nativeBridge.chatTransport.getGroupPayloadBefore(normalizeChatFileName(target.id), state.cursor, CHAT_WINDOW_PREPEND_LINES);

  const prependedMessages = parseMessageLines(result?.lines ?? []);
  const nextPayload = [payload[0], ...prependedMessages, ...payload.slice(1)] as ChatPayload;
  const shiftedState = shiftWindowStateAfterPrepend(state, prependedMessages.length);
  const nextStartIndex = Number(result?.startIndex ?? result?.cursor?.startIndex ?? Math.max(0, state.startIndex - prependedMessages.length));
  const totalMessages = Number(result?.totalMessages ?? result?.cursor?.totalMessages ?? state.savedMessageCount);

  return {
    payload: nextPayload,
    state: finalizeWindowState(nextPayload, {
      ...shiftedState,
      cursor: attachCursorWindowMetadata(result?.cursor ?? state.cursor, nextStartIndex, totalMessages),
      hasMoreBefore: Boolean(result?.hasMoreBefore),
      startIndex: nextStartIndex,
      savedMessageCount: totalMessages,
    }),
  };
}

export async function hydrateCompleteChatPayload(target: WindowedChatTarget, payload: ChatPayload, state: WindowedChatState): Promise<ChatPayload> {
  if (!nativeBridge.isTauri() || !state.hasMoreBefore || !state.cursor || payload.length === 0) {
    return payload;
  }

  let currentPayload = payload;
  let currentState = state;

  while (currentState.hasMoreBefore && currentState.cursor) {
    const next = await loadChatWindowBefore(target, currentPayload, currentState);
    currentPayload = next.payload;
    currentState = next.state;
  }

  return currentPayload;
}

export async function saveChatWindow(target: WindowedChatTarget, payload: ChatPayload, state: WindowedChatState | null, force = false): Promise<WindowedChatState | null> {
  if (payload.length === 0) {
    return state;
  }

  if (!nativeBridge.isTauri() || !state?.cursor) {
    if (target.kind === 'character') {
      await coreApiClient.chats.saveCharacter(target.avatarUrl, target.fileName, payload);
    } else {
      await coreApiClient.chats.saveGroup(target.id, payload);
    }

    return state
      ? finalizeWindowState(payload, {
          ...state,
          hasMoreBefore: false,
          savedMessageCount: state.startIndex + getChatMessages(payload).length,
          dirtyFromIndex: getChatMessages(payload).length,
        })
      : null;
  }

  const header = serializePayloadHeader(payload);
  const patchState = buildWindowedPayloadPatch(payload, state);
  const cursor = target.kind === 'character'
    ? await nativeBridge.chatTransport.patchCharacterPayloadWindowed(
        resolveCharacterDirectoryId(target.characterName, target.avatarUrl),
        normalizeChatFileName(target.fileName),
        state.cursor,
        header,
        patchState.patch,
        force,
      )
    : await nativeBridge.chatTransport.patchGroupPayloadWindowed(
        normalizeChatFileName(target.id),
        state.cursor,
        header,
        patchState.patch,
        force,
      );

  return finalizeWindowState(payload, {
    ...state,
    cursor: attachCursorWindowMetadata(cursor, state.startIndex, patchState.savedMessageCount),
    savedMessageCount: patchState.savedMessageCount,
    dirtyFromIndex: patchState.dirtyFromIndex,
  });
}

export async function overwriteChatWindow(target: WindowedChatTarget, payload: ChatPayload, state: WindowedChatState | null, force = false): Promise<WindowedChatState | null> {
  if (payload.length === 0) {
    return state;
  }

  if (!nativeBridge.isTauri() || !state?.cursor) {
    return saveChatWindow(target, payload, state, force);
  }

  const cursor = target.kind === 'character'
    ? await nativeBridge.chatTransport.saveCharacterPayloadWindowed(
        resolveCharacterDirectoryId(target.characterName, target.avatarUrl),
        normalizeChatFileName(target.fileName),
        state.cursor,
        serializePayloadHeader(payload),
        serializeMessageLines(payload),
        force,
      )
    : await nativeBridge.chatTransport.saveGroupPayloadWindowed(
        normalizeChatFileName(target.id),
        state.cursor,
        serializePayloadHeader(payload),
        serializeMessageLines(payload),
        force,
      );

  return finalizeWindowState(payload, {
    ...state,
    cursor: attachCursorWindowMetadata(cursor, state.startIndex, state.startIndex + getChatMessages(payload).length),
    savedMessageCount: state.startIndex + getChatMessages(payload).length,
    dirtyFromIndex: getChatMessages(payload).length,
  });
}
