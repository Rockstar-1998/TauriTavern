import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';

export type SettingsSecondaryRailItem = {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  active?: boolean;
  onClick: () => void;
};

export function SettingsSecondaryRail(props: {
  title: string;
  subtitle?: string;
  actions?: JSX.Element;
  items: SettingsSecondaryRailItem[];
  empty?: JSX.Element;
}): JSX.Element {
  let railRef: HTMLElement | undefined;
  useMotionMount(() => railRef, 'panel');

  return (
    <aside ref={railRef} class="tt-panel-surface flex h-full min-h-0 flex-col rounded-[1.8rem] px-4 py-4">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <div class="text-base font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div class="mt-1 text-sm text-slate-500">{props.subtitle}</div> : null}
        </div>
        {props.actions ? <div class="shrink-0">{props.actions}</div> : null}
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        {props.items.length > 0 ? (
          <div class="space-y-2">
            {props.items.map((item) => {
              let itemRef: HTMLButtonElement | undefined;
              useMotionMount(() => itemRef, 'card');
              usePressMotion(() => itemRef);
              return (
                <button
                  ref={itemRef}
                  type="button"
                  onClick={item.onClick}
                  class={`w-full rounded-[1.2rem] border px-4 py-3 text-left transition ${item.active ? 'border-slate-700 bg-white shadow-sm' : 'border-slate-200 bg-white/70 hover:bg-white'}`}
                >
                  <div class="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                  {item.description ? <div class="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</div> : null}
                  {item.meta ? <div class="mt-2 text-[11px] text-slate-400">{item.meta}</div> : null}
                </button>
              );
            })}
          </div>
        ) : props.empty ? (
          props.empty
        ) : null}
      </div>
    </aside>
  );
}
