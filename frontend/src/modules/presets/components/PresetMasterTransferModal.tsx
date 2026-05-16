import { For, type JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button } from '@/shared/components/ui';

import type { MasterSectionId } from '../master-transfer';

export function PresetMasterTransferModal(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  sections: Array<{ id: MasterSectionId; label: string }>;
  selected: Record<MasterSectionId, boolean>;
  onToggle: (sectionId: MasterSectionId, checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="md"
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          <Button onClick={props.onConfirm}>{props.confirmLabel}</Button>
        </div>
      }
    >
      <div class="space-y-4">
        {props.description ? <p class="text-sm text-slate-600">{props.description}</p> : null}
        <div class="space-y-3">
          <For each={props.sections}>
            {(section) => (
              <label class="flex items-center justify-between rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <span>{section.label}</span>
                <input type="checkbox" checked={props.selected[section.id]} onInput={(event) => props.onToggle(section.id, event.currentTarget.checked)} />
              </label>
            )}
          </For>
        </div>
      </div>
    </WorkbenchModal>
  );
}
