import {
  backgroundListSchema,
  characterDetailSchema,
  characterSummarySchema,
  chatListItemSchema,
  chatSessionSummarySchema,
  extensionSchema,
  generationRequestSchema,
  getChatHeader,
  getChatMessages,
  groupSchema,
  parseArray,
  secretStateSchema,
  secretsViewSchema,
  sessionBindingsSchema,
  snapshotSchema,
  type AppSettings,
  type BackgroundList,
  type CharacterDetail,
  type CharacterSummary,
  type ChatListItem,
  type ChatMessage,
  type ChatPayload,
  type ChatProviderDraft,
  type ChatSessionFilter,
  type ChatSessionSummary,
  type GenerationRequest,
  type Group,
  type PresetApiId,
  type SessionBindings,
  type Snapshot,
  type Theme,
  type WorldInfoRecord,
} from '@/types/domain';
import { createCreateDate, createSendDate } from '@/shared/utils/format';
import { nativeBridge } from '@/lib/native/bridge';

import { parseSillyTavernSettingsPayload } from './settings';

export type CharacterFormInput = {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  exampleMessages?: string;
  creator?: string;
  creatorNotes?: string;
  version?: string;
  tags?: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  talkativeness?: number;
  favorite?: boolean;
  alternateGreetings?: string[];
  world?: string;
};

type ChatDto = {
  character_name: string;
  user_name: string;
  file_name: string;
  create_date: string;
  chat_metadata?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
};

type ChatSearchResultDto = {
  character_name: string;
  file_name: string;
  file_size?: number;
  message_count?: number;
  preview?: string;
  date?: number;
  chat_id?: string | null;
  session_mode?: 'single' | 'multiplayer';
};

type CharacterChatDto = {
  file_name: string;
  file_size?: string;
  chat_items?: number;
  last_message?: string;
  last_message_date?: number;
};

type GroupSummaryDto = {
  id: string;
  name: string;
  avatar_url?: string | null;
  chats?: string[];
};

type BackupDto = {
  file_name: string;
  file_size?: number;
  date?: number;
};

type SecretFindDto = {
  value?: string;
};

type PresetRestoreDto = {
  isDefault: boolean;
  preset: Record<string, unknown>;
};

type PrepareGenerationIssueDto = {
  code?: string;
  severity?: string;
  details?: unknown;
};

type ProjectChatDisplayDto = {
  payload?: unknown;
};

type PrepareGenerationNoticeDto = {
  code?: string;
  tone?: string;
  title?: string | null;
  description?: string | null;
};

type PrepareGenerationPromptStatsDto = {
  renamed?: number;
  generated?: number;
  removed_order?: number;
  added_order?: number;
};

type PrepareGenerationPromptStatusDto = {
  inherited?: boolean;
  migrated?: boolean;
  migrated_map?: boolean;
  repaired?: boolean;
  stats?: PrepareGenerationPromptStatsDto;
};

type PrepareGenerationRequestStatusDto = {
  removed?: unknown;
  stream_adjusted?: boolean;
};

type PrepareGenerationUsageDto = {
  model?: string;
  prompt_tokens?: number;
  max_context_tokens?: number;
  remaining_context_tokens?: number;
  usage_ratio?: number;
  within_limit?: boolean;
};

type PrepareGenerationResponseDto = {
  request?: unknown;
  preset_draft?: unknown;
  normalized_bindings?: unknown;
  issues?: PrepareGenerationIssueDto[];
  notices?: PrepareGenerationNoticeDto[];
  prompt_status?: PrepareGenerationPromptStatusDto;
  request_status?: PrepareGenerationRequestStatusDto;
  usage?: PrepareGenerationUsageDto | null;
  preset_name?: string | null;
  preset_restored_default?: boolean;
};

type CharacterExportDto = {
  data: number[] | Uint8Array;
  mime_type: string;
};

type CharacterCreateResult = {
  avatar?: string;
};

type CharacterImportResult = {
  avatar?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((item) => Number(item) & 0xff));
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  const record = asRecord(value);
  if (Array.isArray(record.data)) {
    return Uint8Array.from(record.data.map((item) => Number(item) & 0xff));
  }

  throw new Error('Unsupported binary payload');
}

function avatarUrlToCharacterName(avatarUrl: string, fallbackName = ''): string {
  const rawValue = String(avatarUrl || fallbackName || '').trim();
  if (!rawValue) {
    return '';
  }

  try {
    const decoded = decodeURIComponent(rawValue).split('?')[0].split('#')[0];
    const normalized = decoded.replace(/[\\/]+/g, '/');
    const fileName = normalized.split('/').pop() ?? decoded;
    return fileName.replace(/\.[^/.]+$/, '') || fallbackName;
  } catch {
    return rawValue.replace(/\.[^/.]+$/, '') || fallbackName;
  }
}

function stripJsonlSuffix(fileName: string): string {
  return String(fileName || '').replace(/\.jsonl$/i, '');
}

function normalizeChatFileName(fileName: string): string {
  return stripJsonlSuffix(fileName).trim();
}

function buildChatExportFileName(fileName: string, format: 'txt' | 'jsonl'): string {
  const stem = stripJsonlSuffix(fileName) || 'chat';
  return format === 'jsonl' ? `${stem}.jsonl` : `${stem}.txt`;
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function saveExportBytes(data: Uint8Array, outputName: string): Promise<void> {
  await nativeBridge.files.saveExport(outputName, data);
}

async function saveExportText(text: string, outputName: string): Promise<void> {
  await saveExportBytes(encodeUtf8(text), outputName);
}

async function withStagedFile<T>(file: File, handler: (filePath: string) => Promise<T>): Promise<T> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const filePath = await nativeBridge.files.stage(file.name, bytes);

  try {
    return await handler(filePath);
  } finally {
    void nativeBridge.files.cleanup(filePath).catch(() => undefined);
  }
}

