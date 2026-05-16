import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';

import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { saveJsonExport } from '@/lib/api/export';
import { getErrorMessage } from '@/lib/api/http';
import { locale } from '@/shared/i18n';

import {
  createEmptyWorldInfoRecord,
  createWorldInfoEntry,
  normalizeWorldInfoRecord,
  serializeWorldInfoRecord,
  type NormalizedWorldInfoRecord,
  type WorldInfoEntry,
} from './editor-schema';
import { matchesWorldInfoEntry, sortWorldInfoEntries, type WorldInfoEntrySort } from './entry-summary';

type BookDialogState =
  | { open: false }
  | { open: true; mode: 'create' | 'rename' | 'duplicate'; title: string; confirmLabel: string };

type SaveState = {
  bookName: string;
  dirty: boolean;
  pending: boolean;
  error: string | null;
};

export type WorldInfoControllerInput = {
  selectedBook: Accessor<string>;
  autoSelectFirst?: boolean;
  onSelectBook: (name: string) => void;
  onClearSelection: () => void;
};

export function buildWorldInfoUrl(selected?: string): string {
  return selected ? `/world-info?selected=${encodeURIComponent(selected)}` : '/world-info';
}

function getBookSeedName(): string {
  return '新世界书';
}

function getFreeBookName(existingNames: string[], baseName: string): string {
  const normalized = baseName.trim() || getBookSeedName();
  if (!existingNames.includes(normalized)) {
    return normalized;
  }

  let index = 2;
  while (existingNames.includes(`${normalized} ${index}`)) {
    index += 1;
  }

  return `${normalized} ${index}`;
}

function cloneRecord(record: NormalizedWorldInfoRecord): NormalizedWorldInfoRecord {
  return structuredClone(record);
}

