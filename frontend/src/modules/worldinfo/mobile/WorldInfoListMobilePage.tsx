import { useNavigate } from '@solidjs/router';
import { ArrowDownToLine, Book, ChevronRight, Plus } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';

import { SearchField } from '@/shared/components/desktop/SearchField';
import { Button, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import { WorldInfoCreateBookModal } from '../components/WorldInfoCreateBookModal';
import { createWorldInfoController } from '../controller';

export default function WorldInfoListMobilePage(): JSX.Element {
  const navigate = useNavigate();
  const controller = createWorldInfoController({
    selectedBook: () => '',
    onSelectBook: (name) => navigate(`/world-info/${encodeURIComponent(name)}`),
    onClearSelection: () => navigate('/world-info'),
  });

  return (
    <div class="flex h-full flex-col bg-slate-50">
      <div class="space-y-3 px-4 py-6">
        <h1 class="text-2xl font-bold text-slate-900">{locale.worldInfo.title}</h1>
        <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Button variant="secondary" class="shrink-0" onClick={controller.openCreate}>
            <Plus size={16} class="mr-2" />
            {locale.worldInfo.createBook}
          </Button>
          <label class={`inline-flex shrink-0 items-center justify-center rounded-[1.2rem] bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition ${controller.importWorldInfoMutation.isPending ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:bg-slate-200'}`} title={locale.worldInfo.importBook}>
            <ArrowDownToLine size={16} class="mr-2" />
            {locale.worldInfo.importBook}
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
        </div>
        <p class="text-xs text-slate-500">{locale.worldInfo.subtitle}</p>
        <SearchField
          value={controller.bookSearch()}
          onInput={(event) => controller.setBookSearch(event.currentTarget.value)}
          placeholder={locale.worldInfo.searchBooks}
        />
      </div>

      <div class="flex-1 overflow-y-auto px-4 pb-20">
        <Show when={!controller.settingsQuery.isPending} fallback={<LoadingBlock />}>
          <div class="space-y-3">
            <For each={controller.filteredBooks()}>
              {(name) => (
                <button
                  type="button"
                  onClick={() => controller.selectBook(name)}
                  class="flex w-full items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-colors active:bg-slate-50"
                >
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Book size={22} />
                  </div>
                  <div class="flex-1 text-left">
                    <div class="font-semibold text-slate-900">{name}</div>
                    <div class="mt-0.5 text-xs text-slate-400">{locale.worldInfo.bookListDescription}</div>
                  </div>
                  <ChevronRight size={18} class="text-slate-300" />
                </button>
              )}
            </For>

            <Show when={controller.filteredBooks().length === 0}>
              <div class="py-20 text-center text-sm text-slate-400">
                {locale.worldInfo.emptyList}
              </div>
            </Show>
          </div>
        </Show>
      </div>

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
    </div>
  );
}
