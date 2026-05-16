import { z } from 'zod';

const looseObjectSchema = z.object({}).catchall(z.unknown());
const recordSchema = z.record(z.string(), z.unknown());

export const providerSourceValues = ['openai', 'openrouter', 'custom', 'claude', 'makersuite', 'deepseek', 'moonshot', 'siliconflow', 'zai'] as const;
export const providerSourceSchema = z.enum(providerSourceValues);
export const presetApiIdValues = ['kobold', 'novel', 'openai', 'textgenerationwebui', 'instruct', 'context', 'sysprompt', 'reasoning'] as const;
export const presetApiIdSchema = z.enum(presetApiIdValues);
export const chatSessionSourceValues = ['character', 'group'] as const;
export const chatSessionFilterValues = ['all', 'character', 'group'] as const;
export const sessionModeValues = ['single', 'multiplayer'] as const;
export const rendererBindingModeValues = ['inherit', 'override'] as const;
export const rendererModeValues = ['native', 'host-v1', 'iframe-dev-v1'] as const;
export const rendererTargetValues = ['desktop', 'android'] as const;
export const rendererActionTypeValues = ['send', 'edit', 'delete', 'withdraw', 'regenerate', 'continue', 'load_more_before', 'stop', 'open_session_menu'] as const;
export const mobileEffectPolicyValues = ['adaptive'] as const;
export const regexAffectTargetValues = ['canonical', 'display', 'prompt'] as const;
export const regexEphemeralityModeValues = ['persistent', 'display-only', 'prompt-only', 'display-and-prompt'] as const;
export const presetRegexSourceKindValues = ['top-level', 'extras', 'spresetsettings'] as const;
export const messageRenderBlockKindValues = ['text', 'code'] as const;
export const messageRenderPreviewKindValues = ['html', 'css', 'svg', 'javascript'] as const;
export const chatSessionSourceSchema = z.enum(chatSessionSourceValues);
export const chatSessionFilterSchema = z.enum(chatSessionFilterValues);
export const sessionModeSchema = z.enum(sessionModeValues);
export const rendererBindingModeSchema = z.enum(rendererBindingModeValues);
export const rendererModeSchema = z.enum(rendererModeValues);
export const rendererTargetSchema = z.enum(rendererTargetValues);
export const rendererActionTypeSchema = z.enum(rendererActionTypeValues);
export const mobileEffectPolicySchema = z.enum(mobileEffectPolicyValues);
export const regexAffectTargetSchema = z.enum(regexAffectTargetValues);
export const regexEphemeralityModeSchema = z.enum(regexEphemeralityModeValues);
export const presetRegexSourceKindSchema = z.enum(presetRegexSourceKindValues);
export const messageRenderBlockKindSchema = z.enum(messageRenderBlockKindValues);
export const messageRenderPreviewKindSchema = z.enum(messageRenderPreviewKindValues);

export const swipeInfoSchema = looseObjectSchema;

export const messageRenderBlockSchema = z.object({
  kind: messageRenderBlockKindSchema.default('text'),
  content: z.string().default(''),
  language: z.string().optional().default(''),
  interactive: z.boolean().optional().default(false),
  preview_kind: messageRenderPreviewKindSchema.optional(),
  preview_hash: z.string().optional().default(''),
}).passthrough();

export const chatMessageExtraSchema = z.object({
  api: z.string().optional(),
  model: z.string().optional(),
  reasoning: z.string().optional(),
  reasoning_duration: z.number().optional(),
  reasoning_display_text: z.string().optional(),
  display_text: z.string().optional(),
  source_response_text: z.string().optional(),
  regex_display_text: z.string().optional(),
  regex_prompt_text: z.string().optional(),
  regex_preset_hash: z.string().optional(),
  regex_applied_rule_ids: z.array(z.string()).optional(),
  render_blocks: z.array(messageRenderBlockSchema).optional(),
  render_has_interactive_code: z.boolean().optional(),
}).catchall(z.unknown());

