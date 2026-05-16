import { createEffect, createSignal, type JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Field, Input } from '@/shared/components/ui';

export function PresetNameModal(props: {
  open: boolean;
  title: string;
  confirmLabel: string;
  initialValue?: string;
  label: string;
  placeholder?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}): JSX.Element {
  const [value, setValue] = createSignal(props.initialValue ?? '');

  createEffect(() => {
    if (props.open) {
      setValue(props.initialValue ?? '');
    }
  });

  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="md"
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          <Button onClick={() => props.onConfirm(value().trim())} disabled={!value().trim()}>{props.confirmLabel}</Button>
        </div>
      }
    >
      <Field label={props.label}>
        <Input value={value()} onInput={(event) => setValue(event.currentTarget.value)} placeholder={props.placeholder} />
      </Field>
    </WorkbenchModal>
  );
}
