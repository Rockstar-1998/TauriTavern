import type { Snapshot } from '@/types/domain';
import type { JSX } from 'solid-js';

import { Button, Card, EmptyState } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

export function SnapshotsSettingsWorkspace(props: {
  snapshot: Snapshot | null;
  onCreate: () => void;
  onLoad: (name: string) => void;
  onRestore: (name: string) => void;
  creating?: boolean;
  loading?: boolean;
  restoring?: boolean;
}): JSX.Element {
  if (!props.snapshot) {
    return (
      <EmptyState
        title={locale.settings.noSnapshotsSelected}
        description={locale.settings.snapshotSummary}
        action={<Button onClick={props.onCreate} disabled={props.creating}>{locale.settings.createSnapshot}</Button>}
      />
    );
  }

  return (
    <Card title={props.snapshot.name} subtitle={locale.settings.snapshotSummary}>
      <div class="space-y-4">
        <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
          <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.createdAtLabel}</div>
          <div class="mt-2 text-sm text-slate-700">{String(props.snapshot.created_at ?? '') || locale.characters.notSet}</div>
        </div>
        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => props.onLoad(props.snapshot!.name)} disabled={props.loading}>{locale.settings.loadSnapshot}</Button>
          <Button onClick={() => props.onRestore(props.snapshot!.name)} disabled={props.restoring}>{locale.settings.restoreSnapshot}</Button>
        </div>
      </div>
    </Card>
  );
}
