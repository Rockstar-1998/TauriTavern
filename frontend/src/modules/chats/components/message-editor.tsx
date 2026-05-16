import { type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, TextArea } from '@/shared/components/ui';

export function MessageEditor(props: {
  value: string;
  disabled?: boolean;
  onInput: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div class="grid gap-3">
      <TextArea value={props.value} onInput={(event) => props.onInput(event.currentTarget.value)} class="min-h-[140px]" />
      <div class="flex flex-wrap gap-2">
        <Button onClick={props.onSave} disabled={props.disabled}>{locale.common.save}</Button>
        <Button variant="secondary" onClick={props.onCancel} disabled={props.disabled}>{locale.common.cancel}</Button>
      </div>
    </div>
  );
}
