import { ArrowLeft, X } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { isMobileLayout } from '@/shared/utils/platform';
import type { ModalSize } from '@/types/ui-desktop';

function sizeClass(size: ModalSize | undefined): string {
  switch (size) {
    case 'md':
      return 'max-w-[720px]';
    case 'xl':
      return 'max-w-[1120px]';
    default:
      return 'max-w-[920px]';
  }
}

export function WorkbenchModalHeader(props: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  actions?: JSX.Element;
}): JSX.Element {
  let buttonRef: HTMLButtonElement | undefined;
  usePressMotion(() => buttonRef);

  const mobile = () => isMobileLayout();

  return (
    <div class={mobile()
      ? 'flex items-center gap-3 border-b border-slate-200 px-4 py-3'
      : 'flex items-center gap-4 border-b border-slate-200 px-8 py-6'}>
      <button ref={buttonRef} type="button" class="rounded-full p-2 text-slate-600 hover:bg-slate-100" onClick={props.onBack ?? props.onClose} aria-label={props.onBack ? locale.modal.back : locale.modal.close}>
        {props.onBack ? <ArrowLeft size={mobile() ? 20 : 24} /> : <X size={mobile() ? 20 : 24} />}
      </button>
      <h2 class={mobile()
        ? 'flex-1 text-xl font-semibold text-slate-900'
        : 'flex-1 text-4xl font-semibold text-slate-900'}>{props.title}</h2>
      <div class={mobile() ? 'flex items-center gap-1' : 'flex items-center gap-2'}>{props.actions}</div>
    </div>
  );
}

export function WorkbenchModal(props: {
  open: boolean;
  title: string;
  size?: ModalSize;
  onClose: () => void;
  onBack?: () => void;
  actions?: JSX.Element;
  children: JSX.Element;
  footer?: JSX.Element;
}): JSX.Element {
  let overlayRef: HTMLDivElement | undefined;
  let surfaceRef: HTMLDivElement | undefined;
  useMotionMount(() => overlayRef, 'modalOverlay');
  useMotionMount(() => surfaceRef, 'modalSurface');

  const mobile = () => isMobileLayout();

  return (
    <Show when={props.open}>
      <div ref={overlayRef} class={mobile()
        ? 'tt-modal-overlay fixed inset-0 z-50 flex items-stretch justify-stretch bg-[#f8f8f6] p-0'
        : 'tt-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6'}>
        <div ref={surfaceRef} class={`tt-modal-surface flex w-full flex-col overflow-hidden bg-[#f8f8f6] ${mobile()
          ? 'h-[100dvh] max-h-[100dvh] rounded-none shadow-none'
          : `max-h-[88vh] rounded-[2rem] shadow-2xl ${sizeClass(props.size)}`}`}>
          <WorkbenchModalHeader title={props.title} onClose={props.onClose} onBack={props.onBack} actions={props.actions} />
          <div class={mobile() ? 'min-h-0 flex-1 overflow-y-auto px-4 py-4' : 'min-h-0 flex-1 overflow-y-auto px-8 py-6'}>{props.children}</div>
          {props.footer ? <div class={mobile() ? 'border-t border-slate-200 px-4 py-4' : 'border-t border-slate-200 px-8 py-5'}>{props.footer}</div> : null}
        </div>
      </div>
    </Show>
  );
}
