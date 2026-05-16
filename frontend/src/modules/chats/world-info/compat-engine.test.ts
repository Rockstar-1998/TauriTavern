import { describe, expect, it } from 'vitest';

import { createUserChatMessage } from '@/lib/api/core-client';

import { activateWorldInfoEntries } from './compat-engine';

describe('world info compat engine', () => {
  it('does not treat "false" strings as true for constant entries', () => {
    const result = activateWorldInfoEntries({
      books: [
        {
          name: 'Test',
          data: {
            entries: {
              '1': {
                content: 'Hidden info',
                key: ['keyword'],
                constant: 'false',
              },
            },
          },
        },
      ],
      messages: [createUserChatMessage('You', 'hello')],
      maxRecursionSteps: 0,
    });

    expect(result.contextBlock).toBe('');
  });

  it('requires keyword matches even for constant entries', () => {
    const result = activateWorldInfoEntries({
      books: [
        {
          name: 'Test',
          data: {
            entries: {
              '1': {
                content: 'Always on',
                constant: 'true',
                key: ['keyword'],
              },
            },
          },
        },
      ],
      messages: [createUserChatMessage('You', 'hello')],
      maxRecursionSteps: 0,
    });

    expect(result.contextBlock).toBe('');
  });

  it('activates constant entries when keyword matches', () => {
    const result = activateWorldInfoEntries({
      books: [
        {
          name: 'Test',
          data: {
            entries: {
              '1': {
                content: 'Always on',
                constant: 'true',
                key: ['keyword'],
              },
            },
          },
        },
      ],
      messages: [createUserChatMessage('You', 'the keyword appears')],
      maxRecursionSteps: 0,
    });

    expect(result.contextBlock).toContain('Always on');
  });
});
