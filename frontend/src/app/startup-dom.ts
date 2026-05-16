export const APP_ROOT_ID = 'root';
export const BOOT_SPLASH_ID = 'boot-splash';
export const STARTUP_UI_READY_EVENT = 'tauritavern:startup-ui-ready';

type StartupWindow = Window & {
  __TAURITAVERN_STARTUP_UI_READY__?: boolean;
};

function getStartupWindow(): StartupWindow {
  return window as StartupWindow;
}

export function getStartupDom(): {
  root: HTMLElement;
  bootSplash: HTMLElement | null;
} {
  const root = document.getElementById(APP_ROOT_ID);
  if (!(root instanceof HTMLElement)) {
    throw new Error(`Missing app root element: #${APP_ROOT_ID}`);
  }

  const bootSplash = document.getElementById(BOOT_SPLASH_ID);
  return {
    root,
    bootSplash: bootSplash instanceof HTMLElement ? bootSplash : null,
  };
}

export function assertStartupDomIntegrity(root: HTMLElement, bootSplash: HTMLElement | null): void {
  if (bootSplash?.contains(root)) {
    throw new Error(`Invalid startup DOM: #${BOOT_SPLASH_ID} must not contain #${APP_ROOT_ID}.`);
  }
}

export function removeBootSplash(): void {
  const { root, bootSplash } = getStartupDom();
  assertStartupDomIntegrity(root, bootSplash);
  bootSplash?.remove();

  if (!document.body.contains(root)) {
    throw new Error(`Removing #${BOOT_SPLASH_ID} detached #${APP_ROOT_ID}.`);
  }
}

export function dispatchStartupUiReady(): void {
  const startupWindow = getStartupWindow();
  if (startupWindow.__TAURITAVERN_STARTUP_UI_READY__) {
    return;
  }

  startupWindow.__TAURITAVERN_STARTUP_UI_READY__ = true;
  startupWindow.dispatchEvent(new Event(STARTUP_UI_READY_EVENT));
}

export function waitForStartupUiReady(): Promise<void> {
  const startupWindow = getStartupWindow();
  if (startupWindow.__TAURITAVERN_STARTUP_UI_READY__) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleReady = () => {
      startupWindow.removeEventListener(STARTUP_UI_READY_EVENT, handleReady as EventListener);
      resolve();
    };

    startupWindow.addEventListener(STARTUP_UI_READY_EVENT, handleReady as EventListener, { once: true });
  });
}