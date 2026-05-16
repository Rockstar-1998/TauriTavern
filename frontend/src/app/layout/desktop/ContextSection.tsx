import type { JSX } from 'solid-js';

export function ContextSection(props: { title?: string; subtitle?: string; children: JSX.Element; action?: JSX.Element }): JSX.Element {
  return (
    <section class="space-y-3">
      {props.title ? (
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-700">{props.title}</h2>
            {props.subtitle ? <p class="mt-1 text-xs text-slate-400">{props.subtitle}</p> : null}
          </div>
          {props.action}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}
