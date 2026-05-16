import { render } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./desktop/DesktopWorkbenchShell', () => ({
  DesktopWorkbenchShell: (props: { children: JSX.Element }) => <div class="tt-desktop-rail">{props.children}</div>,
}));

import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('renders the desktop workbench shell', () => {
    const view = render(() => (
      <AppShell>
        <div>content</div>
      </AppShell>
    ));

    expect(view.container.querySelector('.tt-desktop-rail')).toBeTruthy();
    expect(view.container.textContent).toContain('content');
  });
});
