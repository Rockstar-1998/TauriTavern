import { onCleanup, onMount } from 'solid-js';
import { animate } from 'motion';

import { motionDelay, motionDuration, motionStagger, prefersReducedMotion } from './policy';
import { motionPresets, type MotionKeyframes, type MotionOptions, type MotionPresetName } from './presets';
import { motionTokens } from './tokens';

type MotionTarget = HTMLElement | SVGElement;

type MotionControls = {
  finished: Promise<void>;
  stop: () => void;
};

function noopControls(): MotionControls {
  return {
    finished: Promise.resolve(),
    stop: () => undefined,
  };
}

function isMotionTarget(value: unknown): value is MotionTarget {
  if (!value || typeof window === 'undefined' || typeof Element === 'undefined') {
    return false;
  }

  if (value instanceof HTMLElement) {
    return true;
  }

  return typeof SVGElement !== 'undefined' && value instanceof SVGElement;
}

function normalizeMotionOptions(options: MotionOptions | undefined): MotionOptions {
  return {
    ...options,
    duration: motionDuration(Number(options?.duration ?? motionTokens.duration.base)),
    delay: motionDelay(Number(options?.delay ?? motionTokens.delay.none)),
  };
}

export function animateMotionTarget(
  target: MotionTarget | null | undefined,
  keyframes: MotionKeyframes,
  options?: MotionOptions,
): MotionControls {
  if (!isMotionTarget(target) || prefersReducedMotion()) {
    return noopControls();
  }

  try {
    const controls = animate(target, keyframes as never, normalizeMotionOptions(options) as never) as {
      finished?: Promise<unknown>;
      stop?: () => void;
    };

    return {
      finished: Promise.resolve(controls.finished).then(() => undefined),
      stop: () => {
        controls.stop?.();
      },
    };
  } catch {
    return noopControls();
  }
}

export function animatePreset(
  target: MotionTarget | null | undefined,
  preset: MotionPresetName,
  phase: 'enter' | 'exit' = 'enter',
  overrides?: MotionOptions,
): MotionControls {
  const presetDefinition = motionPresets[preset];
  const definition = phase === 'enter'
    ? presetDefinition.enter
    : presetDefinition.exit;
  if (!definition) {
    return noopControls();
  }

  return animateMotionTarget(target, definition.keyframes, {
    ...(definition.options ?? {}),
    ...(overrides ?? {}),
  });
}

export function animateStaggeredChildren(
  container: MotionTarget | null | undefined,
  selector: string,
  preset: MotionPresetName,
  options?: {
    initialDelay?: number;
    step?: number;
  },
): MotionControls[] {
  if (!isMotionTarget(container) || prefersReducedMotion()) {
    return [];
  }

  const initialDelay = Number(options?.initialDelay ?? motionTokens.delay.none);
  const step = Number(options?.step ?? motionTokens.stagger.base);
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));

  return nodes.map((node, index) => animatePreset(node, preset, 'enter', {
    delay: initialDelay + index * motionStagger(step),
  }));
}

export function bindPressAnimation(
  target: MotionTarget | null | undefined,
  scale: number = motionTokens.scale.press,
): () => void {
  if (!isMotionTarget(target) || prefersReducedMotion()) {
    return () => undefined;
  }

  const press = () => {
    void animateMotionTarget(target, { scale }, {
      duration: motionTokens.duration.micro,
      ease: motionTokens.easing.decelerate,
    });
  };

  const release = () => {
    void animateMotionTarget(target, { scale: 1 }, {
      duration: motionTokens.duration.fast,
      ease: motionTokens.easing.standard,
    });
  };

  target.addEventListener('pointerdown', press);
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerleave', release);
  target.addEventListener('blur', release);

  return () => {
    target.removeEventListener('pointerdown', press);
    target.removeEventListener('pointerup', release);
    target.removeEventListener('pointercancel', release);
    target.removeEventListener('pointerleave', release);
    target.removeEventListener('blur', release);
  };
}

export function useMotionMount(
  target: () => MotionTarget | null | undefined,
  preset: MotionPresetName,
  overrides?: MotionOptions,
): void {
  onMount(() => {
    queueMicrotask(() => {
      void animatePreset(target(), preset, 'enter', overrides);
    });
  });
}

export function useStaggeredMotionMount(
  container: () => MotionTarget | null | undefined,
  selector: string,
  preset: MotionPresetName,
  options?: {
    initialDelay?: number;
    step?: number;
  },
): void {
  onMount(() => {
    queueMicrotask(() => {
      animateStaggeredChildren(container(), selector, preset, options);
    });
  });
}

export function usePressMotion(
  target: () => MotionTarget | null | undefined,
  scale?: number,
): void {
  onMount(() => {
    const cleanup = bindPressAnimation(target(), scale);
    onCleanup(cleanup);
  });
}
