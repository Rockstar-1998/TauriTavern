import { For, type JSX } from 'solid-js';

import type { PresetCatalogDefinition, PresetCatalogId } from '../registry';

export function PresetCatalogRail(props: {
  title: string;
  metaLabel: string;
  definitions: PresetCatalogDefinition[];
  activeId: PresetCatalogId;
  onSelect: (apiId: PresetCatalogId) => void;
}): JSX.Element {
  return (
    <section class="space-y-2">
      <div class="px-1 text-xs font-semibold tracking-[0.18em] text-slate-400">{props.title}</div>
      <div class="grid grid-cols-2 gap-2">
        <For each={props.definitions}>
          {(definition) => {
            const active = () => definition.id === props.activeId;
            return (
              <button
                type="button"
                class={`rounded-[1.2rem] px-3 py-3 text-left text-sm font-medium transition ${active() ? 'bg-slate-900 text-white shadow-sm' : 'tt-muted-surface text-slate-700 hover:bg-slate-100'}`.trim()}
                onClick={() => props.onSelect(definition.id)}
                aria-pressed={active()}
              >
                <div>{definition.label}</div>
                <div class={`mt-1 text-xs ${active() ? 'text-slate-200' : 'text-slate-500'}`}>{props.metaLabel}</div>
              </button>
            );
          }}
        </For>
      </div>
    </section>
  );
}
