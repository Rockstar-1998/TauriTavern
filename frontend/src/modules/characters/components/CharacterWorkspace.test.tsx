import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { characterDetailSchema } from '@/types/domain';
import { locale } from '@/shared/i18n';

import { CharacterWorkspace } from './CharacterWorkspace';

const detail = characterDetailSchema.parse({
  name: 'Alice',
  avatar: 'alice.png',
  description: 'A careful strategist.',
  personality: 'Calm and thoughtful.',
  scenario: 'Watching over the guild hall.',
  first_mes: 'Welcome back.',
  mes_example: 'Alice: We should move at dawn.',
  creator: 'Tester',
  creator_notes: 'Internal note',
  character_version: '1.2',
  system_prompt: 'Stay in character.',
  post_history_instructions: 'Keep answers concise.',
  alternate_greetings: ['Hello there.', 'Ready for the mission?'],
  talkativeness: 0.65,
  fav: true,
  tags: ['leader', 'guild'],
  extensions: { world: 'Guildverse' },
});

describe('CharacterWorkspace', () => {
  it('renders the parameter workspace with start chat action', () => {
    const onStartChat = vi.fn();

    render(() => (
      <CharacterWorkspace
        detail={detail}
        onEditSection={vi.fn()}
        onStartChat={onStartChat}
        onStartMultiplayerChat={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    expect(screen.getByText(locale.characters.basicInfo)).toBeTruthy();
    expect(screen.getByText(locale.characters.characterSetup)).toBeTruthy();
    expect(screen.getByText(locale.characters.conversationParameters)).toBeTruthy();
    expect(screen.getByText(locale.characters.promptAndNotes)).toBeTruthy();
    expect(screen.getByRole('button', { name: locale.characters.startChat })).toBeTruthy();
    expect(screen.getByRole('button', { name: '联机会话' })).toBeTruthy();
    expect(screen.queryByText(locale.characters.recentChats)).toBeNull();
    expect(screen.getByText('0.65')).toBeTruthy();
    expect(screen.getByText('Hello there.')).toBeTruthy();
    expect(screen.getByText('Ready for the mission?')).toBeTruthy();
  });

  it('triggers start chat when requested', async () => {
    const onStartChat = vi.fn();

    render(() => (
      <CharacterWorkspace
        detail={detail}
        onEditSection={vi.fn()}
        onStartChat={onStartChat}
        onStartMultiplayerChat={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.startChat }));

    expect(onStartChat).toHaveBeenCalledTimes(1);
  });

  it('triggers multiplayer chat when requested', async () => {
    const onStartMultiplayerChat = vi.fn();

    render(() => (
      <CharacterWorkspace
        detail={detail}
        onEditSection={vi.fn()}
        onStartChat={vi.fn()}
        onStartMultiplayerChat={onStartMultiplayerChat}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: '联机会话' }));

    expect(onStartMultiplayerChat).toHaveBeenCalledTimes(1);
  });

  it('opens the matching editor section from each card', async () => {
    const onEditSection = vi.fn();

    render(() => (
      <CharacterWorkspace
        detail={detail}
        onEditSection={onEditSection}
        onStartChat={vi.fn()}
        onStartMultiplayerChat={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.basicInfo }));
    await fireEvent.click(screen.getByRole('button', { name: locale.characters.characterSetup }));
    await fireEvent.click(screen.getByRole('button', { name: locale.characters.conversationParameters }));
    await fireEvent.click(screen.getByRole('button', { name: locale.characters.promptAndNotes }));

    expect(onEditSection).toHaveBeenNthCalledWith(1, 'basic-info');
    expect(onEditSection).toHaveBeenNthCalledWith(2, 'character-setup');
    expect(onEditSection).toHaveBeenNthCalledWith(3, 'conversation-parameters');
    expect(onEditSection).toHaveBeenNthCalledWith(4, 'prompt-and-notes');
  });

  it('supports keyboard activation for section cards', async () => {
    const onEditSection = vi.fn();

    render(() => (
      <CharacterWorkspace
        detail={detail}
        onEditSection={onEditSection}
        onStartChat={vi.fn()}
        onStartMultiplayerChat={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    await fireEvent.keyDown(screen.getByRole('button', { name: locale.characters.basicInfo }), { key: 'Enter' });
    await fireEvent.keyDown(screen.getByRole('button', { name: locale.characters.conversationParameters }), { key: ' ' });

    expect(onEditSection).toHaveBeenNthCalledWith(1, 'basic-info');
    expect(onEditSection).toHaveBeenNthCalledWith(2, 'conversation-parameters');
  });

  it('shows the not-set marker for empty fields', () => {
    const sparseDetail = characterDetailSchema.parse({
      name: 'Bob',
      avatar: 'bob.png',
    });

    render(() => (
      <CharacterWorkspace
        detail={sparseDetail}
        onEditSection={vi.fn()}
        onStartChat={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExportJson={vi.fn()}
        onExportPng={vi.fn()}
      />
    ));

    expect(screen.getAllByText(locale.characters.notSet).length).toBeGreaterThan(0);
  });
});
