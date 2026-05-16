import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { WorldInfoEntry } from '../editor-schema';

import { WorldInfoEntryCard } from './WorldInfoEntryCard';

const entry: WorldInfoEntry = {
  uid: 7,
  displayIndex: 3,
  key: ['alpha', 'beta'],
  keysecondary: ['gamma'],
  comment: 'Alpha Entry',
  content: 'A long lore paragraph that should be previewed in the card body.',
  constant: true,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: false,
  order: 90,
  position: 4,
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

describe('WorldInfoEntryCard', () => {
  it('renders the entry summary and opens from click or keyboard', async () => {
    const onOpen = vi.fn();
    render(() => <WorldInfoEntryCard entry={entry} onOpen={onOpen} />);

    expect(screen.getByRole('button', { name: 'Alpha Entry' })).toBeTruthy();
    expect(screen.getByText('alpha, beta · gamma')).toBeTruthy();
    expect(screen.getByText(locale.worldInfo.entryStatusEnabled)).toBeTruthy();
    expect(screen.getByText('constant')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Alpha Entry' }));
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Alpha Entry' }), { key: 'Enter' });
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Alpha Entry' }), { key: ' ' });

    expect(onOpen).toHaveBeenCalledTimes(3);
  });
});
