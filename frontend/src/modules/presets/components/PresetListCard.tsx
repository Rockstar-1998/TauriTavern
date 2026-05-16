import type { JSX } from 'solid-js';

import { Tag } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';

export function PresetListCard(props: {
  name: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`tt-card-surface flex w-full items-start justify-between gap-3 rounded-[1.4rem] px-4 py-4 text-left transition hover:-translate-y-[1px] hover:bg-slate-50 ${props.selected ? 'ring-2 ring-slate-400 ring-offset-2' : ''}`.trim()}
      onClick={props.onSelect}
      aria-pressed={props.selected}
    >
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold text-slate-900">{props.name}</div>
        <div class="mt-1 text-xs text-slate-500">{props.description}</div>
      </div>
      {props.selected ? <Tag tone="success">{PRESET_COPY.selectedBadge}</Tag> : null}
    </button>
  );
}
