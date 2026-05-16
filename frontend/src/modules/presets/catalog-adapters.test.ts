import { describe, expect, it } from 'vitest';

import { getPresetCatalogAdapter } from './catalog-adapters';

describe('preset catalog adapters', () => {
  it('materializes SPresetSettings regex bindings for openai presets without dropping the original prompt', () => {
    const adapter = getPresetCatalogAdapter('openai');
    const restored = {
      prompts: [
        {
          identifier: 'SPresetSettings',
          name: 'ST Settings',
          content: JSON.stringify({
            RegexBinding: {
              regexes: [
                {
                  id: 'thinking-display',
                  findRegex: '/<thinking>([\\s\\S]*?)<\\/thinking>/g',
                  replaceString: '```html\n<section>$1</section>\n```',
                  placement: [2],
                  markdownOnly: true,
                },
              ],
            },
          }),
        },
      ],
      prompt_order: [],
    } as Record<string, unknown>;

    const normalized = adapter.normalizeRestoredPreset(restored);
    expect(normalized.regex_scripts).toEqual([
      expect.objectContaining({
        id: 'thinking-display',
      }),
    ]);

    const serialized = adapter.serializePreset(normalized);
    expect(serialized.regex_scripts).toEqual([
      expect.objectContaining({
        id: 'thinking-display',
      }),
    ]);
    expect(serialized.regex_scripts).toEqual([
      expect.not.objectContaining({
        source_kind: expect.anything(),
      }),
    ]);
    expect(serialized.prompts).toEqual(restored.prompts);
  });
});
