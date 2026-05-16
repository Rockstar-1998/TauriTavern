import { describe, expect, it } from 'vitest';

import { createAssistantChatMessage } from '@/lib/api/core-client';
import type { ChatPayload } from '@/types/domain';

import {
  applyRegexProjectionToPayloadWindow,
  buildAssistantRegexProjection,
  buildPresetRegexRuntime,
  materializePresetRegexScripts,
  resolveAssistantPromptText,
  resolvePresetRegexScripts,
  resolvePresetRegexScriptsDetailed,
  resolveRegexDepth,
} from './preset-regex';

describe('preset regex runtime', () => {
  it('reads regex scripts from preset extras', () => {
    const presetDraft = {
      __extras: {
        regex_scripts: [
          {
            id: 'display-rule',
            findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
            replaceString: '```html\n<section>$1</section>\n```',
            placement: [2],
            markdownOnly: true,
          },
        ],
      },
    } as Record<string, unknown>;

    expect(resolvePresetRegexScripts(presetDraft)).toHaveLength(1);
  });

  it('reads regex scripts from SPresetSettings prompt content', () => {
    const presetDraft = {
      prompts: [
        {
          identifier: 'SPresetSettings',
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
    } as Record<string, unknown>;

    const resolved = resolvePresetRegexScriptsDetailed(presetDraft);

    expect(resolved.scripts).toHaveLength(1);
    expect(resolved.scripts[0]?.id).toBe('thinking-display');
    expect(resolved.sourceKinds).toEqual(['spresetsettings']);
  });

  it('merges all supported regex carriers and deduplicates stable duplicates', () => {
    const sharedRule = {
      id: 'shared',
      findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
      replaceString: '```html\n<section>$1</section>\n```',
      placement: [2],
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: false,
    };
    const presetDraft = {
      regex_scripts: [sharedRule, { ...sharedRule, id: 'top-unique', findRegex: '/<content>([\\s\\S]*?)<\\/content>/g' }],
      __extras: {
        regex_scripts: [{ ...sharedRule }],
      },
      prompts: [
        {
          identifier: 'SPresetSettings',
          content: JSON.stringify({
            RegexBinding: {
              regexes: [{ ...sharedRule, id: 'settings-unique', findRegex: '/<details>([\\s\\S]*?)<\\/details>/g' }],
            },
          }),
        },
      ],
    } as Record<string, unknown>;

    const resolved = resolvePresetRegexScriptsDetailed(presetDraft);

    expect(resolved.scripts.map((script) => script.id)).toEqual(['shared', 'top-unique', 'settings-unique']);
    expect(resolved.sourceKinds).toEqual(['top-level', 'extras', 'spresetsettings']);
  });

  it('applies persistent, display-only, and prompt-only rules by target', () => {
    const runtime = buildPresetRegexRuntime({
      regex_scripts: [
        {
          id: 'persistent',
          findRegex: '/<lau>[\\s\\S]*?<\\/lau>/g',
          replaceString: '',
          placement: [2],
          markdownOnly: false,
          promptOnly: false,
        },
        {
          id: 'display',
          findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
          replaceString: '```html\n<section>$1</section>\n```',
          placement: [2],
          markdownOnly: true,
          promptOnly: false,
        },
        {
          id: 'prompt',
          findRegex: '/<po>[\\s\\S]*?<\\/po>/g',
          replaceString: '',
          placement: [2],
          markdownOnly: false,
          promptOnly: true,
        },
      ],
    }, {
      userName: 'You',
      assistantName: 'Alice',
      isGroup: false,
    });

    const projection = buildAssistantRegexProjection({
      message: createAssistantChatMessage('Alice', '<lau>x</lau><scene>Body</scene><po>hidden</po>'),
      localMessageIndex: 0,
      startIndex: 0,
      totalMessages: 1,
      runtime,
    });

    expect(projection.canonicalText).toBe('<scene>Body</scene><po>hidden</po>');
    expect(projection.displayText).toContain('```html');
    expect(projection.promptText).toBe('<scene>Body</scene>');
  });

  it('supports escaped macro substitution and depth filters', () => {
    const runtime = buildPresetRegexRuntime({
      regex_scripts: [
        {
          id: 'depth-limited',
          findRegex: '/{{char}}/g',
          replaceString: 'MATCH',
          placement: [2],
          substituteRegex: 2,
          minDepth: 1,
          maxDepth: 2,
        },
      ],
    }, {
      userName: 'You',
      assistantName: 'Alice (Test)',
      isGroup: false,
    });

    expect(resolveRegexDepth(4, 0, 3)).toBe(0);
    expect(resolveRegexDepth(4, 0, 1)).toBe(2);

    const recentProjection = buildAssistantRegexProjection({
      message: createAssistantChatMessage('Alice', 'Alice (Test)'),
      localMessageIndex: 3,
      startIndex: 0,
      totalMessages: 4,
      runtime,
    });
    const olderProjection = buildAssistantRegexProjection({
      message: createAssistantChatMessage('Alice', 'Alice (Test)'),
      localMessageIndex: 1,
      startIndex: 0,
      totalMessages: 4,
      runtime,
    });

    expect(recentProjection.promptText).toBe('Alice (Test)');
    expect(olderProjection.promptText).toBe('MATCH');
  });

  it('uses source_response_text for prompt and display projections', () => {
    const runtime = buildPresetRegexRuntime({
      regex_scripts: [
        {
          id: 'thinking-display',
          findRegex: '/<thinking>([\\s\\S]*?)<\\/thinking>/g',
          replaceString: '```html\n<section>$1</section>\n```',
          placement: [2],
          markdownOnly: true,
        },
      ],
    }, {
      userName: 'You',
      assistantName: 'Alice',
      isGroup: false,
    });

    const message = createAssistantChatMessage('Alice', 'Visible body');
    message.extra = {
      reasoning: 'Inner plan',
      source_response_text: '<thinking>Inner plan</thinking>\nVisible body',
    };

    expect(resolveAssistantPromptText({
      message,
      localMessageIndex: 0,
      startIndex: 0,
      totalMessages: 1,
      runtime,
    })).toBe('<thinking>Inner plan</thinking>\nVisible body');

    const projection = buildAssistantRegexProjection({
      message,
      localMessageIndex: 0,
      startIndex: 0,
      totalMessages: 1,
      runtime,
    });

    expect(projection.displayText).toContain('```html');
    expect(projection.displayText).toContain('Visible body');
  });

  it('writes regex caches into loaded payload windows', () => {
    const payload = [
      {
        user_name: 'You',
        character_name: 'Alice',
        create_date: '2026-01-01',
        chat_metadata: {},
      },
      createAssistantChatMessage('Alice', '<scene>Body</scene>'),
    ] as ChatPayload;

    const runtime = buildPresetRegexRuntime({
      regex_scripts: [
        {
          id: 'display',
          findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
          replaceString: '```html\n<section>$1</section>\n```',
          placement: [2],
          markdownOnly: true,
        },
      ],
    }, {
      userName: 'You',
      assistantName: 'Alice',
      isGroup: false,
    });

    const nextPayload = applyRegexProjectionToPayloadWindow({
      payload,
      startIndex: 0,
      totalMessages: 1,
      runtime,
    });

    expect(nextPayload[1]).toMatchObject({
      extra: {
        regex_display_text: '```html\n<section>Body</section>\n```',
      },
    });
  });

  it('materializes normalized regex scripts to top-level', () => {
    const materialized = materializePresetRegexScripts({
      prompts: [
        {
          identifier: 'SPresetSettings',
          content: JSON.stringify({
            RegexBinding: {
              regexes: [
                {
                  id: 'embedded-rule',
                  findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
                  replaceString: '```html\n<section>$1</section>\n```',
                  placement: [2],
                  markdownOnly: true,
                },
              ],
            },
          }),
        },
      ],
    });

    expect(materialized.regex_scripts).toEqual([
      expect.objectContaining({
        id: 'embedded-rule',
        findRegex: '/<scene>([\\s\\S]*?)<\\/scene>/g',
      }),
    ]);
  });
});
