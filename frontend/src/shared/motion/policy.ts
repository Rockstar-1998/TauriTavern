import { isMobileLayout } from '@/shared/utils/platform';

import { motionTokens } from './tokens';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const ANDROID_USER_AGENT_PATTERN = /Android/i;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function isAndroidEnvironment(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return ANDROID_USER_AGENT_PATTERN.test(navigator.userAgent);
}

export function motionPerformanceScale(): number {
  if (prefersReducedMotion()) {
    return 0;
  }

  if (isAndroidEnvironment() && !isMobileLayout()) {
    return 0.82;
  }

  if (isMobileLayout()) {
    return 0.72;
  }

  return 1;
}

export function motionDuration(seconds: number): number {
  const scale = motionPerformanceScale();
  return scale <= 0 ? motionTokens.duration.instant : seconds * scale;
}

export function motionDelay(seconds: number): number {
  const scale = motionPerformanceScale();
  return scale <= 0 ? 0 : seconds * Math.min(scale, 0.92);
}

export function motionStagger(seconds: number): number {
  const scale = motionPerformanceScale();
  return scale <= 0 ? 0 : seconds * Math.min(scale, 0.9);
}

export function cssMotionDuration(milliseconds: number): number {
  const scale = motionPerformanceScale();
  return scale <= 0 ? 1 : Math.max(1, Math.round(milliseconds * scale));
}
