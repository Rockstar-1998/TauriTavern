import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({
  setEffects: vi.fn(),
  invoke: vi.fn(),
  convertFileSrc: vi.fn((value: string) => value),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  Effect: { Mica: 'mica' },
  getCurrentWindow: () => ({
    setEffects: tauriMocks.setEffects,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
  convertFileSrc: tauriMocks.convertFileSrc,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriMocks.listen,
}));

import { nativeBridge } from './bridge';

type TestTauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

describe('nativeBridge.appearance.tryEnableMica', () => {
  beforeEach(() => {
    tauriMocks.setEffects.mockReset();
    tauriMocks.invoke.mockReset();
    tauriMocks.listen.mockReset();
    delete (window as TestTauriWindow).__TAURI__;
    delete (window as TestTauriWindow).__TAURI_INTERNALS__;
  });

  it('returns fallback outside Tauri runtime', async () => {
    await expect(nativeBridge.appearance.tryEnableMica()).resolves.toBe('fallback');
    expect(tauriMocks.setEffects).not.toHaveBeenCalled();
  });

  it('returns mica when the window effect call succeeds', async () => {
    (window as TestTauriWindow).__TAURI__ = {};
    tauriMocks.setEffects.mockResolvedValueOnce(undefined);

    await expect(nativeBridge.appearance.tryEnableMica()).resolves.toBe('mica');
    expect(tauriMocks.setEffects).toHaveBeenCalledWith({ effects: ['mica'] });
  });

  it('returns fallback when the window effect call fails', async () => {
    (window as TestTauriWindow).__TAURI__ = {};
    tauriMocks.setEffects.mockRejectedValueOnce(new Error('unsupported'));

    await expect(nativeBridge.appearance.tryEnableMica()).resolves.toBe('fallback');
  });

  it('reports startup status outside Tauri as ready', async () => {
    await expect(nativeBridge.app.getStartupStatus()).resolves.toEqual({ ready: true, error: null });
    await expect(nativeBridge.app.isReady()).resolves.toBe(true);
  });

  it('queries startup readiness through Tauri bridge', async () => {
    (window as TestTauriWindow).__TAURI__ = {};
    tauriMocks.invoke.mockResolvedValueOnce({ ready: false, error: null });
    tauriMocks.invoke.mockResolvedValueOnce(true);

    await expect(nativeBridge.app.getStartupStatus()).resolves.toEqual({ ready: false, error: null });
    await expect(nativeBridge.app.isReady()).resolves.toBe(true);
    expect(tauriMocks.invoke).toHaveBeenNthCalledWith(1, 'get_startup_status', undefined);
    expect(tauriMocks.invoke).toHaveBeenNthCalledWith(2, 'is_ready', undefined);
  });
});
