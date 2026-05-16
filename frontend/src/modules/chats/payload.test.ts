import { describe, expect, it } from 'vitest';

import { createAssistantChatMessage, createUserChatMessage } from '@/lib/api/core-client';
import type { ChatPayload } from '@/types/domain';

import {
  appendContinuationToSwipe,
  ensureSwipeState,
  getPayloadMessage,
  replaceMessageReasoning,
  replaceMessageSourceResponse,
  truncateTimelineForRegenerate,
} from './payload';

function samplePayload(): ChatPayload {
  return [
    {
      user_name: 'You',
      character_name: 'Alice',
      create_date: '2026-03-07@10h00m00s',
      chat_metadata: {},
    },
    createUserChatMessage('You', 'hello'),
    createAssistantChatMessage('Alice', 'hi there'),
    createUserChatMessage('You', 'tell me more'),
  ];
}

describe('chat payload helpers', () => {
  it('initializes swipe data from assistant content', () => {
    const message = ensureSwipeState(createAssistantChatMessage('Alice', 'reply text'));
    expect(message.swipe_id).toBe(0);
    expect(message.swipes).toEqual(['reply text']);
    expect(message.swipe_info).toEqual([{}]);
  });

  it('appends continuation into current swipe', () => {
    const payload = appendContinuationToSwipe(samplePayload(), 1, ' and more');
    expect(getPayloadMessage(payload, 1)?.mes).toBe('hi there and more');
    expect(getPayloadMessage(payload, 1)?.swipes?.[0]).toBe('hi there and more');
    expect(getPayloadMessage(payload, 1)?.extra).toMatchObject({
      source_response_text: 'hi there and more',
    });
  });

  it('truncates later messages and opens a new swipe for regenerate', () => {
    const payload = truncateTimelineForRegenerate(samplePayload(), 1);
    expect(payload).toHaveLength(3);
    const target = getPayloadMessage(payload, 1);
    expect(target?.swipes).toEqual(['hi there', '']);
    expect(target?.swipe_id).toBe(1);
    expect(target?.mes).toBe('');
    expect(target?.extra).toEqual({});
    expect(target?.swipe_info?.[1]).toEqual({ extra: {} });
  });

  it('syncs reasoning and source text into the current swipe extra payload', () => {
    let payload = replaceMessageReasoning(samplePayload(), 1, 'Inner plan', 'Reasoning');
    payload = replaceMessageSourceResponse(payload, 1, '<thinking>Inner plan</thinking>\nhi there');

    const message = getPayloadMessage(payload, 1);
    expect(message?.extra).toMatchObject({
      reasoning: 'Inner plan',
      source_response_text: '<thinking>Inner plan</thinking>\nhi there',
    });
    expect(message?.swipe_info?.[0]).toMatchObject({
      extra: {
        reasoning: 'Inner plan',
        source_response_text: '<thinking>Inner plan</thinking>\nhi there',
      },
    });
  });

  it('clears render projection metadata when assistant text changes during streaming', () => {
    const payload: ChatPayload = [
      samplePayload()[0],
      samplePayload()[1],
      {
        ...createAssistantChatMessage('Alice', '```html\n<div>demo</div>\n```'),
        extra: {
          render_blocks: [
            {
              kind: 'code',
              language: 'html',
              content: '<div>demo</div>',
              interactive: true,
              preview_kind: 'html',
              preview_hash: 'abcd1234',
            },
          ],
          render_has_interactive_code: true,
          regex_display_text: '```html\n<div>demo</div>\n```',
        },
      },
    ];

    const nextPayload = appendContinuationToSwipe(payload, 1, '\n<script>run()</script>');
    const message = getPayloadMessage(nextPayload, 1);
    expect(message?.extra).not.toHaveProperty('render_blocks');
    expect(message?.extra).not.toHaveProperty('render_has_interactive_code');
    expect(message?.extra).not.toHaveProperty('regex_display_text');
  });
});
