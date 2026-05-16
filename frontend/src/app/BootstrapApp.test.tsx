import { render, screen, waitFor } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STARTUP_UI_READY_EVENT } from './startup-dom';

const startupMocks = vi.hoisted(() => {
  let readyHandler: (() => void) | null = null;
  let errorHandler: ((message: string) => void) | null = null;

  return {
    getStartupStatus: vi.fn(),
    listenReady: vi.fn(async (handler: () => void) => {
      readyHandler = handler;
      return () => {
        readyHandler = null;
      };
    }),
    listenError: vi.fn(async (handler: (message: string) => void) => {
      errorHandler = handler;
      return () => {
        errorHandler = null;
      };
    }),
    triggerReady() {
      readyHandler?.();
    },
    triggerError(message: string) {
      errorHandler?.(message);
    },
  };
});

vi.mock('@/lib/native/bridge', () => ({
  nativeBridge: {
    app: {
      getStartupStatus: startupMocks.getStartupStatus,
      listenReady: startupMocks.listenReady,
      listenError: startupMocks.listenError,
    },
  },
}));

vi.mock('./App', () => ({
  default: () => <div>App Ready</div>,
}));

import BootstrapApp from './BootstrapApp';

describe('BootstrapApp', () => {
  beforeEach(() => {
    startupMocks.getStartupStatus.mockReset();
    startupMocks.listenReady.mockClear();
    startupMocks.listenError.mockClear();
    delete (window as Window & { __TAURITAVERN_STARTUP_UI_READY__?: boolean }).__TAURITAVERN_STARTUP_UI_READY__;
  });

  it('dispatches startup handoff, keeps the startup overlay until backend ready, then transitions out', async () => {
    const handoffSpy = vi.fn();
    window.addEventListener(STARTUP_UI_READY_EVENT, handoffSpy, { once: true });

    startupMocks.getStartupStatus.mockResolvedValueOnce({ ready: false, error: null });
    startupMocks.getStartupStatus.mockResolvedValueOnce({ ready: false, error: null });

    render(() => <BootstrapApp />);

    await waitFor(() => expect(handoffSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByText('TauriTavern')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('App Ready')).toBeTruthy());
    expect(screen.getByText('TauriTavern')).toBeTruthy();

    startupMocks.triggerReady();

    await waitFor(() => expect(screen.queryByText('TauriTavern')).toBeNull(), { timeout: 1000 });
  });

  it('shows startup errors instead of the empty shell', async () => {
    startupMocks.getStartupStatus.mockResolvedValueOnce({ ready: false, error: 'Startup failed' });

    render(() => <BootstrapApp />);

    await waitFor(() => expect(screen.getByText('Startup failed')).toBeTruthy());
  });
});
