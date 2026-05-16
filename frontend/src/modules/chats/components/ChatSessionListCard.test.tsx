import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/motion/runtime', () => ({
  useMotionMount: () => undefined,
  usePressMotion: () => undefined,
}));

import { ChatSessionListCard } from './ChatSessionListCard';

describe('ChatSessionListCard', () => {
  it('shows the multiplayer session mode tag', () => {
    render(() => (
      <ChatSessionListCard
        session={{
          source_type: 'character',
          scope_id: 'alice',
          scope_name: 'Alice',
          file_name: '多人房间.jsonl',
          preview_message: '联机摘要',
          last_mes: 1712400000000,
          message_count: 6,
          session_mode: 'multiplayer',
          avatar: 'alice.png',
          group_id: '',
        }}
        onOpen={() => undefined}
        onOpenContextMenu={() => undefined}
      />
    ));

    expect(screen.getByText('联机会话')).toBeTruthy();
    expect(screen.getByText('角色来源')).toBeTruthy();
  });

  it('shows the single session mode tag', () => {
    render(() => (
      <ChatSessionListCard
        session={{
          source_type: 'group',
          scope_id: 'group-1',
          scope_name: '冒险团',
          file_name: '单人记录.jsonl',
          preview_message: '单人摘要',
          last_mes: 1712400000000,
          message_count: 3,
          session_mode: 'single',
          avatar: '',
          group_id: 'group-1',
        }}
        onOpen={() => undefined}
        onOpenContextMenu={() => undefined}
      />
    ));

    expect(screen.getByText('单人会话')).toBeTruthy();
    expect(screen.getByText('群组来源')).toBeTruthy();
  });
});
