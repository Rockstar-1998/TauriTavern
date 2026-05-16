import { useNavigate } from '@solidjs/router';
import { Plus } from 'lucide-solid';
import { createEffect, For, Show, type JSX } from 'solid-js';

import { SearchField } from '@/shared/components/desktop/SearchField';
import { Button, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';
import type { ChatSessionFilter, ChatSessionSummary } from '@/types/domain';

import { ChatSessionListCard } from '../components/ChatSessionListCard';
import { createChatSessionCatalogController } from '../session-catalog-controller';

function ensureJsonlName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('.jsonl') ? trimmed : `${trimmed}.jsonl`;
}

function buildSessionHref(session: ChatSessionSummary): string {
  if (session.source_type === 'group') {
    return `/chats/group/${encodeURIComponent(session.scope_id)}?file=${encodeURIComponent(ensureJsonlName(session.file_name))}`;
  }

  return `/chats/character/${encodeURIComponent(session.scope_id)}?file=${encodeURIComponent(ensureJsonlName(session.file_name))}`;
}

export default function ChatsListMobilePage(): JSX.Element {
  const navigate = useNavigate();
  const sessionCatalog = createChatSessionCatalogController();

  createEffect(() => {
    console.info('[mobile-chats] multiplayer entry visible', {
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      sessionCount: sessionCatalog.sessionsQuery.data?.length ?? 0,
      search: sessionCatalog.search(),
      filter: sessionCatalog.filter(),
    });
  });

  const filterOptions: Array<{ value: ChatSessionFilter; label: string }> = [
    { value: 'all', label: locale.chats.filterAll },
    { value: 'character', label: locale.chats.filterCharacters },
    { value: 'group', label: locale.chats.filterGroups },
  ];

  return (
    <div class="relative flex h-full flex-col px-4 py-4">
      <div class="mb-4 space-y-3">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold">{locale.chats.title}</h1>
          <button
            type="button"
            onClick={() => navigate('/characters')}
            class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition-transform active:scale-95"
            aria-label={locale.chats.newChat}
            title={locale.chats.newChat}
          >
            <Plus size={24} />
          </button>
        </div>
        <div class="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
          <div class="text-sm font-semibold text-slate-900">多人联机</div>
          <div class="mt-1 text-xs leading-6 text-slate-500">先选择角色卡，再创建联机会话或加入联机房间。</div>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button class="flex-1 min-w-[12rem]" onClick={() => navigate('/characters')}>创建联机会话（房主）</Button>
            <Button variant="secondary" class="flex-1 min-w-[12rem]" onClick={() => navigate('/characters?intent=join-room')}>加入联机房间</Button>
          </div>
        </div>
        <SearchField
          value={sessionCatalog.search()}
          onInput={(event) => sessionCatalog.setSearch(event.currentTarget.value)}
          placeholder={locale.common.search}
        />
        <div class="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <For each={filterOptions}>
            {(option) => (
              <button
                type="button"
                class={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  sessionCatalog.filter() === option.value ? 'bg-slate-800 text-white' : 'border bg-white text-slate-600'
                }`}
                onClick={() => sessionCatalog.setFilter(option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={!sessionCatalog.sessionsQuery.isPending} fallback={<LoadingBlock />}>
          <Show
            when={(sessionCatalog.sessionsQuery.data?.length ?? 0) > 0}
            fallback={<div class="flex flex-col items-center justify-center pt-20 text-slate-400"><span class="text-sm">{locale.chats.emptySessions}</span></div>}
          >
            <div class="space-y-3 pb-6">
              <For each={sessionCatalog.sessionsQuery.data}>
                {(session) => (
                  <ChatSessionListCard
                    session={session}
                    active={false}
                    onOpen={() => navigate(buildSessionHref(session))}
                    onOpenContextMenu={() => {}}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