export function createWorldInfoController(input: WorldInfoControllerInput) {
  const toast = useToasts();
  const queryClient = useQueryClient();
  const [bookSearch, setBookSearch] = createSignal('');
  const [entrySearch, setEntrySearch] = createSignal('');
  const [sortBy, setSortBy] = createSignal<WorldInfoEntrySort>('default');
  const [record, setRecord] = createSignal<NormalizedWorldInfoRecord | null>(null);
  const [recordBookName, setRecordBookName] = createSignal('');
  const [bookDialog, setBookDialog] = createSignal<BookDialogState>({ open: false });
  const [bookNameInput, setBookNameInput] = createSignal('');
  const [editingEntryId, setEditingEntryId] = createSignal<string | null>(null);
  const [saveState, setSaveState] = createSignal<SaveState | null>(null);

  const settingsQuery = createQuery(() => ({
    queryKey: ['settings'],
    queryFn: () => coreApiClient.getSettings(),
  }));

  const worldNames = createMemo(() => settingsQuery.data?.world_names ?? []);
  const hasWorlds = createMemo(() => worldNames().length > 0);
  const selectedExists = createMemo(() => worldNames().includes(input.selectedBook()));

  createEffect(() => {
    if (settingsQuery.isPending) {
      return;
    }

    if (!hasWorlds()) {
      if (input.selectedBook()) {
        input.onClearSelection();
      }
      return;
    }

    if (input.autoSelectFirst && (!input.selectedBook() || !selectedExists())) {
      input.onSelectBook(worldNames()[0]);
    }
  });

  const worldInfoQuery = createQuery(() => ({
    queryKey: ['world-info', input.selectedBook()],
    enabled: Boolean(input.selectedBook()) && selectedExists(),
    queryFn: () => coreApiClient.worldInfo.get(input.selectedBook()),
  }));

  createEffect(() => {
    const selected = input.selectedBook();
    if (!selected) {
      setRecord(null);
      setRecordBookName('');
      setEditingEntryId(null);
      setSaveState(null);
      return;
    }

    if (selected !== recordBookName() && !worldInfoQuery.data) {
      setRecord(null);
      setEditingEntryId(null);
      setSaveState({ bookName: selected, dirty: false, pending: false, error: null });
    }
  });

  createEffect(() => {
    if (!worldInfoQuery.data || !input.selectedBook()) {
      return;
    }

    setRecord(normalizeWorldInfoRecord(worldInfoQuery.data));
    setRecordBookName(input.selectedBook());
    setSaveState((current) => (
      current?.bookName === input.selectedBook() && (current.dirty || current.pending || current.error)
        ? current
        : { bookName: input.selectedBook(), dirty: false, pending: false, error: null }
    ));
  });

  createEffect(() => {
    const currentRecord = record();
    const entryId = editingEntryId();
    if (!currentRecord || !entryId || currentRecord.entries[entryId]) {
      return;
    }
    setEditingEntryId(null);
  });

  const filteredBooks = createMemo(() => {
    const keyword = bookSearch().trim().toLowerCase();
    return worldNames().filter((name) => !keyword || name.toLowerCase().includes(keyword));
  });

  const filteredEntries = createMemo(() => {
    const currentRecord = record();
    if (!currentRecord) {
      return [];
    }

    const matched = Object.values(currentRecord.entries).filter((entry) => matchesWorldInfoEntry(entry, entrySearch()));
    return sortWorldInfoEntries(matched, sortBy());
  });

  const currentEntry = createMemo(() => {
    const currentRecord = record();
    const entryId = editingEntryId();
    if (!currentRecord || !entryId) {
      return undefined;
    }
    return currentRecord.entries[entryId];
  });

  const currentSaveState = createMemo(() => {
    const state = saveState();
    if (!state || state.bookName !== input.selectedBook()) {
      return null;
    }
    return state;
  });

  const saveTimers = new Map<string, number>();
  const pendingDrafts = new Map<string, NormalizedWorldInfoRecord>();

  async function persistWorldInfo(bookName: string, draft: NormalizedWorldInfoRecord): Promise<void> {
    pendingDrafts.delete(bookName);
    setSaveState((current) => (current?.bookName === bookName ? { ...current, pending: true, error: null } : current));

    try {
      await coreApiClient.worldInfo.save(bookName, serializeWorldInfoRecord(draft) as unknown as Record<string, unknown>);
      await queryClient.invalidateQueries({ queryKey: ['world-info', bookName] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaveState((current) => (current?.bookName === bookName ? { ...current, dirty: false, pending: false, error: null } : current));
    } catch (error) {
      const message = getErrorMessage(error);
      setSaveState((current) => (current?.bookName === bookName ? { ...current, dirty: true, pending: false, error: message } : current));
      toast.push({ title: locale.worldInfo.saveFailed, description: message, tone: 'danger' });
    }
  }

  function scheduleWorldInfoSave(bookName: string, draft: NormalizedWorldInfoRecord): void {
    pendingDrafts.set(bookName, cloneRecord(draft));
    const activeTimer = saveTimers.get(bookName);
    if (activeTimer) {
      window.clearTimeout(activeTimer);
    }

    setSaveState((current) => (current?.bookName === bookName
      ? { ...current, dirty: true, pending: false, error: null }
      : { bookName, dirty: true, pending: false, error: null }));

    const handle = window.setTimeout(() => {
      saveTimers.delete(bookName);
      const nextDraft = pendingDrafts.get(bookName);
      if (!nextDraft) {
        return;
      }
      void persistWorldInfo(bookName, nextDraft);
    }, 300);

    saveTimers.set(bookName, handle);
  }

  function cancelScheduledSave(bookName: string): void {
    const timer = saveTimers.get(bookName);
    if (timer) {
      window.clearTimeout(timer);
      saveTimers.delete(bookName);
    }
    pendingDrafts.delete(bookName);
  }

  onCleanup(() => {
    for (const timer of saveTimers.values()) {
      window.clearTimeout(timer);
    }
    for (const [bookName, draft] of pendingDrafts.entries()) {
      void coreApiClient.worldInfo.save(bookName, serializeWorldInfoRecord(draft) as unknown as Record<string, unknown>);
    }
  });

  const createBookMutation = createMutation(() => ({
    mutationFn: async (name: string) => {
      await coreApiClient.worldInfo.save(name, serializeWorldInfoRecord(createEmptyWorldInfoRecord()) as unknown as Record<string, unknown>);
    },
    onSuccess: async (_value, name) => {
      toast.push({ title: locale.worldInfo.createSuccess, tone: 'success' });
      setBookDialog({ open: false });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['world-info'] });
      input.onSelectBook(name);
    },
    onError: (error: unknown) => toast.push({ title: locale.worldInfo.createBook, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const renameBookMutation = createMutation(() => ({
    mutationFn: async (nextName: string) => {
      const currentRecord = record();
      const currentName = input.selectedBook();
      if (!currentRecord || !currentName) {
        throw new Error('missing world info book for rename');
      }
      cancelScheduledSave(currentName);
      await coreApiClient.worldInfo.save(nextName, serializeWorldInfoRecord(currentRecord) as unknown as Record<string, unknown>);
      if (nextName !== currentName) {
        await coreApiClient.worldInfo.delete(currentName);
      }
    },
    onSuccess: async (_value, nextName) => {
      toast.push({ title: locale.worldInfo.renameSuccess, tone: 'success' });
      setBookDialog({ open: false });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['world-info'] });
      input.onSelectBook(nextName);
    },
    onError: (error: unknown) => toast.push({ title: locale.worldInfo.renameBook, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const duplicateBookMutation = createMutation(() => ({
    mutationFn: async (nextName: string) => {
      const currentRecord = record();
      if (!currentRecord) {
        throw new Error('missing world info book for duplicate');
      }
      await coreApiClient.worldInfo.save(nextName, serializeWorldInfoRecord(currentRecord) as unknown as Record<string, unknown>);
    },
    onSuccess: async (_value, nextName) => {
      toast.push({ title: locale.worldInfo.duplicateSuccess, tone: 'success' });
      setBookDialog({ open: false });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['world-info'] });
      input.onSelectBook(nextName);
    },
    onError: (error: unknown) => toast.push({ title: locale.worldInfo.duplicateBook, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const deleteBookMutation = createMutation(() => ({
    mutationFn: async () => {
      const currentName = input.selectedBook();
      if (!currentName) {
        throw new Error('missing world info book for delete');
      }
      cancelScheduledSave(currentName);
      await coreApiClient.worldInfo.delete(currentName);
    },
    onSuccess: async () => {
      toast.push({ title: locale.worldInfo.deleteSuccess, tone: 'success' });
      setEditingEntryId(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['world-info'] });
      input.onClearSelection();
    },
    onError: (error: unknown) => toast.push({ title: locale.worldInfo.deleteBook, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const importWorldInfoMutation = createMutation(() => ({
    mutationFn: (file: File) => coreApiClient.worldInfo.import(file),
    onSuccess: async (payload: Record<string, unknown>) => {
      const importedName = typeof payload.name === 'string' ? payload.name : '';
      toast.push({ title: locale.worldInfo.importSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (importedName) {
        input.onSelectBook(importedName);
      }
    },
    onError: (error: unknown) => toast.push({ title: locale.worldInfo.importBook, description: getErrorMessage(error), tone: 'danger' }),
  }));

  function updateCurrentRecord(nextRecord: NormalizedWorldInfoRecord): void {
    const currentName = input.selectedBook();
    if (!currentName) {
      throw new Error('missing world info book for update');
    }
    setRecord(nextRecord);
    setRecordBookName(currentName);
    scheduleWorldInfoSave(currentName, nextRecord);
  }

  function openCreate(): void {
    setBookNameInput(getFreeBookName(worldNames(), getBookSeedName()));
    setBookDialog({ open: true, mode: 'create', title: locale.worldInfo.createBook, confirmLabel: locale.common.create });
  }

  function openRename(): void {
    const currentName = input.selectedBook();
    if (!currentName) {
      throw new Error('missing world info book for rename dialog');
    }
    setBookNameInput(currentName);
    setBookDialog({ open: true, mode: 'rename', title: locale.worldInfo.renameBook, confirmLabel: locale.common.rename });
  }

  function openDuplicate(): void {
    const currentName = input.selectedBook();
    if (!currentName) {
      throw new Error('missing world info book for duplicate dialog');
    }
    setBookNameInput(getFreeBookName(worldNames(), `${currentName} 副本`));
    setBookDialog({ open: true, mode: 'duplicate', title: locale.worldInfo.duplicateBook, confirmLabel: locale.common.duplicate });
  }

  function closeBookDialog(): void {
    setBookDialog({ open: false });
  }

  async function submitBookDialog(): Promise<void> {
    const state = bookDialog();
    const nextName = bookNameInput().trim();
    if (!state.open || !nextName) {
      return;
    }

    const currentName = input.selectedBook();
    if (state.mode !== 'create' && !currentName) {
      throw new Error('missing current world info book for dialog');
    }
    if ((state.mode !== 'rename' || nextName !== currentName) && worldNames().includes(nextName) && nextName !== currentName) {
      toast.push({ title: locale.worldInfo.bookNameExists, tone: 'danger' });
      return;
    }

    if (state.mode === 'create') {
      await createBookMutation.mutateAsync(nextName);
      return;
    }
    if (state.mode === 'rename') {
      if (nextName === currentName) {
        setBookDialog({ open: false });
        return;
      }
      await renameBookMutation.mutateAsync(nextName);
      return;
    }

    await duplicateBookMutation.mutateAsync(nextName);
  }

  function exportCurrentBook(): void {
    const currentRecord = record();
    const currentName = input.selectedBook();
    if (!currentRecord || !currentName) {
      throw new Error('missing world info book for export');
    }
    void saveJsonExport(serializeWorldInfoRecord(currentRecord), `${currentName}.json`);
  }

  function confirmDeleteBook(): void {
    if (!window.confirm(locale.worldInfo.deleteBookConfirm.replace('{name}', input.selectedBook()))) {
      return;
    }
    void deleteBookMutation.mutateAsync();
  }

  function createEntryDraft(): void {
    const currentRecord = record();
    if (!currentRecord) {
      throw new Error('missing world info record for entry create');
    }
    const entry = createWorldInfoEntry(currentRecord);
    const entryId = String(entry.uid);
    const nextRecord = cloneRecord(currentRecord);
    nextRecord.entries[entryId] = entry;
    updateCurrentRecord(nextRecord);
    setEditingEntryId(entryId);
  }

  function duplicateEntry(): void {
    const currentRecord = record();
    const current = currentEntry();
    if (!currentRecord || !current) {
      throw new Error('missing world info entry for duplicate');
    }

    const fresh = createWorldInfoEntry(currentRecord);
    const duplicate: WorldInfoEntry = {
      ...structuredClone(current),
      uid: fresh.uid,
      displayIndex: fresh.displayIndex,
      extras: structuredClone(current.extras),
    };
    const entryId = String(duplicate.uid);
    const nextRecord = cloneRecord(currentRecord);
    nextRecord.entries[entryId] = duplicate;
    updateCurrentRecord(nextRecord);
    setEditingEntryId(entryId);
  }

  function deleteEntry(): void {
    const currentRecord = record();
    const entryId = editingEntryId();
    if (!currentRecord || !entryId) {
      throw new Error('missing world info entry for delete');
    }
    if (!window.confirm(locale.worldInfo.deleteEntryConfirm)) {
      return;
    }
    const nextRecord = cloneRecord(currentRecord);
    delete nextRecord.entries[entryId];
    updateCurrentRecord(nextRecord);
    setEditingEntryId(null);
  }

  function updateEntryField<T extends keyof WorldInfoEntry>(field: T, value: WorldInfoEntry[T]): void {
    const currentRecord = record();
    const entryId = editingEntryId();
    if (!currentRecord || !entryId) {
      throw new Error('missing world info entry for update');
    }
    const nextRecord = cloneRecord(currentRecord);
    nextRecord.entries[entryId] = {
      ...nextRecord.entries[entryId],
      [field]: value,
    };
    updateCurrentRecord(nextRecord);
  }

  const bookPending = createMemo(() => createBookMutation.isPending || renameBookMutation.isPending || duplicateBookMutation.isPending);
  const bookDialogTitle = createMemo(() => {
    const state = bookDialog();
    return state.open ? state.title : locale.worldInfo.createBook;
  });
  const bookDialogConfirmLabel = createMemo(() => {
    const state = bookDialog();
    return state.open ? state.confirmLabel : locale.common.create;
  });

  return {
    bookSearch,
    setBookSearch,
    entrySearch,
    setEntrySearch,
    sortBy,
    setSortBy,
    record,
    filteredBooks,
    filteredEntries,
    currentEntry,
    currentSaveState,
    settingsQuery,
    worldInfoQuery,
    hasWorlds,
    selectedBook: input.selectedBook,
    worldNames,
    editingEntryId,
    setEditingEntryId,
    createBookMutation,
    renameBookMutation,
    duplicateBookMutation,
    deleteBookMutation,
    importWorldInfoMutation,
    bookDialog,
    bookNameInput,
    setBookNameInput,
    bookPending,
    bookDialogTitle,
    bookDialogConfirmLabel,
    openCreate,
    openRename,
    openDuplicate,
    closeBookDialog,
    submitBookDialog,
    exportCurrentBook,
    confirmDeleteBook,
    createEntryDraft,
    duplicateEntry,
    deleteEntry,
    updateEntryField,
    selectBook: input.onSelectBook,
  };
}