async function withStagedText<T>(name: string, text: string, handler: (filePath: string) => Promise<T>): Promise<T> {
  const filePath = await nativeBridge.files.stage(name, encodeUtf8(text));

  try {
    return await handler(filePath);
  } finally {
    void nativeBridge.files.cleanup(filePath).catch(() => undefined);
  }
}

function payloadToJsonl(payload: ChatPayload): string {
  return payload.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Chat payload entry at index ${index} must be an object`);
    }
    return JSON.stringify(item);
  }).join('\n');
}

function payloadToPlainText(payload: ChatPayload): string {
  return payload
    .slice(1)
    .filter((message) => !Boolean(message?.is_system))
    .map((message) => {
      const role = String(message?.name || (message?.is_user ? 'User' : 'Assistant'));
      const extra = asRecord(message?.extra);
      const displayText = String(extra.display_text ?? message?.mes ?? '');
      return `${role}: ${displayText.replace(/\r?\n/g, '\n')}`;
    })
    .join('\n\n');
}

function createStreamId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createChatHeader(characterName: string, userName: string): Record<string, unknown> {
  return {
    user_name: userName,
    character_name: characterName,
    create_date: createCreateDate(),
    chat_metadata: {},
  };
}

function parseJsonLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

function parsePayloadFromJsonLines(header: string, lines: string[]): ChatPayload {
  return [parseJsonLine(header), ...lines.map(parseJsonLine)] as ChatPayload;
}

function toChatPayload(chat: ChatDto): ChatPayload {
  const header = {
    user_name: String(chat.user_name ?? ''),
    character_name: String(chat.character_name ?? ''),
    create_date: String(chat.create_date ?? ''),
    chat_metadata: asRecord(chat.chat_metadata),
  };
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  return [
    header,
    ...messages.map((message) => {
      const record = asRecord(message);
      const extra = asRecord(record.extra);
      return {
        ...record,
        extra,
        swipe_id: typeof extra.swipe_id === 'number' ? extra.swipe_id : undefined,
        swipes: Array.isArray(extra.swipes) ? extra.swipes.map((item) => String(item)) : undefined,
        swipe_info: Array.isArray(extra.swipe_info) ? extra.swipe_info : undefined,
      };
    }),
  ] as ChatPayload;
}

async function loadCompleteGroupPayload(id: string): Promise<ChatPayload> {
  const normalizedId = normalizeChatFileName(id);
  const tail = await nativeBridge.chatTransport.getGroupPayloadTail(normalizedId, 512, true);

  if (!tail?.header) {
    return [];
  }

  let payload = parsePayloadFromJsonLines(tail.header, tail.lines ?? []);
  let cursor: typeof tail.cursor | null = tail.cursor ?? null;
  let hasMoreBefore = Boolean(tail.hasMoreBefore);

  while (hasMoreBefore && cursor) {
    const before = await nativeBridge.chatTransport.getGroupPayloadBefore(normalizedId, cursor, 512);
    const lines = Array.isArray(before?.lines) ? before.lines : [];
    payload = [payload[0], ...lines.map(parseJsonLine), ...payload.slice(1)] as ChatPayload;
    cursor = before?.cursor ?? null;
    hasMoreBefore = Boolean(before?.hasMoreBefore);
  }

  return payload;
}

function mapCharacterFormToCreateDto(input: CharacterFormInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? '',
    personality: input.personality ?? '',
    scenario: input.scenario ?? '',
    first_mes: input.firstMessage ?? '',
    mes_example: input.exampleMessages ?? '',
    creator: input.creator ?? '',
    creator_notes: input.creatorNotes ?? '',
    character_version: input.version ?? '',
    tags: input.tags ?? [],
    talkativeness: input.talkativeness ?? 0.5,
    fav: Boolean(input.favorite),
    alternate_greetings: input.alternateGreetings ?? [],
    world: input.world ?? '',
    system_prompt: input.systemPrompt ?? '',
    post_history_instructions: input.postHistoryInstructions ?? '',
  };
}

function mapCharacterFormToUpdateDto(input: CharacterFormInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? '',
    personality: input.personality ?? '',
    scenario: input.scenario ?? '',
    first_mes: input.firstMessage ?? '',
    mes_example: input.exampleMessages ?? '',
    creator: input.creator ?? '',
    creator_notes: input.creatorNotes ?? '',
    character_version: input.version ?? '',
    tags: input.tags ?? [],
    talkativeness: input.talkativeness ?? 0.5,
    fav: Boolean(input.favorite),
    alternate_greetings: input.alternateGreetings ?? [],
    world: input.world ?? '',
    system_prompt: input.systemPrompt ?? '',
    post_history_instructions: input.postHistoryInstructions ?? '',
  };
}

function mapCharacterChat(item: CharacterChatDto): ChatListItem {
  return chatListItemSchema.parse({
    file_name: `${stripJsonlSuffix(item.file_name)}.jsonl`,
    file_size: item.file_size ?? '',
    chat_items: Number(item.chat_items ?? 0),
    message_count: Number(item.chat_items ?? 0),
    preview_message: String(item.last_message ?? ''),
    last_message: String(item.last_message ?? ''),
    last_mes: Number(item.last_message_date ?? 0),
  });
}

function mapChatSearchToSessionSummary(item: ChatSearchResultDto, avatar: string): ChatSessionSummary {
  return chatSessionSummarySchema.parse({
    source_type: 'character',
    scope_id: avatarUrlToCharacterName(avatar, item.character_name),
    scope_name: item.character_name,
    file_name: `${stripJsonlSuffix(item.file_name)}.jsonl`,
    preview_message: item.preview ?? '',
    last_mes: Number(item.date ?? 0),
    message_count: Number(item.message_count ?? 0),
    session_mode: item.session_mode ?? 'single',
    avatar,
  });
}

function mapGroupSearchToSessionSummary(item: ChatSearchResultDto, group: GroupSummaryDto): ChatSessionSummary {
  return chatSessionSummarySchema.parse({
    source_type: 'group',
    scope_id: group.id,
    scope_name: group.name,
    file_name: `${stripJsonlSuffix(item.file_name)}.jsonl`,
    preview_message: item.preview ?? '',
    last_mes: Number(item.date ?? 0),
    message_count: Number(item.message_count ?? 0),
    session_mode: item.session_mode ?? 'single',
    avatar: String(group.avatar_url ?? ''),
    group_id: group.id,
  });
}

function mapChatSearchToRecentItem(item: ChatSearchResultDto, avatar: string): ChatListItem {
  return chatListItemSchema.parse({
    file_name: `${stripJsonlSuffix(item.file_name)}.jsonl`,
    file_size: String(item.file_size ?? ''),
    chat_items: Number(item.message_count ?? 0),
    mes: String(item.preview ?? ''),
    last_mes: Number(item.date ?? 0),
    avatar,
  });
}

function mapGroupSearchToRecentItem(item: ChatSearchResultDto, groupId: string): ChatListItem {
  return chatListItemSchema.parse({
    file_name: `${stripJsonlSuffix(item.file_name)}.jsonl`,
    file_size: String(item.file_size ?? ''),
    chat_items: Number(item.message_count ?? 0),
    mes: String(item.preview ?? ''),
    last_mes: Number(item.date ?? 0),
    group: groupId,
  });
}

export function createUserChatMessage(name: string, content: string): ChatMessage {
  return {
    name,
    is_user: true,
    is_system: false,
    send_date: createSendDate(),
    mes: content,
    extra: {},
  };
}

export function createAssistantChatMessage(name: string, content: string): ChatMessage {
  return {
    name,
    is_user: false,
    is_system: false,
    send_date: createSendDate(),
    mes: content,
    extra: {},
  };
}

export function ensureChatPayload(characterName: string, userName: string, payload?: ChatPayload): ChatPayload {
  if (payload && payload.length > 0) {
    return payload;
  }

  return [createChatHeader(characterName, userName)];
}

export const coreApiClient = {
  async getSettings(): Promise<AppSettings> {
    const payload = await nativeBridge.commands.invokeRequired<unknown>('get_sillytavern_settings');
    return parseSillyTavernSettingsPayload(payload);
  },
  settings: {
    async save(settings: Record<string, unknown>): Promise<{ result: string }> {
      await nativeBridge.commands.invokeRequired('save_user_settings', { settings });
      return { result: 'ok' };
    },
    async makeSnapshot(): Promise<{ result: string }> {
      await nativeBridge.commands.invokeRequired('create_settings_snapshot');
      return { result: 'ok' };
    },
    async listSnapshots(): Promise<Snapshot[]> {
      const snapshots = await nativeBridge.commands.invokeRequired<unknown[]>('get_settings_snapshots');
      return parseArray(snapshotSchema, snapshots.map((snapshot) => ({
        ...asRecord(snapshot),
        created_at: asRecord(snapshot).date ?? undefined,
      })));
    },
    async loadSnapshot(name: string): Promise<Record<string, unknown>> {
      return asRecord(await nativeBridge.commands.invokeRequired<unknown>('load_settings_snapshot', { name }));
    },
    async restoreSnapshot(name: string): Promise<{ result: string }> {
      await nativeBridge.commands.invokeRequired('restore_settings_snapshot', { name });
      return { result: 'ok' };
    },
  },
  secrets: {
    async readState(): Promise<Record<string, unknown>> {
      return secretStateSchema.parse(await nativeBridge.commands.invokeRequired('read_secret_state'));
    },
    async view(): Promise<Record<string, unknown>> {
      return secretsViewSchema.parse(await nativeBridge.commands.invokeRequired('view_secrets'));
    },
    async find(key: string, id?: string | null): Promise<Record<string, unknown>> {
      const payload = await nativeBridge.commands.invokeRequired<SecretFindDto>('find_secret', { dto: { key, id: id ?? null } });
      return asRecord(payload);
    },
    async write(key: string, value: string, label?: string | null): Promise<{ id: string }> {
      const id = await nativeBridge.commands.invokeRequired<string>('write_secret', { dto: { key, value, label: label ?? null } });
      return { id };
    },
    async delete(key: string, id?: string | null): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_secret', { dto: { key, id: id ?? null } });
      return { ok: true };
    },
    async rename(key: string, id: string, label: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('rename_secret', { dto: { key, id, label } });
      return { ok: true };
    },
    async rotate(key: string, id: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('rotate_secret', { dto: { key, id } });
      return { ok: true };
    },
  },
  presets: {
    list(apiId: PresetApiId | string = 'openai'): Promise<string[]> {
      return nativeBridge.commands.invokeRequired<string[]>('list_presets', { apiId });
    },
    async get(apiId: string, name: string): Promise<Record<string, unknown> | null> {
      const payload = await nativeBridge.commands.invokeRequired<unknown>('get_preset', { apiId, name });
      return payload ? asRecord(payload) : null;
    },
    async save(apiId: string, name: string, preset: Record<string, unknown>): Promise<{ name: string }> {
      return nativeBridge.commands.invokeRequired<{ name: string }>('save_preset', {
        dto: {
          apiId,
          name,
          preset,
        },
      });
    },
    async restore(apiId: string, name: string): Promise<{ isDefault: boolean; preset: Record<string, unknown> }> {
      const payload = await nativeBridge.commands.invokeRequired<PresetRestoreDto>('restore_preset', {
        dto: {
          apiId,
          name,
        },
      });
      return {
        isDefault: Boolean(payload.isDefault),
        preset: asRecord(payload.preset),
      };
    },
    async delete(apiId: string, name: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_preset', {
        dto: {
          apiId,
          name,
        },
      });
      return { ok: true };
    },
  },
  characters: {
    async list(): Promise<CharacterSummary[]> {
      const payload = await nativeBridge.commands.invokeRequired<unknown[]>('get_all_characters', { shallow: true });
      return parseArray(characterSummarySchema, payload);
    },
    async get(avatarUrl: string): Promise<CharacterDetail> {
      const payload = await nativeBridge.commands.invokeRequired<unknown>('get_character', { name: avatarUrlToCharacterName(avatarUrl) });
      return characterDetailSchema.parse(payload);
    },
    async listChats(avatarUrl: string, name?: string): Promise<ChatListItem[]> {
      const payload = await nativeBridge.commands.invokeRequired<CharacterChatDto[]>('get_character_chats_by_id', {
        dto: {
          name: avatarUrlToCharacterName(avatarUrl, name),
          simple: true,
        },
      });
      return payload.map(mapCharacterChat);
    },
    async create(input: CharacterFormInput, avatarFile?: File | null): Promise<string> {
      const dto = mapCharacterFormToCreateDto(input);

      if (avatarFile) {
        const payload = await withStagedFile(avatarFile, (avatarPath) => nativeBridge.commands.invokeRequired<CharacterCreateResult>('create_character_with_avatar', {
          dto: {
            character: dto,
            avatar_path: avatarPath,
            crop: null,
          },
        }));
        return String(payload.avatar ?? `${input.name}.png`);
      }

      const payload = await nativeBridge.commands.invokeRequired<CharacterCreateResult>('create_character', { dto });
      return String(payload.avatar ?? `${input.name}.png`);
    },
    async update(avatarUrl: string, input: CharacterFormInput, avatarFile?: File | null): Promise<string> {
      const currentName = avatarUrlToCharacterName(avatarUrl, input.name);
      await nativeBridge.commands.invokeRequired('update_character', {
        name: currentName,
        dto: mapCharacterFormToUpdateDto(input),
      });

      if (avatarFile) {
        await withStagedFile(avatarFile, (avatarPath) => nativeBridge.commands.invokeRequired('update_avatar', {
          dto: {
            name: currentName,
            avatar_path: avatarPath,
            crop: null,
          },
        }));
      }

      return 'ok';
    },
    async delete(avatarUrl: string, name?: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_character', {
        dto: {
          name: avatarUrlToCharacterName(avatarUrl, name),
          delete_chats: false,
        },
      });
      return { ok: true };
    },
    async duplicate(avatarUrl: string): Promise<{ path: string }> {
      const payload = await nativeBridge.commands.invokeRequired<CharacterCreateResult>('duplicate_character', {
        name: avatarUrlToCharacterName(avatarUrl),
      });
      return { path: String(payload.avatar ?? '') };
    },
    async export(avatarUrl: string, format: 'json' | 'png'): Promise<void> {
      const name = avatarUrlToCharacterName(avatarUrl);
      const exported = await nativeBridge.commands.invokeRequired<CharacterExportDto>('export_character_content', {
        dto: {
          name,
          format,
        },
      });
      await saveExportBytes(asUint8Array(exported.data), `${name}.${format}`);
    },
    async import(file: File): Promise<{ file_name: string }> {
      const payload = await withStagedFile(file, (filePath) => nativeBridge.commands.invokeRequired<CharacterImportResult>('import_character', {
        dto: {
          file_path: filePath,
          preserve_file_name: null,
        },
      }));
      const avatar = String(payload.avatar ?? file.name);
      return { file_name: avatar.replace(/\.png$/i, '') };
    },
  },
  groups: {
    async list(): Promise<Group[]> {
      const payload = await nativeBridge.commands.invokeRequired<unknown[]>('get_all_groups');
      return parseArray(groupSchema, payload);
    },
    async get(id: string): Promise<Group> {
      const payload = await nativeBridge.commands.invokeRequired<unknown>('get_group', { id });
      const record = asRecord(payload);
      if (Object.keys(record).length === 0) {
        throw new Error(`Group not found: ${id}`);
      }
      return groupSchema.parse(record);
    },
    async create(payload: Record<string, unknown>): Promise<Group> {
      const created = await nativeBridge.commands.invokeRequired<unknown>('create_group', { dto: payload });
      return groupSchema.parse(created);
    },
    async update(payload: Record<string, unknown>): Promise<Group> {
      const updated = await nativeBridge.commands.invokeRequired<unknown>('update_group', { dto: payload });
      return groupSchema.parse(updated);
    },
    async delete(id: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_group', { dto: { id } });
      return { ok: true };
    },
  },
  chats: {
    async getCharacter(avatarUrl: string, fileName: string): Promise<{ payload: ChatPayload; headerName: string; messages: ChatMessage[] }> {
      const characterName = avatarUrlToCharacterName(avatarUrl);
      const chat = await nativeBridge.commands.invokeRequired<ChatDto>('get_chat', {
        characterName,
        fileName: normalizeChatFileName(fileName),
      });
      const payload = toChatPayload(chat);
      const header = getChatHeader(payload);
      return { payload, headerName: header?.character_name ?? characterName, messages: getChatMessages(payload) };
    },
    async saveCharacter(avatarUrl: string, fileName: string, payload: ChatPayload): Promise<{ ok: boolean }> {
      const characterName = avatarUrlToCharacterName(avatarUrl);
      await withStagedText(`${normalizeChatFileName(fileName)}.jsonl`, payloadToJsonl(payload), (filePath) => (
        nativeBridge.commands.invokeRequired('save_chat_payload_from_file', {
          dto: {
            ch_name: characterName,
            file_name: normalizeChatFileName(fileName),
            file_path: filePath,
            force: true,
          },
        })
      ));
      return { ok: true };
    },
    async deleteCharacter(avatarUrl: string, fileName: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_chat', {
        characterName: avatarUrlToCharacterName(avatarUrl),
        fileName: normalizeChatFileName(fileName),
      });
      return { ok: true };
    },
    async renameCharacter(avatarUrl: string, oldFileName: string, newFileName: string): Promise<Record<string, unknown>> {
      await nativeBridge.commands.invokeRequired('rename_chat', {
        dto: {
          character_name: avatarUrlToCharacterName(avatarUrl),
          old_file_name: normalizeChatFileName(oldFileName),
          new_file_name: normalizeChatFileName(newFileName),
        },
      });
      return { ok: true, sanitizedFileName: normalizeChatFileName(newFileName) };
    },
    async exportCharacter(avatarUrl: string, fileName: string, format: 'txt' | 'jsonl' = 'txt'): Promise<void> {
      const result = await coreApiClient.chats.getCharacter(avatarUrl, fileName);
      const content = format === 'jsonl' ? payloadToJsonl(result.payload) : payloadToPlainText(result.payload);
      await saveExportText(content, buildChatExportFileName(fileName, format));
    },
    async importCharacter(avatarUrl: string, file: File): Promise<Record<string, unknown>> {
      const fileType = file.name.split('.').pop()?.toLowerCase() ?? 'jsonl';
      const payload = await withStagedFile(file, (filePath) => nativeBridge.commands.invokeRequired<string[]>('import_character_chats', {
        dto: {
          character_name: avatarUrlToCharacterName(avatarUrl),
          character_display_name: null,
          user_name: null,
          file_path: filePath,
          file_type: fileType,
        },
      }));
      return {
        res: true,
        fileNames: payload,
      };
    },
    async listSessions(filter: ChatSessionFilter, query = ''): Promise<ChatSessionSummary[]> {
      const trimmedQuery = query.trim();
      const includeCharacters = filter !== 'group';
      const includeGroups = filter !== 'character';
      const [characters, groups] = await Promise.all([
        includeCharacters ? nativeBridge.commands.invokeRequired<CharacterSummary[]>('get_all_characters', { shallow: true }) : Promise.resolve([]),
        includeGroups ? nativeBridge.commands.invokeRequired<GroupSummaryDto[]>('get_all_groups') : Promise.resolve([]),
      ]);

      const avatarByName = new Map(characters.map((character) => [String(character.name ?? ''), String(character.avatar ?? `${character.name}.png`)]));
      const groupByChatId = new Map<string, GroupSummaryDto>();
      for (const group of groups) {
        for (const chatId of group.chats ?? []) {
          groupByChatId.set(stripJsonlSuffix(String(chatId)), group);
        }
      }

      const [characterEntries, groupEntries] = await Promise.all([
        includeCharacters
          ? nativeBridge.commands.invokeRequired<ChatSearchResultDto[]>(trimmedQuery ? 'search_chats' : 'list_chat_summaries', trimmedQuery
            ? { query: trimmedQuery, characterFilter: null }
            : { characterFilter: null, includeMetadata: false })
          : Promise.resolve([]),
        includeGroups && groupByChatId.size > 0
          ? nativeBridge.commands.invokeRequired<ChatSearchResultDto[]>(trimmedQuery ? 'search_group_chats' : 'list_group_chat_summaries', trimmedQuery
            ? { query: trimmedQuery, chatIds: Array.from(groupByChatId.keys()) }
            : { chatIds: Array.from(groupByChatId.keys()), includeMetadata: false })
          : Promise.resolve([]),
      ]);

      const results = [
        ...characterEntries.map((item) => mapChatSearchToSessionSummary(item, avatarByName.get(item.character_name) ?? `${item.character_name}.png`)),
        ...groupEntries
          .map((item) => {
            const group = groupByChatId.get(stripJsonlSuffix(item.file_name));
            return group ? mapGroupSearchToSessionSummary(item, group) : null;
          })
          .filter((item): item is ChatSessionSummary => item !== null),
      ];

      results.sort((left, right) => Number(right.last_mes ?? 0) - Number(left.last_mes ?? 0));
      return results;
    },
    async getGroup(id: string): Promise<{ payload: ChatPayload; messages: ChatMessage[] }> {
      const payload = await loadCompleteGroupPayload(id);
      return { payload, messages: getChatMessages(payload) };
    },
    async saveGroup(id: string, payload: ChatPayload): Promise<{ ok: boolean }> {
      await withStagedText(`${normalizeChatFileName(id)}.jsonl`, payloadToJsonl(payload), (filePath) => (
        nativeBridge.commands.invokeRequired('save_group_chat_from_file', {
          dto: {
            id: normalizeChatFileName(id),
            file_path: filePath,
            force: true,
          },
        })
      ));
      return { ok: true };
    },
    async deleteGroup(id: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_group_chat', { dto: { id: normalizeChatFileName(id) } });
      return { ok: true };
    },
    async renameGroup(oldFileName: string, newFileName: string): Promise<Record<string, unknown>> {
      await nativeBridge.commands.invokeRequired('rename_group_chat', {
        dto: {
          old_file_name: normalizeChatFileName(oldFileName),
          new_file_name: normalizeChatFileName(newFileName),
        },
      });
      return { ok: true, sanitizedFileName: normalizeChatFileName(newFileName) };
    },
    async exportGroup(fileName: string, format: 'txt' | 'jsonl' = 'txt'): Promise<void> {
      const result = await coreApiClient.chats.getGroup(fileName);
      const content = format === 'jsonl' ? payloadToJsonl(result.payload) : payloadToPlainText(result.payload);
      await saveExportText(content, buildChatExportFileName(fileName, format));
    },
    async importGroup(file: File): Promise<Record<string, unknown>> {
      const result = await withStagedFile(file, (filePath) => nativeBridge.commands.invokeRequired<string>('import_group_chat_payload', {
        dto: { file_path: filePath },
      }));
      return { res: result };
    },
    async recent(max = 10): Promise<ChatListItem[]> {
      const [characters, groups] = await Promise.all([
        nativeBridge.commands.invokeRequired<CharacterSummary[]>('get_all_characters', { shallow: true }),
        nativeBridge.commands.invokeRequired<GroupSummaryDto[]>('get_all_groups'),
      ]);
      const avatarByName = new Map(characters.map((character) => [String(character.name ?? ''), String(character.avatar ?? `${character.name}.png`)]));
      const groupByChatId = new Map<string, GroupSummaryDto>();
      for (const group of groups) {
        for (const chatId of group.chats ?? []) {
          groupByChatId.set(stripJsonlSuffix(String(chatId)), group);
        }
      }

      const [characterEntries, groupEntries] = await Promise.all([
        nativeBridge.commands.invokeRequired<ChatSearchResultDto[]>('list_recent_chat_summaries', {
          includeMetadata: false,
          maxEntries: max,
          pinned: [],
        }),
        groupByChatId.size > 0
          ? nativeBridge.commands.invokeRequired<ChatSearchResultDto[]>('list_recent_group_chat_summaries', {
            chatIds: Array.from(groupByChatId.keys()),
            includeMetadata: false,
            maxEntries: max,
            pinned: [],
          })
          : Promise.resolve([]),
      ]);

      const items = [
        ...characterEntries.map((item) => mapChatSearchToRecentItem(item, avatarByName.get(item.character_name) ?? `${item.character_name}.png`)),
        ...groupEntries
          .map((item) => {
            const group = groupByChatId.get(stripJsonlSuffix(item.file_name));
            return group ? mapGroupSearchToRecentItem(item, group.id) : null;
          })
          .filter((item): item is ChatListItem => item !== null),
      ];

      items.sort((left, right) => Number(right.last_mes ?? 0) - Number(left.last_mes ?? 0));
      return items.slice(0, Math.max(0, max));
    },
    createEmpty(characterName: string, userName: string): ChatPayload {
      return [createChatHeader(characterName, userName)];
    },
  },
  assets: {
    async backgrounds(): Promise<BackgroundList> {
      const images = await nativeBridge.commands.invokeRequired<string[]>('get_all_backgrounds');
      return backgroundListSchema.parse({ images, config: {} });
    },
    avatars(): Promise<string[]> {
      return nativeBridge.commands.invokeRequired<string[]>('get_avatars');
    },
    async deleteAvatar(avatar: string): Promise<{ result?: string; ok?: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_avatar', { avatar });
      return { ok: true };
    },
    async uploadAvatar(file: File): Promise<Record<string, unknown>> {
      return await withStagedFile(file, (filePath) => nativeBridge.commands.invokeRequired<Record<string, unknown>>('upload_avatar', {
        filePath,
        overwriteName: null,
        crop: null,
      }));
    },
    async uploadBackground(file: File): Promise<string> {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return nativeBridge.commands.invokeRequired<string>('upload_background', {
        filename: file.name,
        data: Array.from(bytes),
      });
    },
    async deleteBackground(name: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_background', { dto: { bg: name } });
      return { ok: true };
    },
    async renameBackground(oldName: string, newName: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('rename_background', {
        dto: {
          old_bg: oldName,
          new_bg: newName,
        },
      });
      return { ok: true };
    },
    async deleteTheme(name: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_theme', { dto: { name } });
      return { ok: true };
    },
    async saveTheme(theme: Theme & Record<string, unknown>): Promise<{ ok: boolean }> {
      const { name, ...data } = theme;
      await nativeBridge.commands.invokeRequired('save_theme', {
        dto: {
          ...data,
          name: String(name ?? ''),
        },
      });
      return { ok: true };
    },
  },
  worldInfo: {
    get(name: string): Promise<WorldInfoRecord> {
      return nativeBridge.commands.invokeRequired('get_world_info', { dto: { name } }) as Promise<WorldInfoRecord>;
    },
    async save(name: string, data: Record<string, unknown>): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('save_world_info', { dto: { name, data } });
      return { ok: true };
    },
    async delete(name: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_world_info', { dto: { name } });
      return { ok: true };
    },
    async import(file: File): Promise<Record<string, unknown>> {
      return await withStagedFile(file, (filePath) => nativeBridge.commands.invokeRequired<Record<string, unknown>>('import_world_info', {
        dto: {
          file_path: filePath,
          original_filename: file.name,
          converted_data: null,
        },
      }));
    },
  },
  generation: {
    async prepareRequest(input: {
      payload: ChatPayload;
      mode: 'reply' | 'regenerate' | 'continue';
      targetMessageIndex?: number;
      fallbackDraft: ChatProviderDraft;
      userName: string;
      assistantName: string;
      character?: Record<string, unknown> | null;
      group?: Record<string, unknown> | null;
      multiplayerParticipants?: Array<Record<string, unknown>>;
      hydrated?: boolean;
      totalMessages?: number;
      startIndex?: number;
    }): Promise<{
      request: GenerationRequest | null;
      presetDraft: Record<string, unknown> | null;
      normalizedBindings: SessionBindings | null;
      issues: Array<{
        code: string;
        severity: 'blocking' | 'warning';
        details?: string[];
      }>;
      notices: Array<{
        code: string;
        tone: string;
        title: string | null;
        description: string | null;
      }>;
      promptStatus: {
        inherited: boolean;
        migrated: boolean;
        migratedMap: boolean;
        repaired: boolean;
        stats: {
          renamed: number;
          generated: number;
          removedOrder: number;
          addedOrder: number;
        };
      };
      requestStatus: {
        removed: string[];
        streamAdjusted: boolean;
      };
      usage: {
        model: string;
        promptTokens: number;
        maxContextTokens: number;
        remainingContextTokens: number;
        usageRatio: number;
        withinLimit: boolean;
      } | null;
      presetName: string | null;
      presetRestoredDefault: boolean;
    }> {
      const payloadDto = await nativeBridge.commands.invokeRequired<PrepareGenerationResponseDto>('prepare_generation', {
        dto: {
          payload: input.payload,
          mode: input.mode,
          target_message_index: input.targetMessageIndex,
          fallback_draft: input.fallbackDraft,
          user_name: input.userName,
          assistant_name: input.assistantName,
          character: input.character ?? null,
          group: input.group ?? null,
          multiplayer_participants: input.multiplayerParticipants ?? [],
          hydrated: input.hydrated ?? false,
          total_messages: input.totalMessages,
          start_index: input.startIndex,
        },
      });

      return {
        request: payloadDto.request == null ? null : generationRequestSchema.parse(payloadDto.request),
        presetDraft: payloadDto.preset_draft ? asRecord(payloadDto.preset_draft) : null,
        normalizedBindings: payloadDto.normalized_bindings ? sessionBindingsSchema.parse(payloadDto.normalized_bindings) : null,
        issues: Array.isArray(payloadDto.issues)
          ? payloadDto.issues
            .map((issue) => ({
              code: String(issue.code ?? ''),
              severity: String(issue.severity ?? '') as 'blocking' | 'warning',
              details: Array.isArray(issue.details) ? issue.details.map((item) => String(item ?? '')).filter(Boolean) : undefined,
            }))
            .filter((issue) => issue.code && (issue.severity === 'blocking' || issue.severity === 'warning'))
          : [],
        notices: Array.isArray(payloadDto.notices)
          ? payloadDto.notices.map((notice) => ({
            code: String(notice.code ?? ''),
            tone: String(notice.tone ?? ''),
            title: typeof notice.title === 'string' ? notice.title : null,
            description: typeof notice.description === 'string' ? notice.description : null,
          })).filter((notice) => notice.code)
          : [],
        promptStatus: {
          inherited: Boolean(payloadDto.prompt_status?.inherited),
          migrated: Boolean(payloadDto.prompt_status?.migrated),
          migratedMap: Boolean(payloadDto.prompt_status?.migrated_map),
          repaired: Boolean(payloadDto.prompt_status?.repaired),
          stats: {
            renamed: Number(payloadDto.prompt_status?.stats?.renamed ?? 0),
            generated: Number(payloadDto.prompt_status?.stats?.generated ?? 0),
            removedOrder: Number(payloadDto.prompt_status?.stats?.removed_order ?? 0),
            addedOrder: Number(payloadDto.prompt_status?.stats?.added_order ?? 0),
          },
        },
        requestStatus: {
          removed: Array.isArray(payloadDto.request_status?.removed)
            ? payloadDto.request_status!.removed.map((item) => String(item ?? '')).filter(Boolean)
            : [],
          streamAdjusted: Boolean(payloadDto.request_status?.stream_adjusted),
        },
        usage: payloadDto.usage && typeof payloadDto.usage === 'object'
          ? {
              model: typeof payloadDto.usage.model === 'string' ? payloadDto.usage.model : '',
              promptTokens: Number(payloadDto.usage.prompt_tokens ?? 0),
              maxContextTokens: Number(payloadDto.usage.max_context_tokens ?? 0),
              remainingContextTokens: Number(payloadDto.usage.remaining_context_tokens ?? 0),
              usageRatio: Number.isFinite(Number(payloadDto.usage.usage_ratio ?? 0)) ? Number(payloadDto.usage.usage_ratio ?? 0) : 0,
              withinLimit: Boolean(payloadDto.usage.within_limit),
            }
          : null,
        presetName: typeof payloadDto.preset_name === 'string' && payloadDto.preset_name.trim() ? payloadDto.preset_name : null,
        presetRestoredDefault: Boolean(payloadDto.preset_restored_default),
      };
    },
    async projectDisplay(input: {
      payload: ChatPayload;
      presetDraft?: Record<string, unknown> | null;
      startIndex?: number;
      totalMessages?: number;
      targetMessageIndex?: number;
      persistCanonical?: boolean;
      sourceTextOverride?: string | null;
      reason?: 'default' | 'edit';
      userName: string;
      assistantName: string;
      groupName?: string | null;
      isGroup?: boolean;
    }): Promise<ChatPayload> {
      const payloadDto = await nativeBridge.commands.invokeRequired<ProjectChatDisplayDto>('project_chat_display', {
        dto: {
          payload: input.payload,
          preset_draft: input.presetDraft ?? null,
          start_index: input.startIndex,
          total_messages: input.totalMessages,
          target_message_index: input.targetMessageIndex,
          persist_canonical: input.persistCanonical ?? false,
          source_text_override: input.sourceTextOverride ?? null,
          reason: input.reason ?? 'default',
          user_name: input.userName,
          assistant_name: input.assistantName,
          group_name: input.groupName ?? null,
          is_group: input.isGroup ?? false,
        },
      });

      if (!Array.isArray(payloadDto.payload)) {
        throw new Error('Invalid projected chat payload');
      }
      return payloadDto.payload as ChatPayload;
    },
    listModels(source: string, options?: { reverse_proxy?: string; proxy_password?: string; custom_url?: string; custom_include_headers?: string; bypass_status_check?: boolean }): Promise<Record<string, unknown>> {
      return nativeBridge.chatCompletion.getStatus({
        chat_completion_source: source,
        reverse_proxy: options?.reverse_proxy ?? '',
        proxy_password: options?.proxy_password ?? '',
        custom_url: options?.custom_url ?? '',
        custom_include_headers: options?.custom_include_headers ?? '',
        bypass_status_check: options?.bypass_status_check ?? false,
      });
    },
    async generate(request: GenerationRequest, signal?: AbortSignal): Promise<Record<string, unknown>> {
      const requestId = createStreamId();

      if (signal?.aborted) {
        throw new Error('Generation aborted');
      }

      const abortHandler = () => {
        void nativeBridge.chatCompletion.cancelGeneration(requestId).catch(() => undefined);
      };

      signal?.addEventListener('abort', abortHandler, { once: true });
      try {
        return await nativeBridge.chatCompletion.generate(request as unknown as Record<string, unknown>, requestId);
      } finally {
        signal?.removeEventListener('abort', abortHandler);
      }
    },
    async stream(request: GenerationRequest, onChunk: (chunk: Record<string, unknown>) => void, signal?: AbortSignal): Promise<void> {
      const streamId = createStreamId();
      let unlisten: (() => void) | null = null;
      let settled = false;

      await new Promise<void>(async (resolve, reject) => {
        const finish = (error?: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          if (unlisten) {
            unlisten();
            unlisten = null;
          }
          signal?.removeEventListener('abort', abortHandler);
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };

        const abortHandler = () => {
          void nativeBridge.chatCompletion.cancelStream(streamId).catch(() => undefined);
          finish(new Error('Generation aborted'));
        };

        if (signal?.aborted) {
          abortHandler();
          return;
        }

        try {
          unlisten = await nativeBridge.chatCompletion.listenStream(streamId, (event) => {
            if (event.type === 'chunk') {
              onChunk(JSON.parse(event.data) as Record<string, unknown>);
              return;
            }

            if (event.type === 'done') {
              finish();
              return;
            }

            finish(new Error(event.message));
          });
          signal?.addEventListener('abort', abortHandler, { once: true });
          await nativeBridge.chatCompletion.startStream(streamId, request as unknown as Record<string, unknown>);
        } catch (error) {
          finish(error);
        }
      });
    },
  },
  workbench: {
    async backups(): Promise<Record<string, unknown>[]> {
      const payload = await nativeBridge.commands.invokeRequired<BackupDto[]>('list_chat_backups');
      return payload.map((item) => ({
        name: item.file_name,
        size: item.file_size ?? 0,
        modified: item.date ?? 0,
      }));
    },
    async deleteBackup(name: string): Promise<{ ok: boolean }> {
      await nativeBridge.commands.invokeRequired('delete_chat_backup', { name });
      return { ok: true };
    },
    async downloadBackup(name: string): Promise<void> {
      const payload = await nativeBridge.commands.invokeRequired<unknown>('get_chat_backup_raw', { name });
      await saveExportBytes(asUint8Array(payload), name);
    },
    stats(): Promise<Record<string, unknown>> {
      return nativeBridge.commands.invokeRequired<Record<string, unknown>>('get_workbench_stats');
    },
    async extensions(): Promise<Record<string, unknown>[]> {
      const payload = await nativeBridge.commands.invokeRequired<unknown[]>('get_extensions');
      return parseArray(extensionSchema, payload);
    },
  },
  debug: {
    async log(message: string, detail?: Record<string, unknown>): Promise<void> {
      try {
        await nativeBridge.commands.invokeRequired('log_frontend_event', { message, detail: detail ?? null });
      } catch {
        return;
      }
    },
  },
};
