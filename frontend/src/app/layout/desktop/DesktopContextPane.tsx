import type { JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';

import { FloatingCreateButton } from './FloatingCreateButton';

export function DesktopContextPane(props: {
  children: JSX.Element;
  floatingActionLabel?: string;
  onFloatingAction?: () => void;
  scrollMode?: 'pane' | 'contained';
}): JSX.Element {
  let paneRef: HTMLElement | undefined;
  const bodyClass = () => (props.scrollMode === 'contained' ? 'min-h-0 flex-1 overflow-hidden pr-1 pb-24' : 'min-h-0 flex-1 overflow-y-auto pr-1 pb-24');

  useMotionMount(() => paneRef, 'panel');

  return (
    <aside ref={paneRef} class="tt-desktop-pane relative flex h-full min-h-0 w-[clamp(300px,21vw,360px)] shrink-0 flex-col overflow-hidden rounded-[2rem] px-5 py-5">
      <div class={bodyClass()}>{props.children}</div>
      {props.onFloatingAction ? (
        <div class="pointer-events-none absolute bottom-6 right-6">
          <FloatingCreateButton label={props.floatingActionLabel ?? ''} onClick={props.onFloatingAction} />
        </div>
      ) : null}
    </aside>
  );
}
