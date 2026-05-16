import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/motion/runtime', () => ({
  useMotionMount: () => undefined,
  usePressMotion: () => undefined,
}));

vi.mock('@/shared/utils/platform', () => ({
  isMobileLayout: () => false,
}));

import { RoomPanelModal } from './RoomPanelModal';

describe('RoomPanelModal', () => {
  it('shows participant capacity and synced role card labels', () => {
    render(() => (
      <RoomPanelModal
        open
        status={{
          state: 'hosting',
          room_id: 'room-1',
          address: '192.168.1.10:4000',
          port: 4000,
          participant_id: 'host-1',
          nickname: '房主',
          is_host: true,
        }}
        roomSummary="房间已启动"
        participants={[
          {
            participant_id: 'host-1',
            nickname: '房主',
            is_host: true,
            connected_at: 1,
            character_name: 'Alice',
            character_avatar: 'alice.png',
            character_card: {},
          },
          {
            participant_id: 'player-2',
            nickname: '访客',
            is_host: false,
            connected_at: 2,
            character_name: 'Bob',
            character_avatar: 'bob.png',
            character_card: {},
          },
        ]}
        pendingJoinRequests={[]}
        onClose={() => undefined}
      />
    ));

    expect(screen.getByText('人数：2 / 4')).toBeTruthy();
    expect(screen.getByText('角色卡：Alice')).toBeTruthy();
    expect(screen.getByText('角色卡：Bob')).toBeTruthy();
    expect(screen.getAllByText('房主').length).toBeGreaterThan(0);
  });
});
