import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { WorldInfoEntry } from '../editor-schema';

import { WorldInfoEntryEditorModal } from './WorldInfoEntryEditorModal';

const entry: WorldInfoEntry = {
  uid: 4,
  displayIndex: 0,
  key: ['hero'],
  keysecondary: ['guild'],
  comment: 'Hero Notes',
  content: 'Detailed world info content.',
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: false,
  order: 100,
  position: 0,
  disable: false,
  ignoreBudget: false,
  excludeRecursion: false,
  preventRecursion: false,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: 0,
  probability: 100,
  useProbability: true,
  depth: 4,
  outletName: '',
  group: '',
  groupOverride: false,
  groupWeight: 100,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: '',
  role: 0,
  sticky: null,
  cooldown: null,
  delay: null,
  characterFilterNames: [],
  characterFilterTags: [],
  characterFilterExclude: false,
  triggers: [],
  extras: {},
};

describe('WorldInfoEntryEditorModal', () => {
  it('renders grouped entry fields and forwards edit actions', async () => {
    const onChange = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    render(() => (
      <WorldInfoEntryEditorModal
        open
        entry={entry}
        onClose={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onChange={onChange}
      />
    ));

    expect(screen.getByText('基本')).toBeTruthy();
    expect(screen.getByText('关键词')).toBeTruthy();
    expect(screen.getByText('插入')).toBeTruthy();
    expect(screen.getByText('角色过滤')).toBeTruthy();
    expect(screen.getByText('扩展')).toBeTruthy();
    expect(screen.getByDisplayValue('Hero Notes')).toBeTruthy();
    expect(screen.getByDisplayValue('hero')).toBeTruthy();
    expect(screen.getByDisplayValue('guild')).toBeTruthy();

    await fireEvent.input(screen.getByDisplayValue('Hero Notes'), { currentTarget: { value: 'Updated Notes' }, target: { value: 'Updated Notes' } });
    expect(onChange).toHaveBeenCalledWith('comment', 'Updated Notes');

    await fireEvent.click(screen.getByText(locale.worldInfo.duplicateEntry));
    await fireEvent.click(screen.getByText(locale.worldInfo.deleteEntry));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
