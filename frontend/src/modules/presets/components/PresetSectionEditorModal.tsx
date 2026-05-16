import { createEffect, createSignal, For, type JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Field, Input, TextArea } from '@/shared/components/ui';
import { safeJsonStringify } from '@/shared/utils/format';

import { PRESET_COPY } from '../copy';
import type { PresetFieldDefinition, PresetSectionDefinition } from '../registry';
import { humanizeId, toLineList } from '../utils';
import { OpenAILogitBiasEditor } from './OpenAILogitBiasEditor';

export function PresetSectionEditorModal(props: {
  open: boolean;
  title: string;
  section: PresetSectionDefinition;
  values: Record<string, unknown>;
  onClose: () => void;
  onFieldChange: (fieldId: string, value: unknown) => void;
}): JSX.Element {
  const [jsonText, setJsonText] = createSignal<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = createSignal<Record<string, string>>({});

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const nextJson = Object.fromEntries(
      props.section.fields
        .filter((field) => field.type === 'json')
        .map((field) => [field.id, safeJsonStringify(props.values[field.id] ?? field.defaultValue)]),
    );
    setJsonText(nextJson);
    setJsonErrors({});
  });

  function setJsonField(field: PresetFieldDefinition, text: string): void {
    setJsonText((current) => ({ ...current, [field.id]: text }));
    try {
      const parsed = JSON.parse(text) as unknown;
      setJsonErrors((current) => ({ ...current, [field.id]: '' }));
      props.onFieldChange(field.id, parsed);
    } catch {
      setJsonErrors((current) => ({ ...current, [field.id]: PRESET_COPY.jsonFieldInvalid }));
    }
  }

  function renderField(field: PresetFieldDefinition): JSX.Element {
    const value = () => props.values[field.id] ?? field.defaultValue;
    const label = field.label && !field.label.includes('?') ? field.label : humanizeId(field.id);

    if (field.type === 'boolean') {
      return (
        <label class="flex items-center justify-between gap-4 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <span>{label}</span>
          <input type="checkbox" checked={Boolean(value())} onInput={(event) => props.onFieldChange(field.id, event.currentTarget.checked)} />
        </label>
      );
    }

    if (field.type === 'number') {
      return (
        <Field label={label}>
          <Input type="number" value={String(value() ?? field.defaultValue ?? 0)} onInput={(event) => props.onFieldChange(field.id, Number(event.currentTarget.value || 0))} />
        </Field>
      );
    }

    if (field.type === 'textarea') {
      return (
        <Field label={label}>
          <div class="space-y-2">
            <TextArea value={String(value() ?? '')} rows={field.rows ?? 6} onInput={(event) => props.onFieldChange(field.id, event.currentTarget.value)} />
            {field.restoreDefault ? (
              <div class="flex justify-end">
                <Button variant="ghost" onClick={() => props.onFieldChange(field.id, field.defaultValue)}>{PRESET_COPY.restoreDefaults}</Button>
              </div>
            ) : null}
          </div>
        </Field>
      );
    }

    if (field.type === 'string-array') {
      return (
        <Field label={label}>
          <TextArea value={toLineList(value()).join('\n')} rows={field.rows ?? 5} onInput={(event) => props.onFieldChange(field.id, toLineList(event.currentTarget.value))} />
        </Field>
      );
    }

    if (field.type === 'json') {
      const currentText = jsonText()[field.id] ?? safeJsonStringify(value());
      const currentError = jsonErrors()[field.id] ?? '';
      return (
        <Field label={label} hint={currentError || undefined}>
          <TextArea value={currentText} rows={field.rows ?? 8} class={currentError ? 'border-rose-300' : ''} onInput={(event) => setJsonField(field, event.currentTarget.value)} />
        </Field>
      );
    }

    if (field.type === 'logit-bias') {
      return (
        <div class="space-y-2">
          <div class="text-sm font-medium text-slate-700">{label}</div>
          <OpenAILogitBiasEditor
            selectedPreset={String(props.values.bias_preset_selected ?? field.defaultValue ?? 'Default (none)')}
            presets={props.values[field.id]}
            onChange={(selectedPreset, presets) => {
              props.onFieldChange('bias_preset_selected', selectedPreset);
              props.onFieldChange(field.id, presets);
            }}
          />
        </div>
      );
    }

    return (
      <Field label={label}>
        <Input value={String(value() ?? '')} onInput={(event) => props.onFieldChange(field.id, event.currentTarget.value)} />
      </Field>
    );
  }

  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title={props.title} size="xl">
      <div class="grid gap-5 xl:grid-cols-2">
        <For each={props.section.fields}>{(field) => <div>{renderField(field)}</div>}</For>
      </div>
    </WorkbenchModal>
  );
}
