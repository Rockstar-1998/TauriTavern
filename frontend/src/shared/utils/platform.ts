import { createSignal } from 'solid-js';

export const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

const IOS_MOBILE_USER_AGENT_PATTERN = /iPhone|iPad|iPod/i;
const ANDROID_USER_AGENT_PATTERN = /Android/i;
const ANDROID_PHONE_USER_AGENT_PATTERN = /Android.+Mobile/i;
const APPLE_TABLET_DESKTOP_UA_PATTERN = /\bMacintosh\b/i;

type MobileShellOptions = {
  userAgent?: string;
  maxTouchPoints?: number;
  narrowScreen?: boolean;
  coarsePointer?: boolean;
};

export function shouldUseMobileShell(options: MobileShellOptions = {}): boolean {
  const userAgent = options.userAgent ?? '';
  const maxTouchPoints = options.maxTouchPoints ?? 0;
  const narrowScreen = options.narrowScreen ?? false;
  const coarsePointer = options.coarsePointer ?? false;
  const touchCapableAppleDesktop = APPLE_TABLET_DESKTOP_UA_PATTERN.test(userAgent) && maxTouchPoints > 1;
  const isAndroid = ANDROID_USER_AGENT_PATTERN.test(userAgent);
  const isAndroidPhone = ANDROID_PHONE_USER_AGENT_PATTERN.test(userAgent);
  const isAndroidTablet = isAndroid && !isAndroidPhone;

  if (IOS_MOBILE_USER_AGENT_PATTERN.test(userAgent) || touchCapableAppleDesktop) {
    return true;
  }

  if (isAndroidPhone) {
    return true;
  }

  if (isAndroidTablet) {
    return false;
  }

  return Boolean(narrowScreen || coarsePointer);
}

function getMediaQueryMatch(windowRef: Window, query: string): boolean {
  if (typeof windowRef.matchMedia !== 'function') {
    return false;
  }

  return windowRef.matchMedia(query).matches;
}

function computeMobileLayout(windowRef: Window): boolean {
  return shouldUseMobileShell({
    userAgent: windowRef.navigator?.userAgent,
    maxTouchPoints: windowRef.navigator?.maxTouchPoints,
    narrowScreen: getMediaQueryMatch(windowRef, MOBILE_BREAKPOINT_QUERY),
    coarsePointer: getMediaQueryMatch(windowRef, COARSE_POINTER_QUERY),
  });
}

const [isMobile, setIsMobile] = createSignal(typeof window !== 'undefined' ? computeMobileLayout(window) : false);

if (typeof window !== 'undefined') {
  const mediaQueries = [MOBILE_BREAKPOINT_QUERY, COARSE_POINTER_QUERY]
    .map((query) => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null))
    .filter((query): query is MediaQueryList => query !== null);
  const updateMobileLayout = () => setIsMobile(computeMobileLayout(window));

  mediaQueries.forEach((query) => {
    if (query.addEventListener) {
      query.addEventListener('change', updateMobileLayout);
      return;
    }

    query.addListener(updateMobileLayout);
  });

  window.addEventListener('orientationchange', updateMobileLayout);
}

export function isMobileLayout(): boolean {
  return isMobile();
}
