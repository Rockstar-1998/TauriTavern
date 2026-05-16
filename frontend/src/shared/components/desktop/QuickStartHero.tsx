import { Plus } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';

export function QuickStartHero(props: {
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
}): JSX.Element {
  let heroRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;

  useMotionMount(() => heroRef, 'panel');
  usePressMotion(() => buttonRef);

  return (
    <div ref={heroRef} class="tt-hero-card flex items-center justify-between gap-6 rounded-[2rem] px-9 py-9">
      <div>
        <div class="text-4xl font-bold text-slate-900">{props.title}</div>
        <div class="mt-3 text-2xl text-slate-600">{props.description}</div>
      </div>
      <button ref={buttonRef} type="button" onClick={props.onAction} class="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-700 text-white shadow-md" aria-label={props.actionLabel}>
        <Plus size={40} />
      </button>
    </div>
  );
}
