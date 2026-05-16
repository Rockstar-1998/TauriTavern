import type { JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';

export function ContextToolbar(props: {
  title: string;
  subtitle?: string;
  search?: JSX.Element;
  actions?: JSX.Element;
}): JSX.Element {
  let toolbarRef: HTMLDivElement | undefined;
  useMotionMount(() => toolbarRef, 'panel');

  return (
    <div ref={toolbarRef} class="space-y-4">
      <div>
        <h1 class="text-[2rem] font-semibold tracking-tight text-slate-900">{props.title}</h1>
        {props.subtitle ? <p class="mt-1 text-sm text-slate-500">{props.subtitle}</p> : null}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0 flex-1">{props.search}</div>
        <div class="flex items-center gap-2">{props.actions}</div>
      </div>
    </div>
  );
}
