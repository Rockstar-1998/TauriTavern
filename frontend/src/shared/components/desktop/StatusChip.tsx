import type { JSX } from 'solid-js';

export function StatusChip(props: { children: JSX.Element; tone?: 'default' | 'success' | 'danger' | 'accent' }): JSX.Element {
  const tone = () => {
    switch (props.tone) {
      case 'success':
        return 'bg-emerald-100 text-emerald-700';
      case 'danger':
        return 'bg-rose-100 text-rose-600';
      case 'accent':
        return 'bg-violet-100 text-violet-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return <span class={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone()}`}>{props.children}</span>;
}
