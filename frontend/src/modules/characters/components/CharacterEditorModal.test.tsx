import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

import { CharacterEditorModal, type CharacterEditorForm } from './CharacterEditorModal';

const baseForm: CharacterEditorForm = {
  name: 'Alice',
  description: 'desc',
  personality: 'personality',
  scenario: 'scenario',
  firstMessage: 'hello',
  exampleMessages: 'example',
  creator: 'Tester',
  creatorNotes: 'notes',
  version: '1.0',
  tags: ['leader'],
  systemPrompt: 'Stay calm',
  postHistoryInstructions: 'Keep short',
  talkativeness: 0.7,
  favorite: true,
  alternateGreetings: ['Hi', 'Ready?'],
  world: 'Guildverse',
  avatarFile: null,
};

describe('CharacterEditorModal', () => {
  it('renders the grouped parameter sections for create mode', () => {
    render(() => (
      <CharacterEditorModal
        open
        mode="create"
        form={baseForm}
        worldNames={['Guildverse']}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onChange={vi.fn()}
      />
    ));

    expect(screen.getByText(locale.characters.createTitle)).toBeTruthy();
    expect(screen.getByText(locale.characters.basicInfo)).toBeTruthy();
    expect(screen.getByText(locale.characters.characterSetup)).toBeTruthy();
    expect(screen.getByText(locale.characters.conversationParameters)).toBeTruthy();
    expect(screen.getByText(locale.characters.promptAndNotes)).toBeTruthy();
    expect((screen.getByLabelText(locale.characters.favorites) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(locale.characters.talkativeness) as HTMLInputElement).value).toBe('0.7');
    expect((screen.getByLabelText(locale.characters.alternateGreetings) as HTMLTextAreaElement).value).toBe('Hi\nReady?');
  });

  it.each([
    {
      section: 'basic-info' as const,
      title: locale.characters.editBasicInfo,
      visible: [locale.characters.name, locale.characters.creator, locale.characters.version, locale.characters.favorites],
      hidden: [locale.characters.description, locale.characters.firstMessage, locale.characters.systemPrompt],
    },
    {
      section: 'character-setup' as const,
      title: locale.characters.editCharacterSetup,
      visible: [locale.characters.description, locale.characters.personality, locale.characters.scenario],
      hidden: [locale.characters.name, locale.characters.firstMessage, locale.characters.systemPrompt],
    },
    {
      section: 'conversation-parameters' as const,
      title: locale.characters.editConversationParameters,
      visible: [locale.characters.firstMessage, locale.characters.alternateGreetings, locale.characters.exampleMessages, locale.characters.talkativeness],
      hidden: [locale.characters.name, locale.characters.description, locale.characters.systemPrompt],
    },
    {
      section: 'prompt-and-notes' as const,
      title: locale.characters.editPromptAndNotes,
      visible: [locale.characters.systemPrompt, locale.characters.postHistoryInstructions, locale.characters.creatorNotes],
      hidden: [locale.characters.name, locale.characters.description, locale.characters.firstMessage],
    },
  ])('renders only the requested edit section: $section', ({ section, title, visible, hidden }) => {
    render(() => (
      <CharacterEditorModal
        open
        mode="edit"
        section={section}
        form={baseForm}
        worldNames={['Guildverse']}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onChange={vi.fn()}
      />
    ));

    expect(screen.getByText(title)).toBeTruthy();

    for (const label of visible) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    for (const label of hidden) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('writes favorite, talkativeness, and alternate greetings through onChange', async () => {
    const onChange = vi.fn();

    render(() => (
      <CharacterEditorModal
        open
        mode="edit"
        section="conversation-parameters"
        form={baseForm}
        worldNames={['Guildverse']}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onChange={onChange}
      />
    ));

    render(() => (
      <CharacterEditorModal
        open
        mode="edit"
        section="basic-info"
        form={baseForm}
        worldNames={['Guildverse']}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onChange={onChange}
      />
    ));

    await fireEvent.click(screen.getByLabelText(locale.characters.favorites));
    expect(onChange).toHaveBeenCalledWith('favorite', false);

    await fireEvent.input(screen.getByLabelText(locale.characters.talkativeness), { target: { value: '0.85' } });
    expect(onChange).toHaveBeenCalledWith('talkativeness', 0.85);

    await fireEvent.input(screen.getByLabelText(locale.characters.alternateGreetings), { target: { value: 'Alpha\nBeta' } });
    expect(onChange).toHaveBeenCalledWith('alternateGreetings', ['Alpha', 'Beta']);
  });
});