export const chatProviderPersistedSettingsSchema = z.object({
  chat_completion_source: providerSourceSchema.optional().default('openai'),
  openai_model: z.string().optional().default(''),
  openrouter_model: z.string().optional().default(''),
  claude_model: z.string().optional().default(''),
  google_model: z.string().optional().default(''),
  deepseek_model: z.string().optional().default(''),
  moonshot_model: z.string().optional().default(''),
  siliconflow_model: z.string().optional().default(''),
  zai_model: z.string().optional().default(''),
  custom_model: z.string().optional().default(''),
  reverse_proxy: z.string().optional().default(''),
  proxy_password: z.string().optional().default(''),
  custom_url: z.string().optional().default(''),
  custom_include_headers: z.string().optional().default(''),
  custom_include_body: z.string().optional().default(''),
  custom_exclude_body: z.string().optional().default(''),
  openai_max_context: z.preprocess(
    (value) => (typeof value === 'number' ? String(value) : value),
    z.string().optional().default(''),
  ),
  bypass_status_check: z.boolean().optional().default(false),
}).passthrough();

export const chatProviderDraftSchema = chatProviderPersistedSettingsSchema.extend({
  chat_completion_source: providerSourceSchema.default('openai'),
  model: z.string().default(''),
}).passthrough();

export const apiProfileSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  settings: chatProviderPersistedSettingsSchema.optional().default({}),
  updated_at: z.string().optional().default(''),
}).passthrough();

export const sessionPresetRefSchema = z.object({
  api_id: z.literal('openai').default('openai'),
  name: z.string().default(''),
});

export const sessionBindingsSchema = z.object({
  world_info_names: z.array(z.string()).optional().default([]),
  preset_ref: sessionPresetRefSchema.nullable().optional().default(null),
  api_profile_id: z.string().nullable().optional().default(null),
});

export const sessionRendererBindingSchema = z.object({
  mode: rendererBindingModeSchema.default('inherit'),
  renderer_id: z.string().nullable().optional().default(null),
}).passthrough();

export const multiplayerSessionMetaSchema = z.object({
  created_from: z.object({
    scope: z.literal('character').default('character'),
    scope_id: z.string().default(''),
    file_name: z.string().default(''),
  }).nullable().optional().default(null),
  transcript_mode: z.literal('player-bubbles-host-concat-v1').default('player-bubbles-host-concat-v1'),
}).passthrough();

export const tauriTavernSessionStateSchema = z.object({
  version: z.literal(1).default(1),
  mode: sessionModeSchema.default('single'),
  bindings: sessionBindingsSchema.optional().default({}),
  renderer: sessionRendererBindingSchema.optional().default({}),
  multiplayer: multiplayerSessionMetaSchema.nullable().optional().default(null),
});

export const uiRendererSettingsSchema = z.object({
  default_renderer_id: z.string().nullable().optional().default(null),
  iframe_dev_mode_enabled: z.boolean().optional().default(false),
  mobile_effect_policy: mobileEffectPolicySchema.optional().default('adaptive'),
}).passthrough();

export const rendererSettingsSchema = z.object({
  renderer: uiRendererSettingsSchema.optional().default({}),
}).passthrough();

export const chatPayloadCursorSchema = z.object({
  offset: z.number().nonnegative(),
  size: z.number().nonnegative(),
  modifiedMillis: z.number(),
  startIndex: z.number().nonnegative().optional(),
  totalMessages: z.number().nonnegative().optional(),
});

export const chatPayloadPatchSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('append'),
    lines: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal('rewriteFromIndex'),
    startIndex: z.number().nonnegative(),
    lines: z.array(z.string()).default([]),
  }),
]);

export const rendererManifestSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  version: z.string().default(''),
  mode: rendererModeSchema,
  targets: z.array(rendererTargetSchema).optional().default([]),
  min_app_version: z.string().optional().default(''),
  root_path: z.string().optional().default(''),
  entry: z.string().optional().default(''),
  entry_asset_path: z.string().optional().default(''),
  stylesheet: z.string().optional().default(''),
  stylesheet_asset_path: z.string().optional().default(''),
  capabilities: z.array(rendererActionTypeSchema).optional().default([]),
  host: looseObjectSchema.optional().default({}),
  iframe: looseObjectSchema.optional().default({}),
}).passthrough();

export const presetRegexScriptSchema = z.object({
  id: z.string().default(''),
  scriptName: z.string().default(''),
  findRegex: z.string().default(''),
  replaceString: z.string().default(''),
  trimStrings: z.array(z.string()).optional().default([]),
  placement: z.array(z.number()).optional().default([]),
  disabled: z.boolean().optional().default(false),
  markdownOnly: z.boolean().optional().default(false),
  promptOnly: z.boolean().optional().default(false),
  runOnEdit: z.boolean().optional().default(false),
  substituteRegex: z.union([z.number(), z.string()]).optional().default(0),
  minDepth: z.number().nullable().optional().default(null),
  maxDepth: z.number().nullable().optional().default(null),
  source_kind: presetRegexSourceKindSchema.optional(),
}).passthrough();

