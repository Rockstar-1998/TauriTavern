import { Portal } from 'solid-js/web';
import { Show, type JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';

export function ChatSessionContextMenu(props: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
}): JSX.Element {
  let menuRef: HTMLDivElement | undefined;
  let editRef: HTMLButtonElement | undefined;
  useMotionMount(() => menuRef, 'menu');
  usePressMotion(() => editRef);

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-40" onPointerDown={props.onClose} />
        <div
          ref={menuRef}
          class="fixed z-50 min-w-[180px] rounded-[1.2rem] border border-slate-200 bg-white p-2 shadow-xl"
          style={{ left: `${props.x}px`, top: `${props.y}px` }}
          role="menu"
        >
          <button
            ref={editRef}
            type="button"
            class="flex w-full items-center rounded-[0.9rem] px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
            onClick={() => {
              props.onEdit();
              props.onClose();
            }}
            role="menuitem"
          >
            {locale.chats.editSession}
          </button>
        </div>
      </Portal>
    </Show>
  );
}
