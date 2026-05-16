import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { formatRelativeTime } from '@/shared/utils/format';
import type { ChatSessionSummary } from '@/types/domain';

function sourceLabel(sourceType: ChatSessionSummary['source_type']): string {
  return sourceType === 'group' ? locale.chats.sessionSourceGroup : locale.chats.sessionSourceCharacter;
}

function sessionModeLabel(sessionMode: ChatSessionSummary['session_mode']): string {
  return sessionMode === 'multiplayer' ? locale.chats.sessionModeMultiplayer : locale.chats.sessionModeSingle;
}

export function ChatSessionListCard(props: {
  session: ChatSessionSummary;
  active?: boolean;
  onOpen: () => void;
  onOpenContextMenu: (position: { x: number; y: number }) => void;
}): JSX.Element {
  let cardRef: HTMLButtonElement | undefined;
  const initials = () => (props.session.scope_name || props.session.file_name || '?').slice(0, 1).toUpperCase();

  useMotionMount(() => cardRef, 'card');
  usePressMotion(() => cardRef);

  return (
    <button
      ref={cardRef}
      type="button"
      class={`tt-context-card flex w-full items-start gap-4 rounded-[1.6rem] border px-4 py-4 text-left transition ${props.active ? 'border-slate-700 bg-white shadow-md' : 'border-slate-200 bg-white/80 hover:bg-white'}`}
      onClick={props.onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onOpenContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
          return;
        }

        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        props.onOpenContextMenu({
          x: rect.left + rect.width / 2,
          y: rect.top + Math.min(rect.height, 48),
        });
      }}
      aria-label={`${props.session.scope_name} ${props.session.file_name}`}
    >
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
        {initials()}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-col items-start gap-2 md:flex-row md:items-center">
          <div class="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">{props.session.file_name.replace(/\.jsonl$/i, '')}</div>
          <div class="flex shrink-0 flex-wrap gap-1">
            <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{sourceLabel(props.session.source_type)}</span>
            <span class={`rounded-full px-2 py-1 text-[11px] font-medium ${props.session.session_mode === 'multiplayer' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {sessionModeLabel(props.session.session_mode)}
            </span>
          </div>
        </div>
        <div class="mt-1 truncate text-sm text-slate-500">{`${props.session.scope_name}`}</div>
        <div class="mt-2 line-clamp-2 text-sm text-slate-500">{props.session.preview_message || locale.chats.noPreview}</div>
        <div class="mt-3 flex items-center gap-3 text-xs text-slate-400">
          <span>{formatRelativeTime(props.session.last_mes)}</span>
          <span>{`${props.session.message_count} ${locale.chats.messageCount}`}</span>
        </div>
      </div>
    </button>
  );
}
