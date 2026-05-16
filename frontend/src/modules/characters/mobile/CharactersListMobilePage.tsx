import { useNavigate, useSearchParams } from '@solidjs/router';
import { ArrowDownToLine, UserPlus } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, LoadingBlock } from '@/shared/components/ui';
import { SearchField } from '@/shared/components/desktop/SearchField';
import { avatarStem } from '@/shared/utils/format';

import { CharacterEditorDialog } from '../components/CharacterEditorDialog';
import { createCharactersController } from '../controller';

export default function CharactersListMobilePage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams<{ intent?: string }>();
  const joinRoomIntent = () => (searchParams.intent ?? '').trim() === 'join-room';
  const controller = createCharactersController({
    onSelectCharacter: (id) => navigate(
      joinRoomIntent()
        ? `/chats/character/${encodeURIComponent(id)}?create=single&join=room`
        : `/characters/${encodeURIComponent(id)}`,
    ),
    onClearSelection: () => navigate('/characters'),
    onOpenChat: (id) => navigate(`/chats/character/${encodeURIComponent(id)}?create=single`),
  });

  return (
    <div class="flex h-full flex-col px-4 py-4">
      <div class="mb-4 space-y-3">
        <h1 class="text-2xl font-bold">{locale.characters.title}</h1>
        <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Button variant="secondary" class="shrink-0" onClick={controller.openCreate}>
            <UserPlus size={16} class="mr-2" />
            {locale.characters.createCharacter}
          </Button>
          <label class={`inline-flex shrink-0 items-center justify-center rounded-[1.2rem] bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition ${controller.importCharacterMutation.isPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:bg-slate-200'}`} title={locale.characters.importCharacter}>
            <ArrowDownToLine size={16} class="mr-2" />
            {locale.characters.importCharacter}
            <input
              type="file"
              class="hidden"
              accept=".png,.json,.yaml,.yml,.charx"
              disabled={controller.importCharacterMutation.isPending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) {
                  return;
                }

                void controller.importCharacterMutation.mutateAsync(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>
        <SearchField
          value={controller.search()}
          onInput={(event) => controller.setSearch(event.currentTarget.value)}
          placeholder={locale.characters.searchPlaceholder}
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={!controller.charactersQuery.isPending} fallback={<LoadingBlock />}>
          <div class="space-y-6 pb-20">
            <Show when={controller.favorites().length > 0}>
              <section>
                <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{locale.characters.favorites}</h2>
                <div class="grid grid-cols-1 gap-3">
                  <For each={controller.favorites()}>
                    {(character) => <CharacterCard name={character.name || avatarStem(character.avatar)} summary={character.description || character.personality || character.scenario || locale.characters.noSummary} onClick={() => controller.selectCharacter(avatarStem(character.avatar || character.name))} />}
                  </For>
                </div>
              </section>
            </Show>

            <section>
              <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{locale.characters.allCharacters}</h2>
              <Show when={controller.regularCharacters().length > 0} fallback={<div class="py-10 text-center text-sm text-slate-400">{locale.characters.emptyList}</div>}>
                <div class="grid grid-cols-1 gap-3">
                  <For each={controller.regularCharacters()}>
                    {(character) => <CharacterCard name={character.name || avatarStem(character.avatar)} summary={character.description || character.personality || character.scenario || locale.characters.noSummary} onClick={() => controller.selectCharacter(avatarStem(character.avatar || character.name))} />}
                  </For>
                </div>
              </Show>
            </section>
          </div>
        </Show>
      </div>

      <Show when={controller.editorModal()}>
        {(modal) => (
          <CharacterEditorDialog modal={modal()} />
        )}
      </Show>
    </div>
  );
}

function CharacterCard(props: { name: string; summary: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="flex items-center gap-4 rounded-2xl border bg-white p-3 text-left shadow-sm transition-colors active:bg-slate-50"
    >
      <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-200 text-lg font-bold text-slate-600">
        {props.name.slice(0, 1)}
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate font-semibold text-slate-900">{props.name}</div>
        <div class="mt-0.5 line-clamp-2 text-xs text-slate-500">{props.summary}</div>
      </div>
    </button>
  );
}
