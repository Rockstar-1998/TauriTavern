import { useNavigate, useSearchParams } from '@solidjs/router';
import { ArrowDownToLine, Filter } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { ContextToolbar } from '@/app/layout/desktop/ContextToolbar';
import { WorkspaceWelcome } from '@/app/layout/desktop/WorkspaceWelcome';
import { locale, getGreeting } from '@/shared/i18n';
import { SearchField } from '@/shared/components/desktop/SearchField';
import { LoadingBlock } from '@/shared/components/ui';

import { CharacterEditorDialog } from './components/CharacterEditorDialog';
import { CharacterPane } from './components/CharacterPane';
import { CharacterWorkspace } from './components/CharacterWorkspace';
import { createCharactersController } from './controller';

export default function CharactersPage(): JSX.Element {
  let pageRef: HTMLDivElement | undefined;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams<{ selected?: string }>();
  const controller = createCharactersController({
    selectedId: () => decodeURIComponent(searchParams.selected ?? ''),
    autoSelectFirst: true,
    onSelectCharacter: (id) => setSearchParams({ selected: id }),
    onClearSelection: () => setSearchParams({}),
    onOpenChat: (id) => navigate(`/chats/character/${encodeURIComponent(id)}?create=single`),
  });

  useMotionMount(() => pageRef, 'page');

  return (
    <div ref={pageRef} class="flex h-full min-h-0 gap-4 overflow-hidden">
      <DesktopContextPane floatingActionLabel={locale.characters.createCharacter} onFloatingAction={controller.openCreate}>
        <ContextToolbar
          title={locale.characters.title}
          subtitle={locale.characters.subtitle}
          search={<SearchField value={controller.search()} onInput={(event) => controller.setSearch(event.currentTarget.value)} placeholder={locale.characters.searchPlaceholder} />}
          actions={(
            <>
              <label class="inline-flex cursor-pointer items-center justify-center rounded-[1.2rem] bg-slate-100 p-3 text-slate-600 hover:bg-slate-200" title={locale.characters.importCharacter}>
                <ArrowDownToLine size={18} />
                <input
                  type="file"
                  class="hidden"
                  accept=".png,.json,.yaml,.yml,.charx"
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
              <button type="button" class="inline-flex items-center justify-center rounded-[1.2rem] bg-slate-100 p-3 text-slate-600 hover:bg-slate-200" title={locale.common.search}>
                <Filter size={18} />
              </button>
            </>
          )}
        />
        <div class="mt-6">
          <CharacterPane groups={controller.groups()} />
        </div>
      </DesktopContextPane>

      <DesktopWorkspaceBoard>
        <Show
          when={controller.detailQuery.data}
          fallback={controller.hasCharacters() ? <LoadingBlock /> : (
            <WorkspaceWelcome
              greeting={getGreeting()}
              subtitle={locale.greetings.subtitle}
              hero={{
                title: locale.greetings.quickStart,
                description: locale.greetings.quickStartHint,
                actionLabel: locale.characters.createCharacter,
                onAction: controller.openCreate,
              }}
              recentItems={controller.recentItems()}
            />
          )}
        >
          <CharacterWorkspace
            detail={controller.detailQuery.data}
            onEditSection={controller.openEditSection}
            onStartChat={controller.startChat}
            onStartMultiplayerChat={() => navigate(`/chats/character/${encodeURIComponent(controller.selectedId())}?create=multiplayer`)}
            onDuplicate={() => void controller.duplicateCharacterMutation.mutateAsync()}
            onDelete={() => void controller.deleteCharacterMutation.mutateAsync()}
            onExportJson={() => controller.exportCharacter('json')}
            onExportPng={() => controller.exportCharacter('png')}
          />
        </Show>
      </DesktopWorkspaceBoard>

      <Show when={controller.editorModal()}>
        {(modal) => (
          <CharacterEditorDialog modal={modal()} />
        )}
      </Show>
    </div>
  );
}
