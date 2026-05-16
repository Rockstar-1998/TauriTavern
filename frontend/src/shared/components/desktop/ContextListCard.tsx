import { ChevronRight } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { usePressMotion } from '@/shared/motion/runtime';
import type { ContextListItem } from '@/types/ui-desktop';

export function ContextListCard(props: { item: ContextListItem; compact?: boolean }): JSX.Element {
  let buttonRef: HTMLButtonElement | undefined;
  const toneClass = () => {
    switch (props.item.tone) {
      case 'active':
        return 'border-slate-700 bg-white shadow-md';
      case 'danger':
        return 'border-rose-200 bg-rose-50';
      case 'muted':
        return 'border-slate-100 bg-slate-100';
      default:
        return 'border-slate-200 bg-white/80 hover:bg-white';
    }
  };

  const paddingClass = () => (props.compact ? 'py-4' : 'py-5');

  usePressMotion(() => buttonRef);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={props.item.onClick}
      class={`tt-context-card flex w-full items-center gap-4 rounded-[1.6rem] border px-5 text-left transition ${paddingClass()} ${toneClass()}`}
    >
      {props.item.leading ? <div class="shrink-0">{props.item.leading}</div> : null}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <div class="truncate text-lg font-semibold text-slate-900">{props.item.title}</div>
          {props.item.badge ? <span class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">{props.item.badge}</span> : null}
        </div>
        {props.item.description ? <p class="mt-1 line-clamp-2 text-sm text-slate-500">{props.item.description}</p> : null}
        {props.item.meta ? <p class="mt-2 text-xs text-slate-400">{props.item.meta}</p> : null}
      </div>
      <div class="shrink-0 text-slate-300">{props.item.trailing ?? <ChevronRight size={18} />}</div>
    </button>
  );
}
