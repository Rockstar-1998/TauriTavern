import type { JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';

export function PresetDirtyGuardModal(props: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onCancel}
      title={PRESET_COPY.dirtyTitle}
      size="md"
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="ghost" onClick={props.onCancel}>{PRESET_COPY.cancel}</Button>
          <Button variant="secondary" onClick={props.onDiscard}>{PRESET_COPY.discard}</Button>
          <Button onClick={props.onSave}>{PRESET_COPY.saveAndContinue}</Button>
        </div>
      }
    >
      <p class="text-sm text-slate-600">{PRESET_COPY.dirtyBody}</p>
    </WorkbenchModal>
  );
}
