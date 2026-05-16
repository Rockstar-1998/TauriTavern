import { useNavigate, useParams } from '@solidjs/router';
import { ChevronLeft } from 'lucide-solid';
import { createEffect, Show, type JSX } from 'solid-js';

import { LoadingBlock } from '@/shared/components/ui';
import { avatarStem } from '@/shared/utils/format';

import { CharacterEditorDialog } from '../components/CharacterEditorDialog';
import { CharacterWorkspace } from '../components/CharacterWorkspace';
import { createCharactersController } from '../controller';

export default function CharacterDetailMobilePage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const controller = createCharactersController({
    selectedId: () => decodeURIComponent(params.id ?? ''),
    autoSelectFirst: true,
    onSelectCharacter: (id) => navigate(`/characters/${encodeURIComponent(id)}`, { replace: true }),
    onClearSelection: () => navigate('/characters', { replace: true }),
    onOpenChat: (id) => navigate(`/chats/character/${encodeURIComponent(id)}?create=single`),
  });

  const pageTitle = () => controller.detailQuery.data?.name || avatarStem(decodeURIComponent(params.id ?? ''));

  createEffect(() => {
    console.info('[mobile-character-detail] multiplayer entry route', {
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      selectedId: decodeURIComponent(params.id ?? ''),
      resolvedName: pageTitle(),
      loading: controller.detailQuery.isPending,
    });
  });

  return (
    <div class="flex h-full flex-col bg-slate-50">
      <header class="flex h-14 shrink-0 items-center border-b bg-white px-2">
        <button
          type="button"
          onClick={() => navigate('/characters')}
          class="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div class="ml-1 flex-1 truncate font-semibold text-slate-900">{pageTitle()}</div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-4 pb-24">
        <Show when={!controller.detailQuery.isPending} fallback={<LoadingBlock />}>
          <CharacterWorkspace
            detail={controller.detailQuery.data}
            onEditSection={controller.openEditSection}
            onStartChat={controller.startChat}
            onStartMultiplayerChat={() => navigate(`/chats/character/${encodeURIComponent(decodeURIComponent(params.id ?? ''))}?create=multiplayer`)}
            onDuplicate={() => void controller.duplicateCharacterMutation.mutateAsync()}
            onDelete={() => void controller.deleteCharacterMutation.mutateAsync()}
            onExportJson={() => controller.exportCharacter('json')}
            onExportPng={() => controller.exportCharacter('png')}
          />
        </Show>
      </main>

      <Show when={controller.editorModal()}>
        {(modal) => (
          <CharacterEditorDialog modal={modal()} />
        )}
      </Show>
    </div>
  );
}
