import { For, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { Tag } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';
import { getPromptManagerSummary } from '../openai-prompt-manager';
import type { PresetFieldDefinition, PresetSectionDefinition } from '../registry';
import { humanizeId, summarizeValue } from '../utils';

export function PresetSectionCard(props: {
  section: PresetSectionDefinition;
  values: Record<string, unknown>;
  onOpen: () => void;
}): JSX.Element {
  let sectionRef: HTMLElement | undefined;
  const previewFields = () => props.section.fields.slice(0, 4);
  const title = () => (props.section.label && !props.section.label.includes('?') ? props.section.label : humanizeId(props.section.id));
  const promptSummary = () =>
    props.section.editor === 'prompt-manager'
      ? getPromptManagerSummary(props.values.prompts, props.values.prompt_order)
      : null;
  const tagLabel = () => {
    if (props.section.editor === 'prompt-manager') {
      const summary = promptSummary();
      return summary
        ? PRESET_COPY.promptManagerSectionEnabled
          .replace('{enabled}', String(summary.enabled))
          .replace('{total}', String(summary.total))
        : PRESET_COPY.promptManagerSectionInvalid;
    }
    return `${props.section.fields.length} 字段`;
  };

  const resolvePreviewValue = (field: PresetFieldDefinition): unknown => {
    const raw = props.values[field.id];
    return raw ?? field.defaultValue;
  };

  useMotionMount(() => sectionRef, 'card');

  return (
    <section
      ref={sectionRef}
      role="button"
      tabindex={0}
      aria-label={title()}
      class="tt-card-surface h-full cursor-pointer rounded-[1.8rem] px-5 py-5 transition hover:-translate-y-[1px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">{title()}</h3>
          {props.section.description ? <p class="mt-1 text-sm text-slate-500">{props.section.description}</p> : null}
        </div>
        <Tag>{tagLabel()}</Tag>
      </div>
      <Show
        when={props.section.editor !== 'prompt-manager'}
        fallback={<div class="mt-4 text-sm text-slate-600">{PRESET_COPY.promptManagerSectionHint}</div>}
      >
        <div class="mt-4 space-y-3">
          <For each={previewFields()}>
            {(field) => (
              <div class="space-y-1">
                <div class="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{field.label}</div>
                <div class="line-clamp-2 text-sm text-slate-700">{summarizeValue(resolvePreviewValue(field))}</div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
