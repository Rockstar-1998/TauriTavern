import { z } from 'zod';

import { chatPayloadSchema, sessionBindingsSchema } from '@/types/domain';

export const multiplayerEventTypeValues = [
  'room_status',
  'join_requested',
  'join_approved',
  'join_rejected',
  'room_snapshot',
  'participant_joined',
  'participant_left',
  'contribution_added',
  'contribution_withdrawn',
  'bindings_updated',
  'assistant_stream_started',
  'assistant_stream_delta',
  'assistant_stream_done',
  'assistant_stream_aborted',
  'room_error',
] as const;

export const multiplayerStateValues = ['idle', 'hosting', 'joining', 'joined'] as const;

export const multiplayerEventTypeSchema = z.enum(multiplayerEventTypeValues);
export const multiplayerStateSchema = z.enum(multiplayerStateValues);

export const roomParticipantSchema = z.object({
  participant_id: z.string().default(''),
  nickname: z.string().default(''),
  is_host: z.boolean().optional().default(false),
  connected_at: z.number().optional().default(0),
  character_name: z.string().optional().default(''),
  character_avatar: z.string().optional().default(''),
  character_card: z.unknown().optional().default({}),
}).passthrough();

export const multiplayerEnvelopeSchema = z.object({
  type: multiplayerEventTypeSchema,
  room_id: z.string().default(''),
  seq: z.number().optional().default(0),
  payload: z.unknown().optional().default({}),
  sent_at: z.number().optional().default(0),
}).passthrough();

export const roomStatusSchema = z.object({
  state: multiplayerStateSchema.default('idle'),
  room_id: z.string().nullable().optional().default(null),
  address: z.string().nullable().optional().default(null),
  port: z.number().nullable().optional().default(null),
  participant_id: z.string().nullable().optional().default(null),
  nickname: z.string().nullable().optional().default(null),
  is_host: z.boolean().optional().default(false),
}).passthrough();

export const joinRequestedSchema = z.object({
  request_id: z.string().default(''),
  nickname: z.string().default(''),
  character_name: z.string().optional().default(''),
  character_avatar: z.string().optional().default(''),
  requested_at: z.number().optional().default(0),
}).passthrough();

export const joinApprovedSchema = z.object({
  participant_id: z.string().default(''),
  nickname: z.string().default(''),
}).passthrough();

export const joinRejectedSchema = z.object({
  message: z.string().default(''),
}).passthrough();

export const contributionAddedSchema = z.object({
  contribution_id: z.string().default(''),
  room_round_id: z.string().default(''),
  participant_id: z.string().default(''),
  nickname: z.string().default(''),
  content: z.string().default(''),
  pending: z.boolean().optional().default(true),
  sent_at: z.number().optional().default(0),
}).passthrough();

export const contributionWithdrawnSchema = z.object({
  contribution_id: z.string().default(''),
  participant_id: z.string().default(''),
  withdrawn_at: z.number().optional().default(0),
}).passthrough();

export const assistantStreamSchema = z.object({
  assistant_message_key: z.string().default(''),
  delta: z.string().optional().default(''),
  reasoning: z.string().optional().default(''),
}).passthrough();

export const roomSnapshotSchema = z.object({
  room_id: z.string().default(''),
  session_key: z.string().default(''),
  session_file: z.string().default(''),
  scope_id: z.string().default(''),
  scope_name: z.string().default(''),
  bindings: sessionBindingsSchema.optional().default({}),
  participants: z.array(roomParticipantSchema).optional().default([]),
  payload: chatPayloadSchema.optional().default([]),
}).passthrough();

export const roomErrorSchema = z.object({
  message: z.string().default(''),
}).passthrough();

export const startHostDtoSchema = z.object({
  room_id: z.string().default(''),
  session_key: z.string().default(''),
  scope_id: z.string().default(''),
  scope_name: z.string().default(''),
  session_file: z.string().default(''),
  nickname: z.string().default(''),
  character_name: z.string().optional().default(''),
  character_avatar: z.string().optional().default(''),
  character_card: z.unknown().optional().default({}),
  port: z.number().optional(),
});

export const joinRoomDtoSchema = z.object({
  address: z.string().default(''),
  nickname: z.string().default(''),
  character_name: z.string().optional().default(''),
  character_avatar: z.string().optional().default(''),
  character_card: z.unknown().optional().default({}),
});

export const submitContributionDtoSchema = z.object({
  content: z.string().default(''),
});

export const withdrawContributionDtoSchema = z.object({
  contribution_id: z.string().default(''),
});

export const approveJoinDtoSchema = z.object({
  request_id: z.string().default(''),
  accept: z.boolean().default(false),
});

export const broadcastEventDtoSchema = z.object({
  type: multiplayerEventTypeSchema,
  payload: z.unknown().optional().default({}),
});

export type MultiplayerEventType = z.infer<typeof multiplayerEventTypeSchema>;
export type MultiplayerState = z.infer<typeof multiplayerStateSchema>;
export type RoomParticipant = z.infer<typeof roomParticipantSchema>;
export type MultiplayerEnvelope = z.infer<typeof multiplayerEnvelopeSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type JoinRequestedPayload = z.infer<typeof joinRequestedSchema>;
export type JoinApprovedPayload = z.infer<typeof joinApprovedSchema>;
export type JoinRejectedPayload = z.infer<typeof joinRejectedSchema>;
export type ContributionAddedPayload = z.infer<typeof contributionAddedSchema>;
export type ContributionWithdrawnPayload = z.infer<typeof contributionWithdrawnSchema>;
export type AssistantStreamPayload = z.infer<typeof assistantStreamSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomErrorPayload = z.infer<typeof roomErrorSchema>;
export type StartHostDto = z.infer<typeof startHostDtoSchema>;
export type JoinRoomDto = z.infer<typeof joinRoomDtoSchema>;
export type SubmitContributionDto = z.infer<typeof submitContributionDtoSchema>;
export type WithdrawContributionDto = z.infer<typeof withdrawContributionDtoSchema>;
export type ApproveJoinDto = z.infer<typeof approveJoinDtoSchema>;
export type BroadcastEventDto = z.infer<typeof broadcastEventDtoSchema>;
