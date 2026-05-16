import { describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  tryEnableMica: vi.fn<() => Promise<'mica' | 'fallback'>>(),
}));

vi.mock('@/lib/native/bridge', () => ({
  nativeBridge: {
    appearance: {
      tryEnableMica: bridgeMocks.tryEnableMica,
    },
  },
}));

import { initializeWindowBackdrop } from './appearance';

describe('initializeWindowBackdrop', () => {
  it('writes mica state to the document dataset on success', async () => {
    bridgeMocks.tryEnableMica.mockResolvedValueOnce('mica');

    const result = await initializeWindowBackdrop();

    expect(result).toBe('mica');
    expect(document.documentElement.dataset.windowBackdrop).toBe('mica');
  });

  it('falls back when mica is unavailable', async () => {
    bridgeMocks.tryEnableMica.mockResolvedValueOnce('fallback');

    const result = await initializeWindowBackdrop();

    expect(result).toBe('fallback');
    expect(document.documentElement.dataset.windowBackdrop).toBe('fallback');
  });
});
