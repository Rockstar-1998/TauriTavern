import { describe, expect, it } from 'vitest';

import { shouldUseMobileShell } from './platform';

describe('shouldUseMobileShell', () => {
  it('treats Android phone user agents as mobile shells', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) Mobile',
        narrowScreen: false,
        coarsePointer: false,
      }),
    ).toBe(true);
  });

  it('keeps wide-screen Android tablets on the desktop shell', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet)',
        narrowScreen: false,
        coarsePointer: false,
      }),
    ).toBe(false);
  });

  it('treats coarse pointers as mobile shells', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        narrowScreen: false,
        coarsePointer: true,
      }),
    ).toBe(true);
  });

  it('treats narrow screens as mobile shells', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        narrowScreen: true,
        coarsePointer: false,
      }),
    ).toBe(true);
  });

  it('detects iPadOS desktop user agents via touch capability', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
        narrowScreen: false,
        coarsePointer: false,
      }),
    ).toBe(true);
  });

  it('keeps desktop shells for pointer-precise wide-screen desktops', () => {
    expect(
      shouldUseMobileShell({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0,
        narrowScreen: false,
        coarsePointer: false,
      }),
    ).toBe(false);
  });
});
