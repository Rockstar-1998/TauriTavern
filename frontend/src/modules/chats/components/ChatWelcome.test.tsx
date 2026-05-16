import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';

import { ChatWelcome } from './ChatWelcome';

describe('ChatWelcome', () => {
  it('shows only the compact continue prompt', () => {
    render(() => <ChatWelcome greeting="早上好" />);

    expect(screen.getByText('早上好，点击会话继续')).toBeTruthy();
    expect(screen.queryByText('快速开始')).toBeNull();
    expect(screen.queryByText('最近项目')).toBeNull();
  });
});
