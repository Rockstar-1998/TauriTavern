import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

import { MobileChatActionBar } from './MobileChatActionBar';

describe('MobileChatActionBar', () => {
  it('renders create, join, and import actions and forwards callbacks', async () => {
    const onCreate = vi.fn();
    const onJoinRoom = vi.fn();
    const onImport = vi.fn();

    const view = render(() => (
      <MobileChatActionBar onCreate={onCreate} onJoinRoom={onJoinRoom} onImport={onImport} />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.newChat }));
    await fireEvent.click(screen.getByRole('button', { name: locale.chats.joinRoom }));

    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    const file = new File(['{}'], 'chat.jsonl', { type: 'application/json' });
    await fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onJoinRoom).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledWith(file);
  });
});
