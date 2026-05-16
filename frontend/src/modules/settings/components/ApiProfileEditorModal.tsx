import { type JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { locale } from '@/shared/i18n';
import { Button, Field, Input } from '@/shared/components/ui';
import type { ChatProviderDraft, ProviderSource } from '@/types/domain';
import { ProviderPanel } from '@/modules/chats/components/provider-panel';

export function ApiProfileEditorModal(props: {
  open: boolean;
  title: string;
  name: string;
  draft: ChatProviderDraft;
  modelOptions: string[];
  statusPayload?: Record<string, unknown>;
  loadingModels?: boolean;
  saving?: boolean;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onSourceChange: (source: ProviderSource) => void;
  onModelChange: (value: string) => void;
  onFieldChange: (field: keyof ChatProviderDraft, value: string | boolean) => void;
  onRefreshModels: () => void;
  onSave: () => void;
}): JSX.Element {
  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="xl"
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="secondary" onClick={props.onClose}>{locale.common.cancel}</Button>
          <Button onClick={props.onSave} disabled={props.saving || !props.name.trim()}>{locale.common.save}</Button>
        </div>
      }
    >
      <div class="grid gap-5">
        <Field label={locale.settings.apiProfileName}>
          <Input value={props.name} onInput={(event) => props.onNameChange(event.currentTarget.value)} placeholder={locale.settings.apiProfileName} />
        </Field>

        <ProviderPanel
          draft={props.draft}
          modelOptions={props.modelOptions}
          statusPayload={props.statusPayload}
          disabled={props.saving}
          loadingModels={props.loadingModels}
          showPersistActions={false}
          onSourceChange={props.onSourceChange}
          onModelChange={props.onModelChange}
          onFieldChange={props.onFieldChange}
          onRefreshModels={props.onRefreshModels}
        />
      </div>
    </WorkbenchModal>
  );
}
