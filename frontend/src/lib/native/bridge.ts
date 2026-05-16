import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Effect, getCurrentWindow } from '@tauri-apps/api/window';

import { locale } from '@/shared/i18n';
import type { ChatPayloadCursor, ChatPayloadPatch, RendererManifest } from '@/types/domain';
import type { WindowBackdropState } from '@/types/ui';
import type { ApproveJoinDto, BroadcastEventDto, JoinRoomDto, MultiplayerEnvelope, RoomStatus, StartHostDto, SubmitContributionDto, WithdrawContributionDto } from '@/types/multiplayer';

type Unlisten = () => void;

export type StartupStatus = {
  ready: boolean;
  error: string | null;
};

export type ChatPayloadTailResult = {
  header: string;
  lines: string[];
  cursor: ChatPayloadCursor;
  hasMoreBefore: boolean;
  startIndex?: number;
  totalMessages?: number;
};

export type ChatPayloadChunkResult = {
  lines: string[];
  cursor: ChatPayloadCursor;
  hasMoreBefore: boolean;
  startIndex?: number;
  totalMessages?: number;
};

export type ChatCompletionStatusRequest = {
  chat_completion_source: string;
  reverse_proxy?: string;
  proxy_password?: string;
  custom_url?: string;
  custom_include_headers?: string;
  bypass_status_check?: boolean;
};

export type ChatCompletionStreamEvent =
  | { type: 'chunk'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

function hasTauriRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

async function tryInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!hasTauriRuntime()) {
    return null;
  }

  try {
    return await invoke<T>(command, args);
  } catch {
    return null;
  }
}

async function invokeRequired<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriRuntime()) {
    throw new Error(locale.errors.tauriUnavailable);
  }

  return invoke<T>(command, args);
}

function createAssetUrl(path: string): string {
  if (!path) {
    return path;
  }

  if (!hasTauriRuntime()) {
    return path;
  }

  try {
    return convertFileSrc(path, 'asset');
  } catch {
    return path;
  }
}

async function listenEvent<T>(name: string, handler: (payload: T) => void): Promise<Unlisten> {
  if (!hasTauriRuntime()) {
    return () => undefined;
  }

  const unlisten = await listen<T>(name, (event) => {
    handler(event.payload);
  });
  return unlisten;
}

async function tryEnableMica(): Promise<WindowBackdropState> {
  if (!hasTauriRuntime()) {
    return 'fallback';
  }

  try {
    await getCurrentWindow().setEffects({ effects: [Effect.Mica] });
    return 'mica';
  } catch (error) {
    console.debug('[appearance] Mica 不可用，已回退。', error);
    return 'fallback';
  }
}

