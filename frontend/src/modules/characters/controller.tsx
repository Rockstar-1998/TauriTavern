import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, type Accessor } from 'solid-js';
import { createStore } from 'solid-js/store';

import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { getErrorMessage } from '@/lib/api/http';
import { locale } from '@/shared/i18n';
import { avatarStem } from '@/shared/utils/format';
import type { ContextSectionGroup } from '@/types/ui-desktop';

import type { CharacterEditorForm } from './components/CharacterEditorModal';
import type { CharacterEditorSection } from './editor-sections';

const initialForm: CharacterEditorForm = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  exampleMessages: '',
  creator: '',
  creatorNotes: '',
  version: '',
  tags: [],
  systemPrompt: '',
  postHistoryInstructions: '',
  talkativeness: 0.5,
  favorite: false,
  alternateGreetings: [],
  world: '',
  avatarFile: null,
};

function toForm(detail?: Record<string, unknown>): CharacterEditorForm {
  if (!detail) {
    return { ...initialForm };
  }

  return {
    name: String(detail.name ?? ''),
    description: String(detail.description ?? ''),
    personality: String(detail.personality ?? ''),
    scenario: String(detail.scenario ?? ''),
    firstMessage: String(detail.first_mes ?? ''),
    exampleMessages: String(detail.mes_example ?? ''),
    creator: String(detail.creator ?? ''),
    creatorNotes: String(detail.creator_notes ?? ''),
    version: String(detail.character_version ?? ''),
    tags: Array.isArray(detail.tags) ? detail.tags.map((item) => String(item)) : [],
    systemPrompt: String(detail.system_prompt ?? ''),
    postHistoryInstructions: String(detail.post_history_instructions ?? ''),
    talkativeness: Number(detail.talkativeness ?? 0.5),
    favorite: Boolean(detail.fav),
    alternateGreetings: Array.isArray(detail.alternate_greetings) ? detail.alternate_greetings.map((item) => String(item)) : [],
    world: typeof (detail.extensions as Record<string, unknown> | undefined)?.world === 'string'
      ? String((detail.extensions as Record<string, unknown>).world)
      : '',
    avatarFile: null,
  };
}

type CharacterDialogState =
  | { open: false }
  | { open: true; mode: 'create' }
  | { open: true; mode: 'edit'; section: CharacterEditorSection };

export type CharactersControllerInput = {
  selectedId?: Accessor<string>;
  autoSelectFirst?: boolean;
  onSelectCharacter: (id: string) => void;
  onClearSelection: () => void;
  onOpenChat: (id: string) => void;
};

export type CharacterEditorModalState =
  | {
      mode: 'create';
      form: CharacterEditorForm;
      worldNames: string[];
      pending: boolean;
      onClose: () => void;
      onSubmit: () => void;
      onChange: <T extends keyof CharacterEditorForm>(field: T, value: CharacterEditorForm[T]) => void;
    }
  | {
      mode: 'edit';
      section: CharacterEditorSection;
      form: CharacterEditorForm;
      worldNames: string[];
      pending: boolean;
      onClose: () => void;
      onSubmit: () => void;
      onChange: <T extends keyof CharacterEditorForm>(field: T, value: CharacterEditorForm[T]) => void;
    };

