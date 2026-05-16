import { useNavigate, useSearchParams } from '@solidjs/router';
import { ArrowDownToLine } from 'lucide-solid';
import { createEffect, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { ContextToolbar } from '@/app/layout/desktop/ContextToolbar';
import { ContextListCard } from '@/shared/components/desktop/ContextListCard';
import { SearchField } from '@/shared/components/desktop/SearchField';
import { EmptyState, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import { WorldInfoBookHeader } from './components/WorldInfoBookHeader';
import { WorldInfoCreateBookModal } from './components/WorldInfoCreateBookModal';
import { WorldInfoEntryEditorModal } from './components/WorldInfoEntryEditorModal';
import { WorldInfoEntryWorkspace } from './components/WorldInfoEntryWorkspace';
import { buildWorldInfoUrl, createWorldInfoController } from './controller';

export default function WorldInfoPage(): JSX.Element {
  let pageRef: HTMLDivElement | undefined;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams<{ tab?: string; selected?: string }>();
  const controller = createWorldInfoController({
    selectedBook: () => decodeURIComponent(searchParams.selected ?? ''),
    autoSelectFirst: true,
    onSelectBook: (name) => navigate(buildWorldInfoUrl(name)),
    onClearSelection: () => navigate('/world-info'),
  });

  createEffect(() => {
    if (searchParams.tab) {
      navigate(buildWorldInfoUrl(controller.selectedBook() || undefined), { replace: true });
    }
  });

  useMotionMount(() => pageRef, 'page');

  return (
    <div ref={pageRef} class="flex h-full min-h-0 gap-4 overflow-hidden">
      <DesktopContextPane floatingActionLabel={locale.worldInfo.createBook} onFloatingAction={controller.openCreate}>
        <ContextToolbar
          title={locale.worldInfo.title}
          subtitle={locale.worldInfo.subtitle}
          search={<SearchField value={controller.bookSearch()} onInput={(event) => controller.setBookSearch(event.currentTarget.value)} placeholder={locale.worldInfo.searchBooks} />}
          actions={(
            <label class={`inline-flex items-center justify-center rounded-[1.2rem] bg-slate-100 p-3 text-slate-600 hover:bg-slate-200 ${controller.importWorldInfoMutation.isPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={locale.worldInfo.importBook}>
              <ArrowDownToLine size={18} />
              <input
                type="file"
                class="hidden"
                accept=".json,.jsonl"
                disabled={controller.importWorldInfoMutation.isPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) {
                    return;
                  }
                  void controller.importWorldInfoMutation.mutateAsync(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          )}
        />

        <div class="mt-6 space-y-3">
          <Show when={!controller.settingsQuery.isPending} fallback={<LoadingBlock />}>
            <Show
              when={controller.filteredBooks().length > 0}
              fallback={<EmptyState title={locale.worldInfo.emptyList} description={locale.worldInfo.emptyListHint} />}
            >
              {controller.filteredBooks().map((name) => (
                <ContextListCard
                  compact
                  item={{
                    id: name,
                    title: name,
                    description: locale.worldInfo.bookListDescription,
                    tone: name === controller.selectedBook() ? 'active' : 'default',
                    onClick: () => controller.selectBook(name),
                  }}
                />
              ))}
            </Show>
          </Show>
        </div>
      </DesktopContextPane>

      <DesktopWorkspaceBoard>
        <Show
          when={controller.selectedBook() && controller.record()}
          fallback={controller.hasWorlds() ? <LoadingBlock /> : <EmptyState title={locale.worldInfo.emptyWorkspace} description={locale.worldInfo.emptyWorkspaceHint} />}
        >
          <div class="flex h-full min-h-0 flex-col gap-5">
            <WorldInfoBookHeader
              name={controller.selectedBook()}
              record={controller.record()!}
              saveDirty={controller.currentSaveState()?.dirty}
              savePending={controller.currentSaveState()?.pending}
              saveError={controller.currentSaveState()?.error}
              onRename={controller.openRename}
              onExport={controller.exportCurrentBook}
              onDuplicate={controller.openDuplicate}
              onDelete={controller.confirmDeleteBook}
            />

            <div class="min-h-0 flex-1 overflow-y-auto pr-1">
              <WorldInfoEntryWorkspace
                entries={controller.filteredEntries()}
                totalCount={Object.keys(controller.record()!.entries).length}
                search={controller.entrySearch()}
                sortBy={controller.sortBy()}
                saveDirty={controller.currentSaveState()?.dirty}
                savePending={controller.currentSaveState()?.pending}
                saveError={controller.currentSaveState()?.error}
                onSearchChange={controller.setEntrySearch}
                onSortChange={controller.setSortBy}
                onOpenEntry={controller.setEditingEntryId}
                onCreateEntry={controller.createEntryDraft}
              />
            </div>
          </div>
        </Show>
      </DesktopWorkspaceBoard>

      <WorldInfoCreateBookModal
        open={controller.bookDialog().open}
        title={controller.bookDialogTitle()}
        confirmLabel={controller.bookDialogConfirmLabel()}
        value={controller.bookNameInput()}
        pending={controller.bookPending()}
        onClose={controller.closeBookDialog}
        onValueChange={controller.setBookNameInput}
        onSubmit={() => void controller.submitBookDialog()}
      />

      <WorldInfoEntryEditorModal
        open={Boolean(controller.editingEntryId() && controller.currentEntry())}
        entry={controller.currentEntry()}
        saveDirty={controller.currentSaveState()?.dirty}
        savePending={controller.currentSaveState()?.pending}
        saveError={controller.currentSaveState()?.error}
        onClose={() => controller.setEditingEntryId(null)}
        onDuplicate={controller.duplicateEntry}
        onDelete={controller.deleteEntry}
        onChange={controller.updateEntryField}
      />
    </div>
  );
}
