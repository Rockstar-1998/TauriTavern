import type { JSX } from 'solid-js';

import { Button, Card, Tag } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import type { NormalizedWorldInfoRecord } from '../editor-schema';

export function WorldInfoBookHeader(props: {
  name: string;
  record: NormalizedWorldInfoRecord;
  saveDirty?: boolean;
  savePending?: boolean;
  saveError?: string | null;
  onRename: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): JSX.Element {
  const entryCount = () => Object.keys(props.record.entries).length;
  const saveTone = () => (props.saveError ? 'danger' : props.savePending ? 'default' : props.saveDirty ? 'default' : 'success') as 'default' | 'danger' | 'success';
  const saveLabel = () => {
    if (props.saveError) {
      return locale.worldInfo.saveFailed;
    }
    if (props.savePending) {
      return locale.worldInfo.savePending;
    }
    if (props.saveDirty) {
      return locale.worldInfo.saveDirty;
    }
    return locale.worldInfo.saveSynced;
  };

  return (
    <Card>
      <div class="flex flex-wrap items-start justify-between gap-5">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="truncate text-3xl font-semibold text-slate-900">{props.name}</h2>
            <Tag tone={saveTone()}>{saveLabel()}</Tag>
          </div>
          <p class="mt-2 text-sm text-slate-500">{locale.worldInfo.bookWorkspaceSubtitle}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <Tag>{locale.worldInfo.entryCount.replace('{count}', String(entryCount()))}</Tag>
          </div>
          {props.saveError ? <div class="mt-3 text-sm text-rose-600">{props.saveError}</div> : null}
        </div>

        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onRename}>{locale.worldInfo.renameBook}</Button>
          <Button variant="secondary" onClick={props.onExport}>{locale.worldInfo.exportBook}</Button>
          <Button variant="secondary" onClick={props.onDuplicate}>{locale.worldInfo.duplicateBook}</Button>
          <Button variant="danger" onClick={props.onDelete}>{locale.common.delete}</Button>
        </div>
      </div>
    </Card>
  );
}
