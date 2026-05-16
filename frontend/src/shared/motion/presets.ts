import { motionTokens } from './tokens';

export type MotionKeyframes = Record<string, string | number | Array<string | number>>;
export type MotionOptions = {
  duration?: number;
  delay?: number;
  ease?: string | number[];
  [key: string]: unknown;
};

export type MotionPresetDefinition = {
  enter: {
    keyframes: MotionKeyframes;
    options?: MotionOptions;
  };
  exit?: {
    keyframes: MotionKeyframes;
    options?: MotionOptions;
  };
};

export const motionPresets: Record<string, MotionPresetDefinition> = {
  page: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.md, 0],
        scale: [motionTokens.scale.shellEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.standard,
      },
    },
  },
  shell: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.lg, 0],
        scale: [motionTokens.scale.shellEnter, 1],
      },
      options: {
        duration: motionTokens.duration.slow,
        ease: motionTokens.easing.standard,
      },
    },
  },
  rail: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        x: [-motionTokens.distance.sm, 0],
        scale: [motionTokens.scale.cardEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.decelerate,
      },
    },
  },
  panel: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.sm, 0],
        scale: [motionTokens.scale.cardEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.standard,
      },
    },
  },
  card: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.md, 0],
        scale: [motionTokens.scale.cardEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.standard,
      },
    },
  },
  modalOverlay: {
    enter: {
      keyframes: { opacity: [0, 1] },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.standard,
      },
    },
    exit: {
      keyframes: { opacity: [1, 0] },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.accelerate,
      },
    },
  },
  modalSurface: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.lg, 0],
        scale: [motionTokens.scale.modalEnter, 1],
      },
      options: {
        duration: motionTokens.duration.slow,
        ease: motionTokens.easing.standard,
      },
    },
    exit: {
      keyframes: {
        opacity: [1, 0],
        y: [0, motionTokens.distance.sm],
        scale: [1, motionTokens.scale.cardEnter],
      },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.accelerate,
      },
    },
  },
  menu: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.xs, 0],
        scale: [motionTokens.scale.modalEnter, 1],
      },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.decelerate,
      },
    },
    exit: {
      keyframes: {
        opacity: [1, 0],
        y: [0, -motionTokens.distance.xs],
        scale: [1, motionTokens.scale.cardEnter],
      },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.accelerate,
      },
    },
  },
  messageCard: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.lg, 0],
        scale: [motionTokens.scale.cardEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.standard,
      },
    },
  },
  floatingButton: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.sm, 0],
        scale: [motionTokens.scale.modalEnter, 1],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.decelerate,
      },
    },
  },
  mobileNav: {
    enter: {
      keyframes: {
        opacity: [0, 1],
        y: [motionTokens.distance.sm, 0],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.decelerate,
      },
    },
  },
  startupOverlay: {
    enter: {
      keyframes: {
        opacity: [0, 1],
      },
      options: {
        duration: motionTokens.duration.fast,
        ease: motionTokens.easing.standard,
      },
    },
    exit: {
      keyframes: {
        opacity: [1, 0],
        scale: [1, 0.985],
        y: [0, -motionTokens.distance.xs],
      },
      options: {
        duration: motionTokens.duration.base,
        ease: motionTokens.easing.accelerate,
      },
    },
  },
};

export type MotionPresetName = keyof typeof motionPresets;
