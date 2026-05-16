import { describe, expect, it } from 'vitest';

import { buildPresetHref, coerceAdvancedFormattingApiId, normalizePresetApiId } from './helpers';

describe('preset helpers', () => {
  it('normalizes main-route preset catalog ids to completion-only values', () => {
    expect(normalizePresetApiId(undefined)).toBe('openai');
    expect(normalizePresetApiId('koboldhorde')).toBe('openai');
    expect(normalizePresetApiId('reasoning')).toBe('openai');
    expect(coerceAdvancedFormattingApiId('reasoning')).toBe('reasoning');
  });

  it('builds preset urls with normalized api ids', () => {
    expect(buildPresetHref('koboldhorde', 'default')).toBe('/presets?apiId=openai&selected=default');
    expect(buildPresetHref('openai')).toBe('/presets?apiId=openai');
  });
});
