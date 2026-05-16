import { render, screen } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  pathname: '/presets',
}));

vi.mock('@solidjs/router', () => ({
  useLocation: () => ({ pathname: routerMocks.pathname }),
  A: (props: { href: string; class?: string; children: JSX.Element }) => (
    <a href={props.href} class={props.class}>
      {props.children}
    </a>
  ),
}));

import { MobileAppShell } from './MobileAppShell';

describe('MobileAppShell', () => {
  it('exposes presets in the mobile bottom navigation', () => {
    render(() => (
      <MobileAppShell>
        <div>content</div>
      </MobileAppShell>
    ));

    const presetsLink = screen.getByRole('link', { name: new RegExp(locale.settings.groups.presets, 'i') });
    expect(presetsLink.getAttribute('href')).toBe('/presets');
    expect(screen.getByText('content')).toBeTruthy();
  });
});
