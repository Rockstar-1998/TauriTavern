import { createSignal } from 'solid-js';

import type { ChatPayload, ChatProviderDraft } from '@/types/domain';

export type EditingMessageState = {
  index: number;
  text: string;
} | null;

export function createChatsStore(initialProviderDraft: ChatProviderDraft) {
  const [draftPayload, setDraftPayload] = createSignal<ChatPayload>([]);
  const [composer, setComposer] = createSignal('');
  const [renameText, setRenameText] = createSignal('');
  const [editingMessage, setEditingMessage] = createSignal<EditingMessageState>(null);
  const [dirty, setDirty] = createSignal(false);
  const [providerDraft, setProviderDraft] = createSignal<ChatProviderDraft>(initialProviderDraft);
  const [providerInitialized, setProviderInitialized] = createSignal(false);
  const [abortController, setAbortController] = createSignal<AbortController | null>(null);
  const [persistedSession, setPersistedSession] = createSignal(false);

  return {
    draftPayload,
    setDraftPayload,
    composer,
    setComposer,
    renameText,
    setRenameText,
    editingMessage,
    setEditingMessage,
    dirty,
    setDirty,
    providerDraft,
    setProviderDraft,
    providerInitialized,
    setProviderInitialized,
    abortController,
    setAbortController,
    persistedSession,
    setPersistedSession,
  };
}