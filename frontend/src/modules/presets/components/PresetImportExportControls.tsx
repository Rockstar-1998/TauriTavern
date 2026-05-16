import type { JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button } from '@/shared/components/ui';

export function PresetImportExportControls(props: {
  disabled?: boolean;
  onImport: (file: File) => void;
  onExport: () => void;
}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-2">
      <label class={`inline-flex ${props.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        <span>
          <Button variant="secondary" disabled={props.disabled}>{locale.common.import}</Button>
        </span>
        <input
          type="file"
          class="hidden"
          accept=".json,.settings,.preset"
          disabled={props.disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) {
              return;
            }
            props.onImport(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <Button variant="secondary" onClick={props.onExport} disabled={props.disabled}>{locale.common.export}</Button>
    </div>
  );
}
