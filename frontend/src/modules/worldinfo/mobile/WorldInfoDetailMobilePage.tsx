import { useNavigate, useParams } from '@solidjs/router';
import { ChevronLeft } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';

import { LoadingBlock } from '@/shared/components/ui';

import { WorldInfoBookHeader } from '../components/WorldInfoBookHeader';
import { WorldInfoCreateBookModal } from '../components/WorldInfoCreateBookModal';
import { WorldInfoEntryEditorModal } from '../components/WorldInfoEntryEditorModal';
import { WorldInfoEntryWorkspace } from '../components/WorldInfoEntryWorkspace';
import { createWorldInfoController } from '../controller';

export default function WorldInfoDetailMobilePage(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const controller = createWorldInfoController({
    selectedBook: () => decodeURIComponent(params.id ?? ''),
    autoSelectFirst: true,
    onSelectBook: (name) => navigate(`/world-info/${encodeURIComponent(name)}`, { replace: true }),
    onClearSelection: () => navigate('/world-info', { replace: true }),
  });

  return (
    <div class="flex h-full flex-col bg-slate-50">
      <header class="flex h-14 shrink-0 items-center border-b bg-white px-2">
        <button
          type="button"
          onClick={() => navigate('/world-info')}
          class="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div class="ml-1 flex-1 truncate font-semibold text-slate-900">{controller.selectedBook()}</div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-4 pb-24">
        <Show when={controller.selectedBook() && controller.record()} fallback={<LoadingBlock />}>
          <div class="space-y-4">
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
        </Show>
      </main>

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
