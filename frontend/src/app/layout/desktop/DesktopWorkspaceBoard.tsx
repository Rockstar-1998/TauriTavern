import { Menu } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';

export function DesktopWorkspaceBoard(props: { children: JSX.Element; scrollMode?: 'board' | 'contained'; showLeadingMenu?: boolean }): JSX.Element {
  let boardRef: HTMLElement | undefined;
  const bodyClass = () => (props.scrollMode === 'contained' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-y-auto');

  useMotionMount(() => boardRef, 'page', { delay: 0.04 });

  return (
    <section ref={boardRef} class="tt-desktop-board flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[2rem] px-6 py-5 xl:px-8 xl:py-6">
      {props.showLeadingMenu !== false ? (
        <div class="mb-4 flex shrink-0 items-center gap-3 text-slate-600">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 shadow-sm">
            <Menu size={22} />
          </div>
        </div>
      ) : null}
      <div class={bodyClass()}>{props.children}</div>
    </section>
  );
}
