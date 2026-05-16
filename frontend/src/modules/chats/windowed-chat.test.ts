import { describe, expect, it } from 'vitest';

import type { ChatPayload } from '@/types/domain';

import { buildWindowedPayloadPatch, markWindowStateDirty, shiftWindowStateAfterPrepend, type WindowedChatState } from './windowed-chat';

const payload = [
  {
    user_name: 'You',
    character_name: 'Assistant',
    create_date: '2026-01-01',
    chat_metadata: {},
  },
  {
    name: 'You',
    is_user: true,
    is_system: false,
    send_date: '1',
    mes: 'hello',
    extra: {},
  },
  {
    name: 'Assistant',
    is_user: false,
    is_system: false,
    send_date: '2',
    mes: 'hi',
    extra: {},
  },
] as ChatPayload;

describe('windowed chat patching', () => {
  it('builds append patches when new messages were added after the saved tail', () => {
    const nextPayload = [
      ...payload,
      {
        name: 'Assistant',
        is_user: false,
        is_system: false,
        send_date: '3',
        mes: 'follow up',
        extra: {},
      },
    ] as ChatPayload;
    const state: WindowedChatState = {
      cursor: { offset: 128, size: 256, modifiedMillis: 10 },
      hasMoreBefore: true,
      startIndex: 18,
      savedMessageCount: 20,
      dirtyFromIndex: 2,
    };

    expect(buildWindowedPayloadPatch(nextPayload, state).patch).toEqual({
      kind: 'append',
      lines: [JSON.stringify(nextPayload[3])],
    });
  });

  it('tracks the earliest dirty message index', () => {
    const nextPayload = [...payload] as ChatPayload;
    nextPayload[2] = {
      ...nextPayload[2] as Record<string, unknown>,
      mes: 'updated',
    };
    const state: WindowedChatState = {
      cursor: { offset: 64, size: 256, modifiedMillis: 10 },
      hasMoreBefore: true,
      startIndex: 18,
      savedMessageCount: 20,
      dirtyFromIndex: 2,
    };

    expect(markWindowStateDirty(payload, nextPayload, state)).toMatchObject({
      dirtyFromIndex: 1,
    });
  });

  it('shifts saved indexes when earlier messages are prepended', () => {
    const state: WindowedChatState = {
      cursor: { offset: 64, size: 256, modifiedMillis: 10 },
      hasMoreBefore: true,
      startIndex: 10,
      savedMessageCount: 20,
      dirtyFromIndex: 20,
    };

    expect(shiftWindowStateAfterPrepend(state, 5)).toMatchObject({
      startIndex: 5,
      savedMessageCount: 20,
      dirtyFromIndex: 25,
    });
  });

  it('rewrites from the first dirty local index while preserving total saved count semantics', () => {
    const nextPayload = [...payload] as ChatPayload;
    nextPayload[2] = {
      ...nextPayload[2] as Record<string, unknown>,
      mes: 'updated',
    };

    const state: WindowedChatState = {
      cursor: { offset: 64, size: 256, modifiedMillis: 10 },
      hasMoreBefore: true,
      startIndex: 18,
      savedMessageCount: 20,
      dirtyFromIndex: 1,
    };

    expect(buildWindowedPayloadPatch(nextPayload, state)).toMatchObject({
      patch: {
        kind: 'rewriteFromIndex',
        startIndex: 1,
      },
      savedMessageCount: 20,
      dirtyFromIndex: 2,
    });
  });
});
