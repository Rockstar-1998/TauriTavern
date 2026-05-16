import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { ApiProfile } from '@/types/domain';

import { ApiProfilesSettingsWorkspace } from './ApiProfilesSettingsWorkspace';

const sampleProfile = {
  id: 'profile-a',
  name: 'Alpha',
  settings: {
    chat_completion_source: 'openai',
    openai_model: 'gpt-4.1',
  },
  updated_at: '2026-03-09T03:00:00Z',
} as ApiProfile;

describe('ApiProfilesSettingsWorkspace', () => {
  it('shows the empty state and forwards create actions', async () => {
    const handleCreate = vi.fn();

    render(() => (
      <ApiProfilesSettingsWorkspace
        profile={null}
        onCreate={handleCreate}
        onEdit={() => undefined}
        onDelete={() => undefined}
      />
    ));

    expect(screen.getByText(locale.settings.noProfilesSelected)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: locale.settings.createApiProfile }));

    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('renders the selected profile summary and wires edit/delete actions', async () => {
    const handleCreate = vi.fn();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();

    render(() => (
      <ApiProfilesSettingsWorkspace
        profile={sampleProfile}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    ));

    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('openai')).toBeTruthy();
    expect(screen.getByText('gpt-4.1')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: locale.common.edit }));
    await fireEvent.click(screen.getByRole('button', { name: locale.common.delete }));

    expect(handleEdit).toHaveBeenCalledWith(sampleProfile);
    expect(handleDelete).toHaveBeenCalledWith(sampleProfile);
    expect(handleCreate).not.toHaveBeenCalled();
  });
});
