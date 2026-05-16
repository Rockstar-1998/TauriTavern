import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/types/domain';

import {
  buildMessageRawContent,
  buildMessageSourceContent,
  composeAssistantSourceContent,
  resolveMessageRenderContent,
  splitThinkingContent,
} from './reasoning';

describe('splitThinkingContent', () => {
  it('separates thinking blocks from visible content', () => {
    expect(splitThinkingContent('<thinking>step 1</thinking>Hello')).toEqual({
      content: 'Hello',
      reasoning: 'step 1',
    });
  });

  it('leaves plain text untouched', () => {
    expect(splitThinkingContent('Hello')).toEqual({
      content: 'Hello',
      reasoning: null,
    });
  });
});

describe('message render content helpers', () => {
  it('builds assistant source text from visible content and reasoning', () => {
    expect(composeAssistantSourceContent('Hello', 'step 1')).toBe('<thinking>step 1</thinking>\nHello');
    expect(composeAssistantSourceContent('Hello', '')).toBe('Hello');
  });

  it('returns raw and source variants for assistant messages', () => {
    const message = {
      name: 'Assistant',
      is_user: false,
      is_system: false,
      send_date: '2026-01-01T00:00:00.000Z',
      mes: 'Visible body',
      extra: {
        reasoning: 'Inner plan',
      },
    } as ChatMessage;

    expect(buildMessageRawContent(message)).toBe('Visible body');
    expect(buildMessageSourceContent(message)).toBe('<thinking>Inner plan</thinking>\nVisible body');
  });

  it('prefers message.extra.reasoning over fallback tags', () => {
    const message = {
      name: 'Assistant',
      is_user: false,
      is_system: false,
      send_date: '2026-01-01T00:00:00.000Z',
      mes: '<thinking>old</thinking>Hello',
      extra: {
        reasoning: 'new',
        reasoning_display_text: 'Thinking',
      },
    } as ChatMessage;

    expect(resolveMessageRenderContent(message)).toMatchObject({
      content: 'Hello',
      rawContent: '<thinking>old</thinking>Hello',
      sourceContent: '<thinking>old</thinking>Hello',
      reasoning: 'new',
      reasoningDisplayText: 'Thinking',
    });
  });

  it('prefers regex display projection for rendered content while preserving raw/source variants', () => {
    const message = {
      name: 'Assistant',
      is_user: false,
      is_system: false,
      send_date: '2026-01-01T00:00:00.000Z',
      mes: 'Body',
      extra: {
        reasoning: 'raw',
        source_response_text: '<thinking>raw</thinking>\nBody',
        regex_display_text: '```html\n<div>Rendered</div>\n```',
      },
    } as ChatMessage;

    expect(resolveMessageRenderContent(message)).toMatchObject({
      content: '```html\n<div>Rendered</div>\n```',
      rawContent: 'Body',
      sourceContent: '<thinking>raw</thinking>\nBody',
      reasoning: 'raw',
    });
  });

  it('prefers generic display_text over regex and canonical text for final rendered content', () => {
    const message = {
      name: 'Assistant',
      is_user: false,
      is_system: false,
      send_date: '2026-01-01T00:00:00.000Z',
      mes: '<summary>raw</summary>',
      extra: {
        display_text: '```html\n<div class="rendered">Rendered</div>\n```',
        regex_display_text: '<summary>intermediate</summary>',
        reasoning: 'raw',
        source_response_text: '<thinking>raw</thinking>\n<summary>raw</summary>',
      },
    } as ChatMessage;

    expect(resolveMessageRenderContent(message)).toMatchObject({
      content: '```html\n<div class="rendered">Rendered</div>\n```',
      rawContent: '<summary>raw</summary>',
      sourceContent: '<thinking>raw</thinking>\n<summary>raw</summary>',
      reasoning: 'raw',
    });
  });
});
