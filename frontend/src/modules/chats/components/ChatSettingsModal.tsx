import type { JSX } from 'solid-js';

import type { ModalSize } from '@/types/ui-desktop';
import { locale } from '@/shared/i18n';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import type { ChatProviderDraft, ProviderSource } from '@/types/domain';

import { ProviderPanel } from './provider-panel';

export function ChatSettingsModal(props: {
  open: boolean;
  onClose: () => void;
  draft: ChatProviderDraft;
  modelOptions: string[];
  statusPayload?: Record<string, unknown>;
  disabled?: boolean;
  loadingModels?: boolean;
  savingDefaults?: boolean;
  size?: ModalSize;
  onSourceChange: (source: ProviderSource) => void;
  onModelChange: (model: string) => void;
  onFieldChange: (field: keyof ChatProviderDraft, value: string | boolean) => void;
  onRefreshModels: () => void;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}): JSX.Element {
  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title={locale.chats.chatSettings} size={props.size ?? 'lg'}>
      <ProviderPanel
        draft={props.draft}
        modelOptions={props.modelOptions}
        statusPayload={props.statusPayload}
        disabled={props.disabled}
        loadingModels={props.loadingModels}
        savingDefaults={props.savingDefaults}
        onSourceChange={props.onSourceChange}
        onModelChange={props.onModelChange}
        onFieldChange={props.onFieldChange}
        onRefreshModels={props.onRefreshModels}
        onSaveDefaults={props.onSaveDefaults}
        onResetDefaults={props.onResetDefaults}
      />
    </WorkbenchModal>
  );
}
