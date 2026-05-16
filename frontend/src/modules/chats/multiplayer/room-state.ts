import type { JoinRequestedPayload, MultiplayerState, RoomParticipant, RoomSnapshot, RoomStatus } from '@/types/multiplayer';

export type MultiplayerRoomState = {
  connectionState: MultiplayerState;
  roomId: string;
  address: string;
  localParticipantId: string;
  nickname: string;
  isHost: boolean;
  participants: RoomParticipant[];
  pendingJoinRequests: JoinRequestedPayload[];
  lastSeq: number;
  activeAssistantStreamKey: string;
  latestSnapshot: RoomSnapshot | null;
  lastError: string;
};

export function createDefaultRoomState(): MultiplayerRoomState {
  return {
    connectionState: 'idle',
    roomId: '',
    address: '',
    localParticipantId: '',
    nickname: '',
    isHost: false,
    participants: [],
    pendingJoinRequests: [],
    lastSeq: 0,
    activeAssistantStreamKey: '',
    latestSnapshot: null,
    lastError: '',
  };
}

export function applyRoomStatus(
  state: MultiplayerRoomState,
  status: RoomStatus,
): MultiplayerRoomState {
  if (status.state === 'idle') {
    return {
      ...state,
      connectionState: 'idle',
      roomId: '',
      address: '',
      localParticipantId: '',
      nickname: '',
      isHost: false,
      participants: [],
      pendingJoinRequests: [],
      activeAssistantStreamKey: '',
      latestSnapshot: null,
    };
  }

  return {
    ...state,
    connectionState: status.state,
    roomId: status.room_id ?? state.roomId,
    address: status.address ?? state.address,
    localParticipantId: status.participant_id ?? state.localParticipantId,
    nickname: status.nickname ?? state.nickname,
    isHost: status.is_host,
  };
}
