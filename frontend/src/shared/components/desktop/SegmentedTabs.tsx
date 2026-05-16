import type { JSX } from 'solid-js';

export type SegmentedTabItem = { value: string; label: string };

export function SegmentedTabs(props: {
  value: string;
  items: SegmentedTabItem[];
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div class="inline-flex rounded-full border border-slate-500/50 bg-white p-1 shadow-sm">
      {props.items.map((item) => (
        <button
          type="button"
          onClick={() => props.onChange(item.value)}
          class={`rounded-full px-5 py-2 text-base transition ${props.value === item.value ? 'bg-slate-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
