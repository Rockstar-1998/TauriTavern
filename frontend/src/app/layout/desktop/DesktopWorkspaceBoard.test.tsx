import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';

import { DesktopWorkspaceBoard } from './DesktopWorkspaceBoard';

describe('DesktopWorkspaceBoard', () => {
  it('hides the leading menu without leaving a header row', () => {
    const view = render(() => (
      <DesktopWorkspaceBoard scrollMode="contained" showLeadingMenu={false}>
        <div>Workspace</div>
      </DesktopWorkspaceBoard>
    ));

    expect(view.container.querySelector('.mb-4')).toBeNull();
    expect(view.container.querySelector('svg')).toBeNull();
    expect(screen.getByText('Workspace')).toBeTruthy();
  });
});