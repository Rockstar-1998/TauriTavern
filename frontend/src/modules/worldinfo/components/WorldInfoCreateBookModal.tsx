import type { JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Field, Input } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

export function WorldInfoCreateBookModal(props: {
  open: boolean;
  title: string;
  confirmLabel: string;
  value: string;
  pending?: boolean;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}): JSX.Element {
  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      size="md"
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="secondary" onClick={props.onClose}>{locale.common.cancel}</Button>
          <Button onClick={props.onSubmit} disabled={props.pending || !props.value.trim()}>{props.confirmLabel}</Button>
        </div>
      }
    >
      <Field label={locale.worldInfo.bookNameLabel}>
        <Input value={props.value} onInput={(event) => props.onValueChange(event.currentTarget.value)} placeholder={locale.worldInfo.bookNamePlaceholder} />
      </Field>
    </WorkbenchModal>
  );
}
