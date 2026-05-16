import {
  chatMessageSchema,
  getChatHeader,
  multiplayerMessageMetaSchema,
  tauriTavernSessionStateSchema,
  type ChatMessage,
  type ChatPayload,
  type MultiplayerMessageMeta,
  type SessionBindings,
  type SessionRendererBinding,
  type TauriTavernSessionState,
} from '@/types/domain';

const TAURITAVERN_ROOT_KEY = 'tauritavern';
const SESSION_KEY = 'session';
const MULTIPLAYER_MESSAGE_KEY = 'tauritavern_multiplayer';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeBindings(bindings: SessionBindings): SessionBindings {
  const world_info_names = Array.from(new Set((bindings.world_info_names ?? []).map((item) => String(item || '').trim()).filter(Boolean)));
  const presetName = String(bindings.preset_ref?.name ?? '').trim();
  const preset_ref = presetName ? { api_id: 'openai' as const, name: presetName } : null;
  const api_profile_id = bindings.api_profile_id ? String(bindings.api_profile_id).trim() || null : null;

  return {
    world_info_names,
    preset_ref,
    api_profile_id,
  };
}

function normalizeRendererBinding(binding: SessionRendererBinding): SessionRendererBinding {
  const mode = binding.mode === 'override' ? 'override' : 'inherit';
  const rendererId = binding.renderer_id ? String(binding.renderer_id).trim() || null : null;

  return {
    mode,
    renderer_id: rendererId,
  };
}

export function createDefaultSessionState(): TauriTavernSessionState {
  return tauriTavernSessionStateSchema.parse({
    version: 1,
    mode: 'single',
    bindings: {
      world_info_names: [],
      preset_ref: null,
      api_profile_id: null,
    },
    renderer: {
      mode: 'inherit',
      renderer_id: null,
    },
    multiplayer: null,
  });
}

export function resolveSessionState(payload: ChatPayload | null | undefined): TauriTavernSessionState {
  const header = payload ? getChatHeader(payload) : null;
  const metadata = asRecord(header?.chat_metadata);
  const tauritavern = asRecord(metadata[TAURITAVERN_ROOT_KEY]);
  const parsed = tauriTavernSessionStateSchema.safeParse(tauritavern[SESSION_KEY]);

  if (!parsed.success) {
    return createDefaultSessionState();
  }

  return {
    ...parsed.data,
    bindings: normalizeBindings(parsed.data.bindings),
    renderer: normalizeRendererBinding(parsed.data.renderer),
  };
}

export function resolveSessionBindings(payload: ChatPayload | null | undefined): SessionBindings {
  return resolveSessionState(payload).bindings;
}

export function withSessionState(payload: ChatPayload, state: TauriTavernSessionState): ChatPayload {
  const nextPayload = [...payload] as ChatPayload;
  const header = asRecord(nextPayload[0]);
  const metadata = asRecord(header.chat_metadata);
  const tauritavern = asRecord(metadata[TAURITAVERN_ROOT_KEY]);

  const nextSession = tauriTavernSessionStateSchema.parse({
    ...state,
    bindings: normalizeBindings(state.bindings),
    renderer: normalizeRendererBinding(state.renderer),
  });

  const nextTauri = {
    ...tauritavern,
    [SESSION_KEY]: nextSession,
  };

  nextPayload[0] = {
    ...header,
    chat_metadata: {
      ...metadata,
      [TAURITAVERN_ROOT_KEY]: nextTauri,
    },
  };

  return nextPayload;
}

export function withSessionBindings(payload: ChatPayload, bindings: SessionBindings): ChatPayload {
  const state = resolveSessionState(payload);
  return withSessionState(payload, {
    ...state,
    bindings: normalizeBindings(bindings),
  });
}

export function resolveSessionRendererBinding(payload: ChatPayload | null | undefined): SessionRendererBinding {
  return resolveSessionState(payload).renderer;
}

export function withSessionRendererBinding(payload: ChatPayload, renderer: SessionRendererBinding): ChatPayload {
  const state = resolveSessionState(payload);
  return withSessionState(payload, {
    ...state,
    renderer: normalizeRendererBinding(renderer),
  });
}

export function resolveMultiplayerMessageMeta(message: ChatMessage | null | undefined): MultiplayerMessageMeta | null {
  if (!message) {
    return null;
  }

  const extra = asRecord(message.extra);
  const parsed = multiplayerMessageMetaSchema.safeParse(extra[MULTIPLAYER_MESSAGE_KEY]);
  return parsed.success ? parsed.data : null;
}

export function withMultiplayerMessageMeta(message: ChatMessage, meta: MultiplayerMessageMeta | null): ChatMessage {
  const parsedMessage = chatMessageSchema.parse(message);
  const extra = asRecord(parsedMessage.extra);

  if (!meta) {
    const { [MULTIPLAYER_MESSAGE_KEY]: _unused, ...rest } = extra;
    return {
      ...parsedMessage,
      extra: rest,
    };
  }

  return {
    ...parsedMessage,
    extra: {
      ...extra,
      [MULTIPLAYER_MESSAGE_KEY]: multiplayerMessageMetaSchema.parse(meta),
    },
  };
}
