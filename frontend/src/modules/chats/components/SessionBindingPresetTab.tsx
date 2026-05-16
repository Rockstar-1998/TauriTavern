import { createEffect, Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, EmptyState, Field, Select, Tag } from '@/shared/components/ui';

export function SessionBindingPresetTab(props: {
  value: string | null;
  presetNames: string[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string | null) => void;
}): JSX.Element {
  let selectElement: HTMLSelectElement | undefined;

  const missing = () => Boolean(props.value) && !props.presetNames.includes(props.value as string);
  const optionNames = () => {
    const selected = props.value ? String(props.value).trim() : '';
    if (!selected || props.presetNames.includes(selected)) {
      return props.presetNames;
    }
    return [selected, ...props.presetNames];
  };

  createEffect(() => {
    const selected = props.value ? String(props.value).trim() : '';
    optionNames();
    if (selectElement && selectElement.value !== selected) {
      selectElement.value = selected;
    }
  });

  return (
    <div class="grid gap-5">
      <div>
        <h3 class="text-base font-semibold text-slate-900">{locale.chats.bindingPresetTabTitle}</h3>
        <p class="mt-1 text-sm text-slate-500">{locale.chats.bindingPresetHint}</p>
      </div>

      <Field label={locale.chats.bindPreset}>
        <Select
          ref={(element) => {
            selectElement = element;
          }}
          value={props.value ?? ''}
          onChange={(event) => props.onChange(event.currentTarget.value || null)}
          disabled={props.disabled || props.loading}
        >
          <option value="">{locale.chats.bindingNone}</option>
          {optionNames().map((name) => <option value={name}>{name}</option>)}
        </Select>
      </Field>

      <div class="flex flex-wrap items-center gap-3">
        <Tag tone={missing() ? 'danger' : 'default'}>{missing() ? locale.chats.bindingMissingResource : (props.value || locale.chats.bindingNone)}</Tag>
        <Button variant="secondary" onClick={() => props.onChange(null)} disabled={props.disabled || !props.value}>{locale.chats.bindingClear}</Button>
      </div>

      <Show when={!props.loading && optionNames().length === 0}>
        <EmptyState title={locale.chats.bindingNoPresets} description={locale.chats.bindingNoPresetsHint} />
      </Show>
    </div>
  );
}
