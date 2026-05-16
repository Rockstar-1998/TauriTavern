import { beforeEach, describe, expect, it } from 'vitest';

import {
  APP_ROOT_ID,
  BOOT_SPLASH_ID,
  assertStartupDomIntegrity,
  dispatchStartupUiReady,
  getStartupDom,
  removeBootSplash,
  waitForStartupUiReady,
} from './startup-dom';

describe('startup-dom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as Window & { __TAURITAVERN_STARTUP_UI_READY__?: boolean }).__TAURITAVERN_STARTUP_UI_READY__;
  });

  it('returns the application root and boot splash when they exist', () => {
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div><div id="${APP_ROOT_ID}"></div>`;

    const dom = getStartupDom();

    expect(dom.root.id).toBe(APP_ROOT_ID);
    expect(dom.bootSplash?.id).toBe(BOOT_SPLASH_ID);
  });

  it('throws when the application root is missing', () => {
    expect(() => getStartupDom()).toThrow(`Missing app root element: #${APP_ROOT_ID}`);
  });

  it('rejects invalid nesting when boot splash contains the root', () => {
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"><div id="${APP_ROOT_ID}"></div></div>`;

    const { root, bootSplash } = getStartupDom();

    expect(() => assertStartupDomIntegrity(root, bootSplash)).toThrow(`Invalid startup DOM: #${BOOT_SPLASH_ID} must not contain #${APP_ROOT_ID}.`);
  });

  it('removes the boot splash when present and keeps the root attached', () => {
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div><div id="${APP_ROOT_ID}"></div>`;

    removeBootSplash();

    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull();
    expect(document.getElementById(APP_ROOT_ID)).toBeTruthy();
  });

  it('waits for and dispatches the startup handoff event', async () => {
    const pending = waitForStartupUiReady();

    dispatchStartupUiReady();

    await expect(pending).resolves.toBeUndefined();
    await expect(waitForStartupUiReady()).resolves.toBeUndefined();
  });
});