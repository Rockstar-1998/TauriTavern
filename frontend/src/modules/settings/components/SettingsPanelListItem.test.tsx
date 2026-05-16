import { fireEvent, render, screen } from '@solidjs/testing-library';
import { Settings2 } from 'lucide-solid';
import { describe, expect, it, vi } from 'vitest';

import { SettingsPanelListItem } from './SettingsPanelListItem';

describe('SettingsPanelListItem', () => {
  it('renders title and description and handles clicks', async () => {
    const handleClick = vi.fn();

    render(() => (
      <SettingsPanelListItem
        title="通用设置"
        description="管理全局设置与原始配置内容。"
        icon={Settings2}
        onClick={handleClick}
      />
    ));

    expect(screen.getByText('通用设置')).toBeTruthy();
    expect(screen.getByText('管理全局设置与原始配置内容。')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies active styling when selected', () => {
    render(() => (
      <SettingsPanelListItem
        title="通用设置"
        description="管理全局设置与原始配置内容。"
        icon={Settings2}
        active
        onClick={() => undefined}
      />
    ));

    expect(screen.getByRole('button').className).toContain('border-slate-700');
  });
});
