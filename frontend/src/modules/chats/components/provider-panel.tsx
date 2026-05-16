import { For, Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, Field, Input, Select, TextArea } from '@/shared/components/ui';
import { safeJsonStringify } from '@/shared/utils/format';
import type { ChatProviderDraft, ProviderSource } from '@/types/domain';

import { PROVIDER_OPTIONS } from '../provider-settings';

export function ProviderPanel(props: {
  draft: ChatProviderDraft;
  modelOptions: string[];
  statusPayload?: Record<string, unknown>;
  disabled?: boolean;
  loadingModels?: boolean;
  savingDefaults?: boolean;
  showPersistActions?: boolean;
  saveDefaultsLabel?: string;
  onSourceChange: (source: ProviderSource) => void;
  onModelChange: (model: string) => void;
  onFieldChange: (field: keyof ChatProviderDraft, value: string | boolean) => void;
  onRefreshModels: () => void;
  onSaveDefaults?: () => void;
  onResetDefaults?: () => void;
}): JSX.Element {
  const isCustom = () => props.draft.chat_completion_source === 'custom';
  const showPersistActions = () => props.showPersistActions !== false;

  return (
    <div class="grid gap-4">
      <Field label={locale.chats.providerPanel.providerLabel}>
        <Select value={props.draft.chat_completion_source} onChange={(event) => props.onSourceChange(event.currentTarget.value as ProviderSource)} disabled={props.disabled}>
          <For each={PROVIDER_OPTIONS}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </Select>
      </Field>

      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <Field label={locale.chats.providerPanel.modelLabel} hint={locale.chats.providerPanel.modelHint}>
          <Input
            value={props.draft.model}
            onInput={(event) => props.onModelChange(event.currentTarget.value)}
            list="chat-provider-models"
            disabled={props.disabled}
            placeholder={locale.chats.providerPanel.modelPlaceholder}
          />
          <datalist id="chat-provider-models">
            <For each={props.modelOptions}>{(model) => <option value={model} />}</For>
          </datalist>
        </Field>

        <Field label={locale.chats.providerPanel.maxContextLabel} hint={locale.chats.providerPanel.maxContextHint}>
          <Input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={props.draft.openai_max_context}
            onInput={(event) => props.onFieldChange('openai_max_context', event.currentTarget.value)}
            disabled={props.disabled}
            placeholder="8192"
          />
        </Field>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Field label={locale.chats.providerPanel.reverseProxyLabel}>
          <Input value={props.draft.reverse_proxy} onInput={(event) => props.onFieldChange('reverse_proxy', event.currentTarget.value)} disabled={props.disabled} placeholder="https://api.openai.com/v1" />
        </Field>
        <Field label={locale.chats.providerPanel.proxyPasswordLabel}>
          <Input type="password" value={props.draft.proxy_password} onInput={(event) => props.onFieldChange('proxy_password', event.currentTarget.value)} disabled={props.disabled} />
        </Field>
      </div>

      <label class="tt-card-surface inline-flex items-center gap-3 rounded-[1.2rem] px-3 py-3 text-sm text-slate-700">
        <input type="checkbox" checked={props.draft.bypass_status_check} onInput={(event) => props.onFieldChange('bypass_status_check', event.currentTarget.checked)} disabled={props.disabled} />
        {locale.chats.providerPanel.bypassStatusCheck}
      </label>

      <Show when={isCustom()}>
        <div class="grid gap-4">
          <Field label={locale.chats.providerPanel.customUrlLabel}>
            <Input value={props.draft.custom_url} onInput={(event) => props.onFieldChange('custom_url', event.currentTarget.value)} disabled={props.disabled} placeholder="https://your-host/v1" />
          </Field>
          <Field label={locale.chats.providerPanel.customIncludeHeadersLabel} hint={locale.chats.providerPanel.customIncludeHeadersHint}>
            <TextArea value={props.draft.custom_include_headers} onInput={(event) => props.onFieldChange('custom_include_headers', event.currentTarget.value)} disabled={props.disabled} class="min-h-[120px] font-mono text-xs" />
          </Field>
          <Field label={locale.chats.providerPanel.customIncludeBodyLabel} hint={locale.chats.providerPanel.customIncludeBodyHint}>
            <TextArea value={props.draft.custom_include_body} onInput={(event) => props.onFieldChange('custom_include_body', event.currentTarget.value)} disabled={props.disabled} class="min-h-[120px] font-mono text-xs" />
          </Field>
          <Field label={locale.chats.providerPanel.customExcludeBodyLabel} hint={locale.chats.providerPanel.customExcludeBodyHint}>
            <TextArea value={props.draft.custom_exclude_body} onInput={(event) => props.onFieldChange('custom_exclude_body', event.currentTarget.value)} disabled={props.disabled} class="min-h-[120px] font-mono text-xs" />
          </Field>
        </div>
      </Show>

      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={props.onRefreshModels} disabled={props.disabled || props.loadingModels}>{locale.common.refresh}</Button>
        <Show when={showPersistActions() && props.onResetDefaults}>
          <Button variant="secondary" onClick={props.onResetDefaults} disabled={props.disabled}>{locale.common.reset}</Button>
        </Show>
        <Show when={showPersistActions() && props.onSaveDefaults}>
          <Button onClick={props.onSaveDefaults} disabled={props.disabled || props.savingDefaults}>{props.saveDefaultsLabel ?? locale.chats.providerPanel.saveDefaults}</Button>
        </Show>
      </div>

      <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-xs text-slate-600">
        <div class="mb-2 font-semibold text-slate-900">{locale.chats.modelStatus}</div>
        <pre class="overflow-auto whitespace-pre-wrap">{safeJsonStringify(props.statusPayload ?? {})}</pre>
      </div>
    </div>
  );
}
