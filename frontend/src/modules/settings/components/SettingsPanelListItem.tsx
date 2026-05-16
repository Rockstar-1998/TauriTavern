import { ChevronRight } from 'lucide-solid';
import type { Component, JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';

export function SettingsPanelListItem(props: {
  title: string;
  description: string;
  active?: boolean;
  icon: Component<{ size?: number; class?: string }>;
  onClick: () => void;
}): JSX.Element {
  let itemRef: HTMLButtonElement | undefined;
  const Icon = props.icon;

  useMotionMount(() => itemRef, 'card');
  usePressMotion(() => itemRef);

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={props.onClick}
      class={`flex w-full items-center gap-3 rounded-[1.4rem] border px-4 py-3 text-left transition ${props.active ? 'border-slate-700 bg-white shadow-sm' : 'border-slate-200 bg-white/75 hover:bg-white'}`}
    >
      <div class={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${props.active ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
        <Icon size={20} />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-base font-semibold text-slate-900">{props.title}</div>
        <div class="mt-1 line-clamp-1 text-sm text-slate-500">{props.description}</div>
      </div>
      <div class="shrink-0 text-slate-300"><ChevronRight size={18} /></div>
    </button>
  );
}
