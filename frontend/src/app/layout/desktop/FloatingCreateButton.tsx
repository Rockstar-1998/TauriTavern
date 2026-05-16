import { Plus } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';

export function FloatingCreateButton(props: { label: string; onClick: () => void }): JSX.Element {
  let buttonRef: HTMLButtonElement | undefined;

  useMotionMount(() => buttonRef, 'floatingButton');
  usePressMotion(() => buttonRef);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={props.onClick}
      class="tt-desktop-fab pointer-events-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] text-slate-900 shadow-lg transition hover:-translate-y-0.5"
      aria-label={props.label}
      title={props.label}
    >
      <Plus size={30} strokeWidth={2.3} />
    </button>
  );
}