export const nativeBridge = {
  isTauri: hasTauriRuntime,
  assetUrl: createAssetUrl,
  commands: {
    invoke: tryInvoke,
    invokeRequired,
  },
  events: {
    listen: listenEvent,
  },
  app: {
    async isReady(): Promise<boolean> {
      if (!hasTauriRuntime()) {
        return true;
      }

      return (await tryInvoke<boolean>('is_ready')) ?? false;
    },
    async getStartupStatus(): Promise<StartupStatus> {
      if (!hasTauriRuntime()) {
        return { ready: true, error: null };
      }

      return (await tryInvoke<StartupStatus>('get_startup_status')) ?? { ready: false, error: locale.errors.startupStatusFailed };
    },
    listenReady(handler: () => void): Promise<Unlisten> {
      return listenEvent<null>('app-ready', () => handler());
    },
    listenError(handler: (message: string) => void): Promise<Unlisten> {
      return listenEvent<string>('app-error', handler);
    },
  },
  appearance: {
    tryEnableMica,
  },
  async readFrontendTemplate(name: string): Promise<string | null> {
    return tryInvoke<string>('read_frontend_template', { name });
  },
  async exportFile(payload: { filePath: string; outputName: string }): Promise<boolean> {
    if (!payload.filePath) {
      return false;
    }

    return false;
  },
  async revealInDir(path: string): Promise<boolean> {
    const result = await tryInvoke<unknown>('plugin:opener|reveal_item_in_dir', { path });
    return result !== null;
  },
  files: {
    async stage(name: string, data: Uint8Array): Promise<string> {
      const result = await invokeRequired<{ file_path: string }>('stage_frontend_file', {
        name,
        data: Array.from(data),
      });
      return result.file_path;
    },
    async cleanup(filePath: string): Promise<void> {
      await invokeRequired('cleanup_frontend_file', { filePath });
    },
    async saveExport(outputName: string, data: Uint8Array): Promise<string> {
      const result = await invokeRequired<{ path: string }>('save_export_file', {
        outputName,
        data: Array.from(data),
      });
      return result.path;
    },
  },
  chatTransport: {
    async getChatPayloadPath(characterName: string, fileName: string): Promise<string | null> {
      return tryInvoke<string>('get_chat_payload_path', { characterName, fileName });
    },
    async getCharacterPayloadTail(characterName: string, fileName: string, maxLines: number, allowNotFound = true): Promise<ChatPayloadTailResult | null> {
      return tryInvoke<ChatPayloadTailResult>('get_chat_payload_tail', { characterName, fileName, maxLines, allowNotFound });
    },
    async getCharacterPayloadBefore(characterName: string, fileName: string, cursor: ChatPayloadCursor, maxLines: number): Promise<ChatPayloadChunkResult | null> {
      return tryInvoke<ChatPayloadChunkResult>('get_chat_payload_before', { characterName, fileName, cursor, maxLines });
    },
    async saveCharacterPayloadWindowed(characterName: string, fileName: string, cursor: ChatPayloadCursor, header: string, lines: string[], force = false): Promise<ChatPayloadCursor> {
      return invokeRequired<ChatPayloadCursor>('save_chat_payload_windowed', {
        dto: {
          ch_name: characterName,
          file_name: fileName,
          cursor,
          header,
          lines,
          force,
        },
      });
    },
    async patchCharacterPayloadWindowed(characterName: string, fileName: string, cursor: ChatPayloadCursor, header: string, patch: ChatPayloadPatch, force = false): Promise<ChatPayloadCursor> {
      return invokeRequired<ChatPayloadCursor>('patch_chat_payload_windowed', {
        dto: {
          ch_name: characterName,
          file_name: fileName,
          cursor,
          header,
          patch,
          force,
        },
      });
    },
    async getGroupChatPath(id: string): Promise<string | null> {
      return tryInvoke<string>('get_group_chat_path', { id });
    },
    async getGroupPayloadTail(id: string, maxLines: number, allowNotFound = true): Promise<ChatPayloadTailResult | null> {
      return tryInvoke<ChatPayloadTailResult>('get_group_chat_payload_tail', { id, maxLines, allowNotFound });
    },
    async getGroupPayloadBefore(id: string, cursor: ChatPayloadCursor, maxLines: number): Promise<ChatPayloadChunkResult | null> {
      return tryInvoke<ChatPayloadChunkResult>('get_group_chat_payload_before', { id, cursor, maxLines });
    },
    async saveGroupPayloadWindowed(id: string, cursor: ChatPayloadCursor, header: string, lines: string[], force = false): Promise<ChatPayloadCursor> {
      return invokeRequired<ChatPayloadCursor>('save_group_chat_payload_windowed', {
        dto: {
          id,
          cursor,
          header,
          lines,
          force,
        },
      });
    },
    async patchGroupPayloadWindowed(id: string, cursor: ChatPayloadCursor, header: string, patch: ChatPayloadPatch, force = false): Promise<ChatPayloadCursor> {
      return invokeRequired<ChatPayloadCursor>('patch_group_chat_payload_windowed', {
        dto: {
          id,
          cursor,
          header,
          patch,
          force,
        },
      });
    },
    async listRendererPackages(): Promise<RendererManifest[]> {
      return (await tryInvoke<RendererManifest[]>('list_renderer_packages')) ?? [];
    },
    async importRendererPackage(fileName: string, data: Uint8Array): Promise<RendererManifest> {
      return invokeRequired<RendererManifest>('import_renderer_package', {
        dto: {
          file_name: fileName,
          data: Array.from(data),
        },
      });
    },
    async deleteRendererPackage(rendererId: string): Promise<boolean> {
      const result = await tryInvoke<{ ok: boolean }>('delete_renderer_package', { rendererId });
      return result?.ok ?? false;
    },
  },
  chatCompletion: {
    getStatus(dto: ChatCompletionStatusRequest): Promise<Record<string, unknown>> {
      return invokeRequired<Record<string, unknown>>('get_chat_completions_status', { dto });
    },
    generate(dto: Record<string, unknown>, requestId: string): Promise<Record<string, unknown>> {
      return invokeRequired<Record<string, unknown>>('generate_chat_completion', { dto, requestId });
    },
    startStream(streamId: string, dto: Record<string, unknown>): Promise<void> {
      return invokeRequired('start_chat_completion_stream', { streamId, dto });
    },
    cancelStream(streamId: string): Promise<void> {
      return invokeRequired('cancel_chat_completion_stream', { streamId });
    },
    cancelGeneration(requestId: string): Promise<void> {
      return invokeRequired('cancel_chat_completion_generation', { requestId });
    },
    listenStream(streamId: string, handler: (payload: ChatCompletionStreamEvent) => void): Promise<Unlisten> {
      return listenEvent<ChatCompletionStreamEvent>(`chat-completion-stream:${streamId}`, handler);
    },
  },
  lanSync: {
    async getStatus(): Promise<Record<string, unknown> | null> {
      return tryInvoke<Record<string, unknown>>('lan_sync_get_status');
    },
    async listDevices(): Promise<unknown[] | null> {
      return tryInvoke<unknown[]>('lan_sync_list_devices');
    },
    listenProgress(handler: (payload: Record<string, unknown>) => void): Promise<Unlisten> {
      return listenEvent<Record<string, unknown>>('lan_sync:progress', handler);
    },
  },
  multiplayer: {
    startHost(dto: StartHostDto): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_start_host', { dto });
    },
    stopHost(): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_stop_host');
    },
    join(dto: JoinRoomDto): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_join_room', { dto });
    },
    leave(): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_leave_room');
    },
    submitContribution(dto: SubmitContributionDto): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_submit_contribution', { dto });
    },
    withdrawContribution(dto: WithdrawContributionDto): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_withdraw_contribution', { dto });
    },
    approveJoin(dto: ApproveJoinDto): Promise<RoomStatus | null> {
      return invokeRequired<RoomStatus>('multiplayer_approve_join', { dto });
    },
    broadcastEvent(dto: BroadcastEventDto): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto });
    },
    broadcastSnapshot(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'room_snapshot', payload } });
    },
    broadcastBindings(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'bindings_updated', payload } });
    },
    broadcastAssistantStarted(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'assistant_stream_started', payload } });
    },
    broadcastAssistantDelta(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'assistant_stream_delta', payload } });
    },
    broadcastAssistantDone(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'assistant_stream_done', payload } });
    },
    broadcastAssistantAborted(payload: Record<string, unknown>): Promise<RoomStatus | null> {
      return tryInvoke<RoomStatus>('multiplayer_broadcast_event', { dto: { type: 'assistant_stream_aborted', payload } });
    },
    listenEvents(handler: (payload: MultiplayerEnvelope) => void): Promise<Unlisten> {
      return listenEvent<MultiplayerEnvelope>('multiplayer:event', handler);
    },
  },
  shareImport: {
    async getPendingPayload(): Promise<Record<string, unknown> | null> {
      return tryInvoke<Record<string, unknown>>('consume_pending_share_payload');
    },
  },
};
