import { A } from '@solidjs/router';
import type { Component, JSX } from 'solid-js';

import { usePressMotion } from '@/shared/motion/runtime';

type IconComponent = Component<{ class?: string; size?: number | string; strokeWidth?: number | string }>;

export function IconRailButton(props: {
  href: string;
  label: string;
  icon: IconComponent;
  active?: boolean;
}): JSX.Element {
  let buttonRef: HTMLAnchorElement | undefined;
  const Icon = props.icon;

  usePressMotion(() => buttonRef);

  return (
    <A
      ref={buttonRef}
      href={props.href}
      title={props.label}
      aria-label={props.label}
      class={`group flex h-14 w-14 items-center justify-center rounded-[1.4rem] transition ${props.active ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <div class={`flex h-10 w-10 items-center justify-center rounded-[1rem] transition ${props.active ? 'bg-slate-800 text-white' : 'bg-transparent text-current group-hover:bg-slate-200'}`}>
        <Icon size={20} strokeWidth={2.2} />
      </div>
    </A>
  );
}