export const compiledPresetRegexScriptSchema = presetRegexScriptSchema.extend({
  affectTargets: z.array(regexAffectTargetSchema).optional().default([]),
  ephemerality: regexEphemeralityModeSchema.default('persistent'),
  presetHash: z.string().default(''),
}).passthrough();

export const tokenUsageSchema = z.object({
  model: z.string().default(''),
  promptTokens: z.number().nonnegative().default(0),
  maxContextTokens: z.number().nonnegative().default(0),
  remainingContextTokens: z.number().nonnegative().default(0),
  usageRatio: z.number().default(0),
  withinLimit: z.boolean().default(true),
}).passthrough();

export const rendererTokenUsageSchema = z.object({
  model: z.string().default(''),
  prompt_tokens: z.number().nonnegative().default(0),
  max_context_tokens: z.number().nonnegative().default(0),
  remaining_context_tokens: z.number().nonnegative().default(0),
  usage_ratio: z.number().default(0),
  within_limit: z.boolean().default(true),
}).passthrough();

export const rendererMessageVmSchema = z.object({
  index: z.number().nonnegative(),
  id: z.string().default(''),
  role: z.enum(['user', 'assistant', 'system']).default('assistant'),
  name: z.string().default(''),
  content: z.string().default(''),
  raw_content: z.string().default(''),
  source_content: z.string().default(''),
  reasoning: z.string().nullable().optional().default(null),
  reasoning_display_text: z.string().nullable().optional().default(null),
  render_blocks: z.array(messageRenderBlockSchema).nullable().optional().default(null),
  render_has_interactive_code: z.boolean().optional().default(false),
  allow_interactive_preview: z.boolean().optional().default(true),
  pending: z.boolean().optional().default(false),
  send_date: z.string().optional().default(''),
}).passthrough();

export const rendererWorkspaceVmSchema = z.object({
  session_key: z.string().default(''),
  session_title: z.string().default(''),
  layout: rendererTargetSchema.default('desktop'),
  busy: z.boolean().optional().default(false),
  can_load_more_before: z.boolean().optional().default(false),
  loading_more_before: z.boolean().optional().default(false),
  can_send: z.boolean().optional().default(true),
  can_stop: z.boolean().optional().default(false),
  token_usage: rendererTokenUsageSchema.nullable().optional().default(null),
  messages: z.array(rendererMessageVmSchema).optional().default([]),
  effect_policy: looseObjectSchema.optional().default({}),
}).passthrough();

export const rendererActionSchema = z.object({
  type: rendererActionTypeSchema,
  message_index: z.number().nonnegative().optional(),
  content: z.string().optional(),
}).passthrough();

export const multiplayerMessageMetaSchema = z.object({
  kind: z.literal('room_player_message').default('room_player_message'),
  room_round_id: z.string().default(''),
  participant_id: z.string().default(''),
  nickname: z.string().default(''),
  pending: z.boolean().optional().default(false),
  contribution_id: z.string().optional().default(''),
  seq: z.number().optional().default(0),
}).passthrough();

export const characterSummarySchema = z.object({
  name: z.string().default(''),
  avatar: z.string().default(''),
  description: z.string().optional().default(''),
  personality: z.string().optional().default(''),
  scenario: z.string().optional().default(''),
  first_mes: z.string().optional().default(''),
  tags: z.array(z.unknown()).optional().default([]),
  fav: z.boolean().optional().default(false),
}).passthrough();

export const characterDetailSchema = characterSummarySchema.extend({
  mes_example: z.string().optional().default(''),
  creator: z.string().optional().default(''),
  creator_notes: z.string().optional().default(''),
  character_version: z.string().optional().default(''),
  system_prompt: z.string().optional().default(''),
  post_history_instructions: z.string().optional().default(''),
  talkativeness: z.number().optional().default(0.5),
  alternate_greetings: z.array(z.string()).optional().default([]),
  extensions: recordSchema.optional().default({}),
}).passthrough();