export function createCharactersController(input: CharactersControllerInput) {
  const toast = useToasts();
  const queryClient = useQueryClient();
  const [search, setSearch] = createSignal('');
  const [dialogState, setDialogState] = createSignal<CharacterDialogState>({ open: false });
  const [form, setForm] = createStore<CharacterEditorForm>({ ...initialForm });

  const charactersQuery = createQuery(() => ({ queryKey: ['characters'], queryFn: () => coreApiClient.characters.list() }));
  const settingsQuery = createQuery(() => ({ queryKey: ['settings'], queryFn: () => coreApiClient.getSettings() }));

  const selectedId = createMemo(() => input.selectedId?.() ?? '');
  const selectedAvatar = createMemo(() => (selectedId() ? `${selectedId()}.png` : ''));
  const selectedExists = createMemo(() => (charactersQuery.data ?? []).some((character) => avatarStem(character.avatar || character.name) === selectedId()));
  const hasCharacters = createMemo(() => (charactersQuery.data?.length ?? 0) > 0);

  createEffect(() => {
    if (!input.autoSelectFirst || charactersQuery.isPending || !hasCharacters() || selectedExists()) {
      return;
    }

    const first = charactersQuery.data?.[0];
    if (first) {
      input.onSelectCharacter(avatarStem(first.avatar || first.name));
    }
  });

  const detailQuery = createQuery(() => ({
    queryKey: ['character', selectedAvatar()],
    enabled: Boolean(selectedAvatar()) && selectedExists(),
    queryFn: () => coreApiClient.characters.get(selectedAvatar()),
  }));

  const filtered = createMemo(() => {
    const keyword = search().trim().toLowerCase();
    const items = charactersQuery.data ?? [];
    if (!keyword) {
      return items;
    }

    return items.filter((character) => [character.name, character.description, character.personality, character.scenario].filter(Boolean).join(' ').toLowerCase().includes(keyword));
  });

  const favorites = createMemo(() => filtered().filter((character) => character.fav));
  const regularCharacters = createMemo(() => filtered().filter((character) => !character.fav));

  const groups = createMemo<ContextSectionGroup[]>(() => {
    const items = filtered();
    const toItem = (character: (typeof items)[number]) => ({
      id: avatarStem(character.avatar || character.name),
      title: character.name || avatarStem(character.avatar),
      description: character.description || character.personality || character.scenario || locale.characters.noSummary,
      active: selectedId() === avatarStem(character.avatar || character.name),
      tone: selectedId() === avatarStem(character.avatar || character.name) ? 'active' as const : 'default' as const,
      onClick: () => input.onSelectCharacter(avatarStem(character.avatar || character.name)),
      leading: <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-base font-semibold text-slate-700">{(character.name || avatarStem(character.avatar)).slice(0, 1)}</div>,
    });

    if (search().trim()) {
      return [{ id: 'search-results', title: locale.characters.searchResults, items: items.map(toItem) }];
    }

    return [
      { id: 'favorites', title: locale.characters.favorites, items: items.filter((character) => character.fav).map(toItem) },
      { id: 'all', title: locale.characters.allCharacters, items: items.filter((character) => !character.fav).map(toItem) },
    ];
  });

  const createCharacterMutation = createMutation(() => ({
    mutationFn: async () => {
      const fileName = await coreApiClient.characters.create(form, form.avatarFile);
      return avatarStem(fileName);
    },
    onSuccess: async (id) => {
      toast.push({ title: locale.characters.createSuccess, tone: 'success' });
      setDialogState({ open: false });
      input.onSelectCharacter(id);
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.characters.createFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const saveCharacterMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!selectedAvatar()) {
        throw new Error('missing selected avatar');
      }
      return coreApiClient.characters.update(selectedAvatar(), form, form.avatarFile);
    },
    onSuccess: async () => {
      toast.push({ title: locale.characters.saveSuccess, tone: 'success' });
      setDialogState({ open: false });
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
      await queryClient.invalidateQueries({ queryKey: ['character', selectedAvatar()] });
    },
    onError: (error: unknown) => toast.push({ title: locale.characters.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const importCharacterMutation = createMutation(() => ({
    mutationFn: (file: File) => coreApiClient.characters.import(file),
    onSuccess: async (result) => {
      toast.push({ title: locale.characters.importSuccess, tone: 'success' });
      input.onSelectCharacter(avatarStem(result.file_name));
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.characters.importFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const duplicateCharacterMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!selectedAvatar()) {
        throw new Error('missing selected avatar');
      }

      return coreApiClient.characters.duplicate(selectedAvatar());
    },
    onSuccess: async () => {
      toast.push({ title: locale.characters.duplicateSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.characters.duplicateFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const deleteCharacterMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!selectedAvatar()) {
        throw new Error('missing selected avatar');
      }

      return coreApiClient.characters.delete(selectedAvatar(), detailQuery.data?.name);
    },
    onSuccess: async () => {
      toast.push({ title: locale.characters.deleteSuccess, tone: 'success' });
      setDialogState({ open: false });
      input.onClearSelection();
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.characters.deleteFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  function openCreate(): void {
    setForm({ ...initialForm });
    setDialogState({ open: true, mode: 'create' });
  }

  function openEditSection(section: CharacterEditorSection): void {
    if (!detailQuery.data) {
      throw new Error('missing character detail for edit');
    }

    setForm(toForm(detailQuery.data as Record<string, unknown> | undefined));
    setDialogState({ open: true, mode: 'edit', section });
  }

  function closeEditor(): void {
    setDialogState({ open: false });
  }

  function submitEditor(): void {
    const state = dialogState();
    if (!state.open) {
      return;
    }

    if (state.mode === 'create') {
      void createCharacterMutation.mutateAsync();
      return;
    }

    void saveCharacterMutation.mutateAsync();
  }

  function startChat(): void {
    if (!selectedId()) {
      toast.push({ title: locale.chats.selectCharacterToStart, tone: 'warning' });
      return;
    }

    input.onOpenChat(selectedId());
  }

  function exportCharacter(format: 'json' | 'png'): void {
    if (!selectedAvatar()) {
      return;
    }

    void coreApiClient.characters.export(selectedAvatar(), format);
  }

  const editorModal = createMemo<CharacterEditorModalState | null>(() => {
    const state = dialogState();
    if (!state.open) {
      return null;
    }

    const shared = {
      form,
      worldNames: settingsQuery.data?.world_names ?? [],
      pending: createCharacterMutation.isPending || saveCharacterMutation.isPending,
      onClose: closeEditor,
      onSubmit: submitEditor,
      onChange: <T extends keyof CharacterEditorForm>(field: T, value: CharacterEditorForm[T]) => {
        setForm(field, value);
      },
    };

    if (state.mode === 'create') {
      return {
        mode: 'create',
        ...shared,
      };
    }

    return {
      mode: 'edit',
      section: state.section,
      ...shared,
    };
  });

  const recentItems = createMemo(() => (charactersQuery.data ?? []).slice(0, 5).map((character) => ({
    id: avatarStem(character.avatar || character.name),
    title: character.name || avatarStem(character.avatar),
    description: character.description || character.personality || locale.characters.noSummary,
    onClick: () => input.onSelectCharacter(avatarStem(character.avatar || character.name)),
    leading: <div class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-300 text-lg font-semibold text-slate-700">{(character.name || avatarStem(character.avatar)).slice(0, 1)}</div>,
  })));

  return {
    search,
    setSearch,
    filtered,
    favorites,
    regularCharacters,
    groups,
    form,
    detailQuery,
    charactersQuery,
    settingsQuery,
    hasCharacters,
    selectedId,
    selectedAvatar,
    editorModal,
    recentItems,
    createCharacterMutation,
    importCharacterMutation,
    duplicateCharacterMutation,
    deleteCharacterMutation,
    openCreate,
    openEditSection,
    closeEditor,
    submitEditor,
    selectCharacter: input.onSelectCharacter,
    clearSelection: input.onClearSelection,
    startChat,
    exportCharacter,
  };
}
