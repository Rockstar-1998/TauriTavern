import type { SessionBindings } from '@/types/domain';
import {
  assistantStreamSchema,
  contributionAddedSchema,
  contributionWithdrawnSchema,
  joinApprovedSchema,
  joinRejectedSchema,
  joinRequestedSchema,
  multiplayerEnvelopeSchema,
  roomErrorSchema,
  roomParticipantSchema,
  roomSnapshotSchema,
  roomStatusSchema,
} from '@/types/multiplayer';
import type {
  AssistantStreamPayload,
  ContributionAddedPayload,
  ContributionWithdrawnPayload,
  MultiplayerEnvelope,
  RoomSnapshot,
  RoomStatus,
} from '@/types/multiplayer';

import { applyRoomStatus, type MultiplayerRoomState } from './room-state';

export type MultiplayerEventEffects = {
  roomStatus?: RoomStatus;
  snapshot?: RoomSnapshot;
  contributionAdded?: ContributionAddedPayload;
  contributionWithdrawn?: ContributionWithdrawnPayload;
  bindingsUpdated?: SessionBindings;
  assistantStarted?: AssistantStreamPayload;
  assistantDelta?: AssistantStreamPayload;
  assistantDone?: AssistantStreamPayload;
  assistantAborted?: AssistantStreamPayload;
  joinRejectedMessage?: string;
  roomError?: string;
};

export function applyMultiplayerEnvelope(
  state: MultiplayerRoomState,
  rawEnvelope: unknown,
): { state: MultiplayerRoomState; envelope: MultiplayerEnvelope; effects: MultiplayerEventEffects; ignored: boolean } {
  const envelope = multiplayerEnvelopeSchema.parse(rawEnvelope);
  if (envelope.seq > 0 && envelope.seq <= state.lastSeq) {
    return { state, envelope, effects: {}, ignored: true };
  }

  const nextState: MultiplayerRoomState = {
    ...state,
    roomId: envelope.room_id || state.roomId,
    lastSeq: envelope.seq > 0 ? envelope.seq : state.lastSeq,
  };
  const effects: MultiplayerEventEffects = {};

  switch (envelope.type) {
    case 'room_status': {
      const status = roomStatusSchema.parse(envelope.payload);
      effects.roomStatus = status;
      return { state: applyRoomStatus(nextState, status), envelope, effects, ignored: false };
    }
    case 'join_requested': {
      const joinRequest = joinRequestedSchema.parse(envelope.payload);
      nextState.pendingJoinRequests = [
        ...nextState.pendingJoinRequests.filter((item) => item.request_id !== joinRequest.request_id),
        joinRequest,
      ];
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'join_approved': {
      const approved = joinApprovedSchema.parse(envelope.payload);
      nextState.localParticipantId = approved.participant_id;
      nextState.connectionState = 'joined';
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'join_rejected': {
      const rejected = joinRejectedSchema.parse(envelope.payload);
      effects.joinRejectedMessage = rejected.message;
      return {
        state: {
          ...nextState,
          connectionState: 'idle',
          participants: [],
          pendingJoinRequests: [],
          activeAssistantStreamKey: '',
          latestSnapshot: null,
        },
        envelope,
        effects,
        ignored: false,
      };
    }
    case 'room_snapshot': {
      const snapshot = roomSnapshotSchema.parse(envelope.payload);
      effects.snapshot = snapshot;
      nextState.latestSnapshot = snapshot;
      nextState.roomId = snapshot.room_id;
      nextState.participants = snapshot.participants;
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'participant_joined': {
      const participant = roomParticipantSchema.parse(envelope.payload);
      nextState.participants = [
        ...nextState.participants.filter((item) => item.participant_id !== participant.participant_id),
        participant,
      ];
      nextState.pendingJoinRequests = nextState.pendingJoinRequests.filter((item) => item.nickname !== participant.nickname);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'participant_left': {
      const participant = roomParticipantSchema.parse(envelope.payload);
      nextState.participants = nextState.participants.filter((item) => item.participant_id !== participant.participant_id);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'contribution_added': {
      effects.contributionAdded = contributionAddedSchema.parse(envelope.payload);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'contribution_withdrawn': {
      effects.contributionWithdrawn = contributionWithdrawnSchema.parse(envelope.payload);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'bindings_updated': {
      effects.bindingsUpdated = roomSnapshotSchema.shape.bindings.parse(envelope.payload);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'assistant_stream_started': {
      const payload = assistantStreamSchema.parse(envelope.payload);
      effects.assistantStarted = payload;
      nextState.activeAssistantStreamKey = payload.assistant_message_key;
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'assistant_stream_delta': {
      effects.assistantDelta = assistantStreamSchema.parse(envelope.payload);
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'assistant_stream_done': {
      const payload = assistantStreamSchema.parse(envelope.payload);
      effects.assistantDone = payload;
      if (nextState.activeAssistantStreamKey === payload.assistant_message_key) {
        nextState.activeAssistantStreamKey = '';
      }
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'assistant_stream_aborted': {
      const payload = assistantStreamSchema.parse(envelope.payload);
      effects.assistantAborted = payload;
      if (nextState.activeAssistantStreamKey === payload.assistant_message_key) {
        nextState.activeAssistantStreamKey = '';
      }
      return { state: nextState, envelope, effects, ignored: false };
    }
    case 'room_error': {
      const payload = roomErrorSchema.parse(envelope.payload);
      effects.roomError = payload.message;
      nextState.lastError = payload.message;
      return { state: nextState, envelope, effects, ignored: false };
    }
    default:
      return { state: nextState, envelope, effects, ignored: false };
  }
}