export const chatListItemSchema = z.object({
  file_name: z.string().default(''),
  file_size: z.union([z.string(), z.number()]).optional().default(''),
  chat_items: z.number().optional(),
  message_count: z.number().optional().default(0),
  preview_message: z.string().optional().default(''),
  last_message: z.string().optional(),
  last_mes: z.union([z.string(), z.number()]).optional().default(''),
}).passthrough();

export const chatSessionSummarySchema = z.object({
  source_type: chatSessionSourceSchema,
  scope_id: z.string().default(''),
  scope_name: z.string().default(''),
  file_name: z.string().default(''),
  preview_message: z.string().default(''),
  last_mes: z.union([z.string(), z.number()]).optional().default(''),
  message_count: z.number().default(0),
  session_mode: sessionModeSchema.default('single'),
  avatar: z.string().optional().default(''),
  group_id: z.string().optional().default(''),
}).passthrough();

export const chatMessageSchema = z.object({
  name: z.string().default(''),
  is_user: z.boolean().optional().default(false),
  is_system: z.boolean().optional().default(false),
  send_date: z.string().optional().default(''),
  mes: z.string().optional().default(''),
  extra: chatMessageExtraSchema.optional().default({}),
  swipe_id: z.number().optional(),
  swipes: z.array(z.string()).optional(),
  swipe_info: z.array(swipeInfoSchema).optional(),
}).passthrough();

export const chatHeaderSchema = z.object({
  user_name: z.string().optional().default(''),
  character_name: z.string().optional().default(''),
  create_date: z.string().optional().default(''),
  chat_metadata: looseObjectSchema.optional().default({}),
}).passthrough();

export const chatPayloadSchema = z.array(looseObjectSchema);

export const groupSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  avatar_url: z.string().nullable().optional().default(null),
  members: z.array(z.string()).optional().default([]),
  chats: z.array(z.string()).optional().default([]),
  fav: z.boolean().optional().default(false),
  chat_id: z.string().optional().default(''),
}).passthrough();

export const themeSchema = z.object({
  name: z.string().default(''),
}).passthrough();

export const settingsSchema = z.object({
  name1: z.string().optional().default('You'),
  world_names: z.array(z.string()).optional().default([]),
  themes: z.array(themeSchema).optional().default([]),
  oai_settings: chatProviderPersistedSettingsSchema.optional(),
  api_profiles: z.array(apiProfileSchema).optional().default([]),
  tauritavern: z.object({
    ui: rendererSettingsSchema.optional().default({}),
  }).optional().default({ ui: { renderer: {} } }),
}).passthrough();

