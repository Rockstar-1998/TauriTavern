import { Show, createSignal, onCleanup, onMount, type JSX } from 'solid-js';

import { animatePreset } from '@/shared/motion/runtime';
import { nativeBridge } from '@/lib/native/bridge';
import { locale } from '@/shared/i18n';

import App from './App';
import { dispatchStartupUiReady } from './startup-dom';

type StartupPhase = 'loading' | 'transitioning' | 'ready' | 'error';

const STARTUP_POLL_INTERVAL_MS = 250;
const STARTUP_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MESSAGE = locale.errors.startupTimeout;
const STARTUP_TRANSITION_MS = 240;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getStartupTransitionDuration(): number {
  return prefersReducedMotion() ? 1 : STARTUP_TRANSITION_MS;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error || locale.errors.startupUnknown);
}

async function waitForStartupReady(): Promise<void> {
  const status = await nativeBridge.app.getStartupStatus();
  if (status.ready) {
    return;
  }

  if (status.error) {
    throw new Error(status.error);
  }

  await new Promise<void>(async (resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    let pollId: number | undefined;
    let unlistenReady: () => void = () => undefined;
    let unlistenError: () => void = () => undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      if (pollId !== undefined) {
        window.clearInterval(pollId);
      }

      unlistenReady();
      unlistenError();
    };

    const resolveOnce = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    const rejectOnce = (message: string) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const checkStatus = async () => {
      try {
        const latestStatus = await nativeBridge.app.getStartupStatus();
        if (latestStatus.ready) {
          resolveOnce();
          return;
        }

        if (latestStatus.error) {
          rejectOnce(latestStatus.error);
        }
      } catch (error) {
        rejectOnce(getErrorMessage(error));
      }
    };

    try {
      unlistenReady = await nativeBridge.app.listenReady(() => resolveOnce());
      unlistenError = await nativeBridge.app.listenError((message) => rejectOnce(message));
    } catch (error) {
      rejectOnce(getErrorMessage(error));
      return;
    }

    timeoutId = window.setTimeout(() => {
      rejectOnce(STARTUP_TIMEOUT_MESSAGE);
    }, STARTUP_TIMEOUT_MS);

    pollId = window.setInterval(() => {
      void checkStatus();
    }, STARTUP_POLL_INTERVAL_MS);

    await checkStatus();
  });
}

function StartupScreen(props: { error?: string | null }): JSX.Element {
  return (
    <div class="tt-startup-screen">
      <div class="tt-startup-card">
        <div class="tt-startup-brand">{locale.shell.productName}</div>
        <div class="tt-startup-subtitle">{props.error ? props.error : locale.common.loading}</div>
        <Show when={!props.error} fallback={(
          <button type="button" class="tt-startup-action" onClick={() => window.location.reload()}>
            {locale.common.refresh}
          </button>
        )}>
          <div class="tt-startup-indicator" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </Show>
      </div>
    </div>
  );
}

export default function BootstrapApp(): JSX.Element {
  const [phase, setPhase] = createSignal<StartupPhase>('loading');
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [backendReady, setBackendReady] = createSignal(false);
  const [shellVisible, setShellVisible] = createSignal(false);
  let shellRef: HTMLDivElement | undefined;
  let overlayRef: HTMLDivElement | undefined;
  let transitionTimerId: number | null = null;
  let transitionFrameId: number | null = null;

  const clearTransitionHandles = () => {
    if (transitionTimerId !== null) {
      window.clearTimeout(transitionTimerId);
      transitionTimerId = null;
    }

    if (transitionFrameId !== null) {
      window.cancelAnimationFrame(transitionFrameId);
      transitionFrameId = null;
    }
  };

  const beginReadyTransition = () => {
    clearTransitionHandles();
    setBackendReady(true);
    setShellVisible(false);
    setPhase('transitioning');

    transitionFrameId = window.requestAnimationFrame(() => {
      transitionFrameId = null;
      setShellVisible(true);
      queueMicrotask(() => {
        void animatePreset(shellRef, 'shell');
        void animatePreset(overlayRef, 'startupOverlay', 'exit');
      });
    });

    transitionTimerId = window.setTimeout(() => {
      transitionTimerId = null;
      setPhase('ready');
    }, getStartupTransitionDuration());
  };

  onMount(() => {
    let active = true;

    dispatchStartupUiReady();

    void (async () => {
      try {
        await waitForStartupReady();

        if (!active) {
          return;
        }

        beginReadyTransition();
      } catch (error) {
        console.error('应用启动失败：', error);

        if (!active) {
          return;
        }

        clearTransitionHandles();
        setShellVisible(false);
        setErrorMessage(getErrorMessage(error));
        setPhase('error');
      }
    })();

    onCleanup(() => {
      active = false;
      clearTransitionHandles();
    });
  });

  const showStartupOverlay = () => phase() !== 'ready';
  const startupOverlayClass = () => `tt-startup-overlay ${phase() === 'transitioning' ? 'tt-startup-overlay--exit' : ''}`.trim();
  const appShellClass = () => `tt-app-enter-shell ${(shellVisible() || backendReady() || phase() === 'ready') ? 'tt-app-enter-shell--visible' : ''}`.trim();

  return (
    <div class="tt-startup-stage">
      <div ref={shellRef} class={appShellClass()}>
        <App />
      </div>
      <Show when={showStartupOverlay()}>
        <div ref={overlayRef} class={startupOverlayClass()}>
          <StartupScreen error={phase() === 'error' ? errorMessage() : null} />
        </div>
      </Show>
    </div>
  );
}
