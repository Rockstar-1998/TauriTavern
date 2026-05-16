import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { Snapshot } from '@/types/domain';

import { SnapshotsSettingsWorkspace } from './SnapshotsSettingsWorkspace';

const sampleSnapshot = {
  name: 'snapshot-1',
  created_at: '2026-03-09T03:10:00Z',
} as Snapshot;

describe('SnapshotsSettingsWorkspace', () => {
  it('shows the empty state and forwards create actions', async () => {
    const handleCreate = vi.fn();

    render(() => (
      <SnapshotsSettingsWorkspace
        snapshot={null}
        onCreate={handleCreate}
        onLoad={() => undefined}
        onRestore={() => undefined}
      />
    ));

    expect(screen.getByText(locale.settings.noSnapshotsSelected)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: locale.settings.createSnapshot }));

    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('renders snapshot details and wires load/restore actions', async () => {
    const handleLoad = vi.fn();
    const handleRestore = vi.fn();

    render(() => (
      <SnapshotsSettingsWorkspace
        snapshot={sampleSnapshot}
        onCreate={() => undefined}
        onLoad={handleLoad}
        onRestore={handleRestore}
      />
    ));

    expect(screen.getByText('snapshot-1')).toBeTruthy();
    expect(screen.getByText('2026-03-09T03:10:00Z')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: locale.settings.loadSnapshot }));
    await fireEvent.click(screen.getByRole('button', { name: locale.settings.restoreSnapshot }));

    expect(handleLoad).toHaveBeenCalledWith('snapshot-1');
    expect(handleRestore).toHaveBeenCalledWith('snapshot-1');
  });
});