export const snapshotSchema = z.object({
  name: z.string().default(''),
  created_at: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export const secretStateSchema = recordSchema;
export const secretsViewSchema = recordSchema;

export const backgroundListSchema = z.object({
  images: z.array(z.string()).optional().default([]),
  config: recordSchema.optional().default({}),
});

export const avatarSchema = z.string();

export const worldInfoSchema = z.object({
  entries: recordSchema.optional().default({}),
}).passthrough();

export const generationMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

export const generationRequestSchema = z.object({
  chat_completion_source: providerSourceSchema,
  model: z.string(),
  stream: z.boolean().default(true),
  messages: z.array(generationMessageSchema),
  reverse_proxy: z.string().optional().default(''),
  proxy_password: z.string().optional().default(''),
  custom_url: z.string().optional().default(''),
  custom_include_headers: z.string().optional().default(''),
  custom_include_body: z.string().optional().default(''),
  custom_exclude_body: z.string().optional().default(''),
  bypass_status_check: z.boolean().optional().default(false),
}).passthrough();

export const backupSchema = z.object({
  name: z.string().default(''),
  size: z.union([z.string(), z.number()]).optional(),
  modified: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export const statsSchema = recordSchema;
export const extensionSchema = z.object({
  name: z.string().optional().default(''),
  display_name: z.string().optional().default(''),
  version: z.string().optional().default(''),
}).passthrough();

export type ProviderSource = z.infer<typeof providerSourceSchema>;
export type PresetApiId = z.infer<typeof presetApiIdSchema>;
export type ChatSessionSource = z.infer<typeof chatSessionSourceSchema>;
export type ChatSessionFilter = z.infer<typeof chatSessionFilterSchema>;
export type SessionMode = z.infer<typeof sessionModeSchema>;
export type RendererBindingMode = z.infer<typeof rendererBindingModeSchema>;
export type RendererMode = z.infer<typeof rendererModeSchema>;
export type RendererTarget = z.infer<typeof rendererTargetSchema>;
export type RendererActionType = z.infer<typeof rendererActionTypeSchema>;
export type MobileEffectPolicy = z.infer<typeof mobileEffectPolicySchema>;
export type RegexAffectTarget = z.infer<typeof regexAffectTargetSchema>;
export type RegexEphemeralityMode = z.infer<typeof regexEphemeralityModeSchema>;
export type MessageRenderBlockKind = z.infer<typeof messageRenderBlockKindSchema>;
export type MessageRenderPreviewKind = z.infer<typeof messageRenderPreviewKindSchema>;
export type SwipeInfo = z.infer<typeof swipeInfoSchema>;
export type MessageRenderBlock = z.infer<typeof messageRenderBlockSchema>;
export type ChatMessageExtra = z.infer<typeof chatMessageExtraSchema>;
export type ChatProviderPersistedSettings = z.infer<typeof chatProviderPersistedSettingsSchema>;
export type ChatProviderDraft = z.infer<typeof chatProviderDraftSchema>;
export type ApiProfile = z.infer<typeof apiProfileSchema>;
export type SessionPresetRef = z.infer<typeof sessionPresetRefSchema>;
export type SessionBindings = z.infer<typeof sessionBindingsSchema>;
export type SessionRendererBinding = z.infer<typeof sessionRendererBindingSchema>;
export type MultiplayerSessionMeta = z.infer<typeof multiplayerSessionMetaSchema>;
export type TauriTavernSessionState = z.infer<typeof tauriTavernSessionStateSchema>;
export type UiRendererSettings = z.infer<typeof uiRendererSettingsSchema>;
export type RendererSettings = z.infer<typeof rendererSettingsSchema>;
export type ChatPayloadCursor = z.infer<typeof chatPayloadCursorSchema>;
export type ChatPayloadPatch = z.infer<typeof chatPayloadPatchSchema>;
export type RendererManifest = z.infer<typeof rendererManifestSchema>;
export type PresetRegexScript = z.infer<typeof presetRegexScriptSchema>;
export type CompiledPresetRegexScript = z.infer<typeof compiledPresetRegexScriptSchema>;
export type PresetRegexSourceKind = z.infer<typeof presetRegexSourceKindSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type RendererTokenUsage = z.infer<typeof rendererTokenUsageSchema>;
export type RendererMessageVm = z.infer<typeof rendererMessageVmSchema>;
export type RendererWorkspaceVm = z.infer<typeof rendererWorkspaceVmSchema>;
export type RendererAction = z.infer<typeof rendererActionSchema>;
export type MultiplayerMessageMeta = z.infer<typeof multiplayerMessageMetaSchema>;
export type CharacterSummary = z.infer<typeof characterSummarySchema>;
export type CharacterDetail = z.infer<typeof characterDetailSchema>;
export type ChatListItem = z.infer<typeof chatListItemSchema>;
export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatHeader = z.infer<typeof chatHeaderSchema>;
export type ChatPayload = z.infer<typeof chatPayloadSchema>;
export type Group = z.infer<typeof groupSchema>;
export type AppSettings = z.infer<typeof settingsSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type SecretState = z.infer<typeof secretStateSchema>;
export type BackgroundList = z.infer<typeof backgroundListSchema>;
export type WorldInfoRecord = z.infer<typeof worldInfoSchema>;
export type Theme = z.infer<typeof themeSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type BackupRecord = z.infer<typeof backupSchema>;

export function parseArray<TSchema extends z.ZodTypeAny>(schema: TSchema, input: unknown): z.output<TSchema>[] {
  return z.array(schema).parse(input);
}

export function parseChatPayload(input: unknown): ChatPayload {
  return chatPayloadSchema.parse(input);
}

export function getChatHeader(payload: ChatPayload): ChatHeader | null {
  const head = payload[0];
  if (!head || typeof head !== 'object' || Array.isArray(head)) {
    return null;
  }

  const parsed = chatHeaderSchema.safeParse(head);
  return parsed.success ? parsed.data : null;
}

export function getChatMessages(payload: ChatPayload): ChatMessage[] {
  return payload.slice(1)
    .map((item) => chatMessageSchema.safeParse(item))
    .filter((result): result is { success: true; data: ChatMessage } => result.success)
    .map((result) => result.data);
}
