import { fireEvent, render, screen, within } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { SessionBindings } from '@/types/domain';

import { SessionBindingOverlay } from './SessionBindingOverlay';

function createBindings(overrides: Partial<SessionBindings> = {}): SessionBindings {
  return {
    world_info_names: [],
    preset_ref: null,
    api_profile_id: null,
    ...overrides,
  };
}

describe('SessionBindingOverlay', () => {
  it('keeps added world info visible when the parent re-emits bindings while the overlay stays open', async () => {
    const [bindings, setBindings] = createSignal<SessionBindings>(createBindings());

    render(() => (
      <>
        <button type="button" onClick={() => setBindings(createBindings())}>refresh bindings</button>
        <SessionBindingOverlay
          open
          activeTab="world-info"
          bindings={bindings()}
          worldInfoNames={['Lore', 'Atlas']}
          presetNames={[]}
          apiProfiles={[]}
          onClose={vi.fn()}
          onTabChange={vi.fn()}
          onSave={vi.fn()}
        />
      </>
    ));

    const availableLoreRow = screen.getByText('Lore').closest('.tt-card-surface');
    expect(availableLoreRow).toBeTruthy();

    await fireEvent.click(within(availableLoreRow as HTMLElement).getByRole('button', { name: locale.common.add }));

    expect(screen.queryByText(locale.chats.bindingNoWorldInfoBound)).toBeNull();
    expect(screen.getAllByText('Lore')).toHaveLength(1);
    expect(screen.getByRole('button', { name: locale.common.remove })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'refresh bindings' }));

    expect(screen.queryByText(locale.chats.bindingNoWorldInfoBound)).toBeNull();
    expect(screen.getAllByText('Lore')).toHaveLength(1);
    expect(screen.getByRole('button', { name: locale.common.remove })).toBeTruthy();
  });

  it('moves removed world info back into the available list before save', async () => {
    render(() => (
      <SessionBindingOverlay
        open
        activeTab="world-info"
        bindings={createBindings({ world_info_names: ['Lore'] })}
        worldInfoNames={['Lore', 'Atlas']}
        presetNames={[]}
        apiProfiles={[]}
        onClose={vi.fn()}
        onTabChange={vi.fn()}
        onSave={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.common.remove }));

    expect(screen.getByText(locale.chats.bindingNoWorldInfoBound)).toBeTruthy();

    const availableLoreRow = screen.getByText('Lore').closest('.tt-card-surface');
    expect(availableLoreRow).toBeTruthy();
    expect(within(availableLoreRow as HTMLElement).getByRole('button', { name: locale.common.add })).toBeTruthy();
  });

  it('resets unsaved world info changes when the overlay is closed and reopened', async () => {
    const [open, setOpen] = createSignal(true);

    render(() => (
      <>
        <button type="button" onClick={() => setOpen((current) => !current)}>toggle overlay</button>
        <SessionBindingOverlay
          open={open()}
          activeTab="world-info"
          bindings={createBindings()}
          worldInfoNames={['Lore']}
          presetNames={[]}
          apiProfiles={[]}
          onClose={vi.fn()}
          onTabChange={vi.fn()}
          onSave={vi.fn()}
        />
      </>
    ));

    const availableLoreRow = screen.getByText('Lore').closest('.tt-card-surface');
    expect(availableLoreRow).toBeTruthy();

    await fireEvent.click(within(availableLoreRow as HTMLElement).getByRole('button', { name: locale.common.add }));

    expect(screen.queryByText(locale.chats.bindingNoWorldInfoBound)).toBeNull();
    expect(screen.getByRole('button', { name: locale.common.remove })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'toggle overlay' }));
    expect(screen.queryByText(locale.chats.bindingTitle)).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'toggle overlay' }));

    expect(screen.getByText(locale.chats.bindingNoWorldInfoBound)).toBeTruthy();
    expect(screen.queryByRole('button', { name: locale.common.remove })).toBeNull();

    const reopenedLoreRow = screen.getByText('Lore').closest('.tt-card-surface');
    expect(reopenedLoreRow).toBeTruthy();
    expect(within(reopenedLoreRow as HTMLElement).getByRole('button', { name: locale.common.add })).toBeTruthy();
  });

  it('keeps preset selection stable when the available list refreshes without the selected option', async () => {
    const [presetNames, setPresetNames] = createSignal<string[]>(['Preset Alpha', 'Preset Beta']);

    render(() => (
      <>
        <button type="button" onClick={() => setPresetNames([])}>drop presets</button>
        <button type="button" onClick={() => setPresetNames(['Preset Alpha', 'Preset Beta'])}>restore presets</button>
        <SessionBindingOverlay
          open
          activeTab="preset"
          bindings={createBindings()}
          worldInfoNames={[]}
          presetNames={presetNames()}
          apiProfiles={[]}
          onClose={vi.fn()}
          onTabChange={vi.fn()}
          onSave={vi.fn()}
        />
      </>
    ));

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await fireEvent.change(select, { currentTarget: { value: 'Preset Alpha' }, target: { value: 'Preset Alpha' } });

    expect(select.value).toBe('Preset Alpha');
    expect(screen.getByText('Preset Alpha', { selector: 'span' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'drop presets' }));

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Preset Alpha');
    expect(screen.getByText('Preset Alpha', { selector: 'span' })).toBeTruthy();
    expect(screen.queryByText(locale.chats.bindingNone, { selector: 'span' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'restore presets' }));

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Preset Alpha');
    expect(screen.getByText('Preset Alpha', { selector: 'span' })).toBeTruthy();
  });
});
