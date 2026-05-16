import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@solidjs/router', () => ({
  A: (props: any) => <a {...props}>{props.children}</a>,
  useLocation: () => ({ pathname: '/chats' }),
}));

import { DesktopIconRail } from './DesktopIconRail';

describe('DesktopIconRail', () => {
  it('renders presets as a top-level module and removes assets from the rail', () => {
    const view = render(() => <DesktopIconRail />);

    expect(view.container.textContent).not.toContain('TauriTavern');
    expect(view.container.textContent).not.toContain('v1.4.2');
    expect(screen.getByLabelText(/^对话$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^角色$/i)).toBeTruthy();
    expect(screen.getByLabelText(/预设/i)).toBeTruthy();
    expect(screen.queryByLabelText(/资源/i)).toBeNull();
  });
});
