import { type JSX, Show } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

function buttonVariantClass(variant: ButtonVariant = 'primary'): string {
  switch (variant) {
    case 'secondary':
      return 'bg-slate-100 text-slate-800 hover:bg-slate-200';
    case 'danger':
      return 'bg-rose-500 text-white hover:bg-rose-400';
    case 'ghost':
      return 'bg-transparent text-slate-700 hover:bg-slate-100';
    default:
      return 'bg-slate-800 text-white hover:bg-slate-700';
  }
}

export function PageTitle(props: { title: string; subtitle?: string; actions?: JSX.Element }): JSX.Element {
  let titleRef: HTMLDivElement | undefined;
  useMotionMount(() => titleRef, 'panel');

  return (
    <div ref={titleRef} class="tt-panel-surface flex flex-col gap-4 rounded-[1.8rem] px-6 py-5 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="mt-1 text-sm text-slate-500">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex flex-wrap gap-3">{props.actions}</div>
      </Show>
    </div>
  );
}

export function Card(props: { title?: string; subtitle?: string; children: JSX.Element; class?: string }): JSX.Element {
  let cardRef: HTMLElement | undefined;
  useMotionMount(() => cardRef, 'panel');

  return (
    <section ref={cardRef} data-motion-card class={`tt-card-surface rounded-[1.8rem] px-5 py-5 ${props.class ?? ''}`.trim()}>
      <Show when={props.title}>
        <header class="mb-4">
          <h2 class="text-lg font-semibold text-slate-900">{props.title}</h2>
          <Show when={props.subtitle}>
            <p class="mt-1 text-sm text-slate-500">{props.subtitle}</p>
          </Show>
        </header>
      </Show>
      {props.children}
    </section>
  );
}

export function Button(props: {
  children: JSX.Element;
  type?: 'button' | 'submit';
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  disabled?: boolean;
  variant?: ButtonVariant;
  class?: string;
}): JSX.Element {
  let buttonRef: HTMLButtonElement | undefined;
  usePressMotion(() => buttonRef);

  return (
    <button
      ref={buttonRef}
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      class={`inline-flex items-center justify-center rounded-[1.2rem] px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariantClass(props.variant)} ${props.class ?? ''}`.trim()}
    >
      {props.children}
    </button>
  );
}

export function ActionIconButton(props: {
  icon: JSX.Element;
  label: string;
  type?: 'button' | 'submit';
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  disabled?: boolean;
  variant?: ButtonVariant;
  class?: string;
}): JSX.Element {
  let buttonRef: HTMLButtonElement | undefined;
  usePressMotion(() => buttonRef);

  return (
    <button
      ref={buttonRef}
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      class={`inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-[1rem] transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariantClass(props.variant ?? 'ghost')} ${props.class ?? ''}`.trim()}
    >
      <span aria-hidden="true" class="pointer-events-none inline-flex items-center justify-center">
        {props.icon}
      </span>
    </button>
  );
}

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input {...props} class={`tt-input-surface w-full rounded-[1.2rem] px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 ${props.class ?? ''}`.trim()} />;
}

export function TextArea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea {...props} class={`tt-input-surface min-h-[120px] w-full rounded-[1.2rem] px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 ${props.class ?? ''}`.trim()} />;
}

export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select {...props} class={`tt-input-surface w-full rounded-[1.2rem] px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 ${props.class ?? ''}`.trim()} />;
}

export function Field(props: { label: string; hint?: string; children: JSX.Element }): JSX.Element {
  return (
    <label class="flex flex-col gap-2 text-sm text-slate-700">
      <span class="font-medium">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-xs text-slate-500">{props.hint}</span>
      </Show>
    </label>
  );
}

export function EmptyState(props: { title: string; description: string; action?: JSX.Element }): JSX.Element {
  let emptyRef: HTMLDivElement | undefined;
  useMotionMount(() => emptyRef, 'panel');

  return (
    <div ref={emptyRef} data-motion-card class="tt-muted-surface rounded-[1.8rem] border border-dashed px-5 py-10 text-center">
      <h3 class="text-lg font-semibold text-slate-900">{props.title}</h3>
      <p class="mx-auto mt-2 max-w-xl text-sm text-slate-500">{props.description}</p>
      <Show when={props.action}>
        <div class="mt-5 flex justify-center">{props.action}</div>
      </Show>
    </div>
  );
}

export function LoadingBlock(props: { label?: string }): JSX.Element {
  let loadingRef: HTMLDivElement | undefined;
  useMotionMount(() => loadingRef, 'panel');

  return (
    <div ref={loadingRef} class="tt-panel-surface rounded-[1.8rem] px-8 py-8 text-center text-sm text-slate-500">
      {props.label ?? locale.common.loading}
    </div>
  );
}

export function Tag(props: { children: JSX.Element; tone?: 'default' | 'success' | 'danger' }): JSX.Element {
  const toneClass = () => {
    switch (props.tone) {
      case 'success':
        return 'bg-emerald-100 text-emerald-700';
      case 'danger':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return <span class={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClass()}`}>{props.children}</span>;
}

export function JsonEditor(props: { value: string; onInput: JSX.EventHandlerUnion<HTMLTextAreaElement, InputEvent>; minHeight?: number }): JSX.Element {
  return (
    <TextArea
      value={props.value}
      onInput={props.onInput}
      class="font-mono text-xs leading-6"
      style={{ 'min-height': `${props.minHeight ?? 260}px` }}
      spellcheck={false}
    />
  );
}
