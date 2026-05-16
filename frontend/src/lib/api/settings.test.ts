import { describe, expect, it } from 'vitest';

import { parseSillyTavernSettingsPayload } from './settings';

describe('parseSillyTavernSettingsPayload', () => {
  it('parses settings string and applies top-level overrides', () => {
    const payload = {
      settings: JSON.stringify({
        name1: 'You',
        api_profiles: [{ id: 'profile-1', name: 'Profile A', settings: {} }],
        world_names: ['legacy-world'],
        themes: [{ name: 'legacy-theme' }],
      }),
      world_names: ['override-world'],
      themes: [{ name: 'override-theme' }],
    };

    const result = parseSillyTavernSettingsPayload(payload);

    expect(result.api_profiles[0]?.name).toBe('Profile A');
    expect(result.world_names).toEqual(['override-world']);
    expect(result.themes).toEqual([{ name: 'override-theme' }]);
  });

  it('accepts numeric openai_max_context from legacy settings payloads', () => {
    const payload = {
      settings: JSON.stringify({
        name1: 'You',
        oai_settings: {
          chat_completion_source: 'openai',
          openai_model: 'gpt-4.1',
          openai_max_context: 1000000,
        },
      }),
    };

    const result = parseSillyTavernSettingsPayload(payload);

    expect(result.oai_settings?.openai_max_context).toBe('1000000');
  });

  it('throws on invalid settings JSON', () => {
    expect(() => parseSillyTavernSettingsPayload({ settings: '{' })).toThrow('settings 不是有效 JSON');
  });

  it('throws when settings is not an object', () => {
    expect(() => parseSillyTavernSettingsPayload({ settings: '[]' })).toThrow('settings 不是对象');
  });
});
