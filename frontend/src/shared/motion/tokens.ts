export const motionTokens = {
  duration: {
    instant: 0.001,
    micro: 0.12,
    fast: 0.18,
    base: 0.26,
    slow: 0.38,
    slower: 0.52,
  },
  delay: {
    none: 0,
    short: 0.04,
    medium: 0.08,
  },
  stagger: {
    tight: 0.035,
    base: 0.055,
    loose: 0.08,
  },
  distance: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 18,
    lg: 24,
    xl: 32,
  },
  scale: {
    press: 0.985,
    hover: 1.01,
    shellEnter: 0.985,
    modalEnter: 0.97,
    cardEnter: 0.99,
  },
  easing: {
    standard: [0.22, 1, 0.36, 1] as [number, number, number, number],
    decelerate: [0.16, 1, 0.3, 1] as [number, number, number, number],
    accelerate: [0.4, 0, 1, 1] as [number, number, number, number],
    emphasized: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  },
} as const;

export type MotionTokens = typeof motionTokens;
