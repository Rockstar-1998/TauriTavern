import { ArrowDownToLine, MessageSquarePlus, Users } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { Button } from '@/shared/components/ui';
import { SearchField } from '@/shared/components/desktop/SearchField';
import type { ChatSessionFilter, ChatSessionSummary } from '@/types/domain';

import { ChatSessionListCard } from './ChatSessionListCard';

const filterOptions: Array<{ value: ChatSessionFilter; label: string }> = [
  { value: 'all', label: locale.chats.filterAll },
  { value: 'character', label: locale.chats.filterCharacters },
  { value: 'group', label: locale.chats.filterGroups },
];

export function ChatSessionPane(props: {
  search: string;
  filter: ChatSessionFilter;
  sessions: ChatSessionSummary[];
  activeSessionKey?: string;
  canCreate?: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: ChatSessionFilter) => void;
  onOpenSession: (session: ChatSessionSummary) => void;
  onOpenSessionMenu: (session: ChatSessionSummary, position: { x: number; y: number }) => void;
  onImport?: (file: File) => void;
  onCreate?: () => void;
  onJoinRoom?: () => void;
}): JSX.Element {
  let paneRef: HTMLDivElement | undefined;
  useMotionMount(() => paneRef, 'page');

  return (
    <div ref={paneRef} class="flex h-full min-h-0 flex-col gap-5">
      <div class="shrink-0 space-y-4">
        <div>
          <h1 class="text-[2rem] font-semibold tracking-tight text-slate-900">{locale.chats.title}</h1>
        </div>

        <SearchField value={props.search} onInput={(event) => props.onSearchChange(event.currentTarget.value)} placeholder={locale.common.search} />

        <div class="flex flex-wrap gap-2">
          <For each={filterOptions}>
            {(option) => (
              <button
                type="button"
                class={`rounded-[1rem] px-4 py-2 text-sm font-medium transition ${props.filter === option.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                onClick={() => props.onFilterChange(option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>

        <div class="flex flex-wrap gap-2">
          <Show when={props.onCreate}>
            <Button variant="secondary" onClick={props.onCreate}><MessageSquarePlus size={16} class="mr-2 inline" />{locale.chats.newChat}</Button>
          </Show>
          <Show when={props.onJoinRoom}>
            <Button variant="secondary" onClick={props.onJoinRoom}><Users size={16} class="mr-2 inline" />{locale.chats.joinRoom}</Button>
          </Show>
          <Show when={props.onImport}>
            <label class="inline-flex cursor-pointer items-center justify-center rounded-[1.2rem] bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200" title={locale.chats.importChat}>
              <ArrowDownToLine size={16} class="mr-2" />
              {locale.chats.importChat}
              <input
                type="file"
                class="hidden"
                accept=".json,.jsonl"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && props.onImport) {
                    props.onImport(file);
                    event.currentTarget.value = '';
                  }
                }}
              />
            </label>
          </Show>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <Show
          when={props.sessions.length > 0}
          fallback={<div class="tt-muted-surface rounded-[1.6rem] border border-dashed px-5 py-8 text-sm text-slate-500">{locale.chats.emptySessions}</div>}
        >
          <div class="space-y-3">
            <For each={props.sessions}>
              {(session) => (
                <ChatSessionListCard
                  session={session}
                  active={props.activeSessionKey === `${session.source_type}:${session.scope_id}:${session.file_name}`}
                  onOpen={() => props.onOpenSession(session)}
                  onOpenContextMenu={(position) => props.onOpenSessionMenu(session, position)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
