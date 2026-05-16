import { render } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

const platformState = vi.hoisted(() => ({
  mobile: false,
}));

vi.mock('@/shared/utils/platform', () => ({
  isMobileLayout: () => platformState.mobile,
}));

vi.mock('@/shared/motion/runtime', () => ({
  useMotionMount: () => undefined,
  usePressMotion: () => undefined,
}));

import { WorkbenchModal } from './WorkbenchModal';

describe('WorkbenchModal', () => {
  it('uses fullscreen mobile sheet layout on mobile', () => {
    platformState.mobile = true;
    const view = render(() => (
      <WorkbenchModal open title="联机房间" onClose={() => undefined}>
        <div>content</div>
      </WorkbenchModal>
    ));

    const overlay = view.container.querySelector('.tt-modal-overlay');
    const surface = view.container.querySelector('.tt-modal-surface');
    expect(overlay?.className).toContain('p-0');
    expect(surface?.className).toContain('rounded-none');
    expect(surface?.className).toContain('h-[100dvh]');
  });

  it('keeps centered dialog layout on desktop', () => {
    platformState.mobile = false;
    const view = render(() => (
      <WorkbenchModal open title="联机房间" onClose={() => undefined}>
        <div>content</div>
      </WorkbenchModal>
    ));

    const overlay = view.container.querySelector('.tt-modal-overlay');
    const surface = view.container.querySelector('.tt-modal-surface');
    expect(overlay?.className).toContain('p-6');
    expect(surface?.className).toContain('rounded-[2rem]');
    expect(surface?.className).toContain('max-h-[88vh]');
  });
});
