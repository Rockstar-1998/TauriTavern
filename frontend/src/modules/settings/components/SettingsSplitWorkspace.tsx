import type { JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';

export function SettingsSplitWorkspace(props: {
  title: string;
  description?: string;
  secondaryRail: JSX.Element;
  detail: JSX.Element;
}): JSX.Element {
  let workspaceRef: HTMLDivElement | undefined;
  let railRef: HTMLDivElement | undefined;
  let detailRef: HTMLDivElement | undefined;

  useMotionMount(() => workspaceRef, 'page');
  useMotionMount(() => railRef, 'panel', { delay: 0.04 });
  useMotionMount(() => detailRef, 'panel', { delay: 0.08 });

  return (
    <div ref={workspaceRef} class="flex h-full min-h-0 flex-col gap-5">
      <div class="shrink-0">
        <h2 class="text-[2rem] font-semibold tracking-tight text-slate-900">{props.title}</h2>
        {props.description ? <p class="mt-1 text-sm text-slate-500">{props.description}</p> : null}
      </div>

      <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div ref={railRef} class="min-h-0 overflow-hidden">{props.secondaryRail}</div>
        <div ref={detailRef} class="min-h-0 overflow-y-auto pr-1">{props.detail}</div>
      </div>
    </div>
  );
}
