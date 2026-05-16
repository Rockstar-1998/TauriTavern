import type { JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';

import { DesktopIconRail } from './DesktopIconRail';

export function DesktopWorkbenchShell(props: { children: JSX.Element }): JSX.Element {
  let shellRef: HTMLDivElement | undefined;
  let contentRef: HTMLDivElement | undefined;

  useMotionMount(() => shellRef, 'shell');
  useMotionMount(() => contentRef, 'page', { delay: 0.06 });

  return (
    <div ref={shellRef} class="h-[100dvh] overflow-hidden px-4 py-4 text-slate-900 md:px-5">
      <div class="mx-auto flex h-full min-h-0 max-w-[1800px] gap-4">
        <DesktopIconRail />
        <div ref={contentRef} class="min-h-0 min-w-0 flex-1">{props.children}</div>
      </div>
    </div>
  );
}
