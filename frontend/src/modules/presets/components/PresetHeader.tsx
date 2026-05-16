import { Show, type JSX } from 'solid-js';

import { Button, Card, Tag } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';

export function PresetHeader(props: {
  title: string;
  catalogLabel: string;
  dirty: boolean;
  saveState: 'synced' | 'saving' | 'error';
  supportsRestore: boolean;
  supportsPerItemExport: boolean;
  supportsConnectionBinding: boolean;
  bindPresetToConnection: boolean;
  onToggleConnectionBinding: (value: boolean) => void;
  onUpdateCurrent: () => void;
  onSaveAs: () => void;
  onRename: () => void;
  onRestore: () => void;
  onExport: () => void;
  onDelete: () => void;
}): JSX.Element {
  const statusTone = () => (props.saveState === 'error' ? 'danger' : props.dirty ? 'default' : 'success');
  const statusLabel = () => {
    if (props.saveState === 'error') {
      return PRESET_COPY.statusError;
    }
    if (props.saveState === 'saving') {
      return PRESET_COPY.statusSaving;
    }
    if (props.dirty) {
      return PRESET_COPY.statusDirty;
    }
    return PRESET_COPY.statusSynced;
  };

  return (
    <Card>
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <h2 class="truncate text-3xl font-semibold text-slate-900">{props.title}</h2>
          <p class="mt-1 text-sm text-slate-500">{props.catalogLabel}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Tag tone={statusTone()}>{statusLabel()}</Tag>
            <Show when={props.supportsConnectionBinding}>
              <label class="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={props.bindPresetToConnection}
                  onInput={(event) => props.onToggleConnectionBinding(event.currentTarget.checked)}
                />
                <span>{PRESET_COPY.bindPresetToConnection}</span>
              </label>
            </Show>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button onClick={props.onUpdateCurrent}>{PRESET_COPY.updateCurrent}</Button>
          <Button variant="secondary" onClick={props.onSaveAs}>{PRESET_COPY.saveAs}</Button>
          <Button variant="secondary" onClick={props.onRename}>{PRESET_COPY.rename}</Button>
          {props.supportsRestore ? <Button variant="secondary" onClick={props.onRestore}>{PRESET_COPY.restore}</Button> : null}
          {props.supportsPerItemExport ? <Button variant="secondary" onClick={props.onExport}>{PRESET_COPY.export}</Button> : null}
          <Button variant="danger" onClick={props.onDelete}>{PRESET_COPY.delete}</Button>
        </div>
      </div>
    </Card>
  );
}
