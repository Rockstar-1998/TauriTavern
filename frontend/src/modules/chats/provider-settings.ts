import type { AppSettings, ChatProviderDraft, ChatProviderPersistedSettings, ProviderSource } from '@/types/domain';

export const PROVIDER_OPTIONS: Array<{ value: ProviderSource; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'makersuite', label: 'Gemini / MakerSuite' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'zai', label: 'Z.AI' },
];

const MODEL_KEY_BY_SOURCE = {
  openai: 'openai_model',
  openrouter: 'openrouter_model',
  custom: 'custom_model',
  claude: 'claude_model',
  makersuite: 'google_model',
  deepseek: 'deepseek_model',
  moonshot: 'moonshot_model',
  siliconflow: 'siliconflow_model',
  zai: 'zai_model',
} as const satisfies Record<ProviderSource, keyof ChatProviderPersistedSettings>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? String(record[key]) : '';
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return Boolean(record[key]);
}

function readPersistedSource(record: Record<string, unknown>): ProviderSource {
  const value = readString(record, 'chat_completion_source');
  return PROVIDER_OPTIONS.some((option) => option.value === value)
    ? (value as ProviderSource)
    : 'openai';
}

function getPersistedSourceRecord(settings: AppSettings | Record<string, unknown> | undefined): Record<string, unknown> {
  const root = asRecord(settings);
  const nested = asRecord(root.oai_settings);
  return Object.keys(nested).length > 0 ? nested : root;
}

export function getModelKeyForSource(source: ProviderSource): keyof ChatProviderPersistedSettings {
  return MODEL_KEY_BY_SOURCE[source];
}

export function getRememberedModel(draft: ChatProviderDraft, source = draft.chat_completion_source): string {
  return String(draft[getModelKeyForSource(source)] ?? '');
}

export function setProviderSource(draft: ChatProviderDraft, source: ProviderSource): ChatProviderDraft {
  const next = { ...draft, chat_completion_source: source };
  return {
    ...next,
    model: getRememberedModel(next, source),
  };
}

export function setProviderModel(draft: ChatProviderDraft, model: string): ChatProviderDraft {
  const key = getModelKeyForSource(draft.chat_completion_source);
  return {
    ...draft,
    model,
    [key]: model,
  };
}

export function readProviderSettings(settings: AppSettings | Record<string, unknown> | undefined): ChatProviderDraft {
  const persisted = getPersistedSourceRecord(settings);
  const chat_completion_source = readPersistedSource(persisted);

  const draft: ChatProviderDraft = {
    chat_completion_source,
    model: '',
    openai_model: readString(persisted, 'openai_model'),
    openrouter_model: readString(persisted, 'openrouter_model'),
    claude_model: readString(persisted, 'claude_model'),
    google_model: readString(persisted, 'google_model'),
    deepseek_model: readString(persisted, 'deepseek_model'),
    moonshot_model: readString(persisted, 'moonshot_model'),
    siliconflow_model: readString(persisted, 'siliconflow_model'),
    zai_model: readString(persisted, 'zai_model'),
    custom_model: readString(persisted, 'custom_model'),
    reverse_proxy: readString(persisted, 'reverse_proxy'),
    proxy_password: readString(persisted, 'proxy_password'),
    custom_url: readString(persisted, 'custom_url'),
    custom_include_headers: readString(persisted, 'custom_include_headers'),
    custom_include_body: readString(persisted, 'custom_include_body'),
    custom_exclude_body: readString(persisted, 'custom_exclude_body'),
    openai_max_context: readString(persisted, 'openai_max_context'),
    bypass_status_check: readBoolean(persisted, 'bypass_status_check'),
  };

  return {
    ...draft,
    model: getRememberedModel(draft, chat_completion_source),
  };
}

export function toPersistedProviderSettings(
  draft: ChatProviderDraft,
  existing?: Partial<ChatProviderPersistedSettings> | Record<string, unknown>,
): ChatProviderPersistedSettings {
  const normalizedDraft = setProviderModel(draft, draft.model);
  const base = asRecord(existing);

  return {
    ...base,
    chat_completion_source: normalizedDraft.chat_completion_source,
    openai_model: normalizedDraft.openai_model,
    openrouter_model: normalizedDraft.openrouter_model,
    claude_model: normalizedDraft.claude_model,
    google_model: normalizedDraft.google_model,
    deepseek_model: normalizedDraft.deepseek_model,
    moonshot_model: normalizedDraft.moonshot_model,
    siliconflow_model: normalizedDraft.siliconflow_model,
    zai_model: normalizedDraft.zai_model,
    custom_model: normalizedDraft.custom_model,
    reverse_proxy: normalizedDraft.reverse_proxy,
    proxy_password: normalizedDraft.proxy_password,
    custom_url: normalizedDraft.custom_url,
    custom_include_headers: normalizedDraft.custom_include_headers,
    custom_include_body: normalizedDraft.custom_include_body,
    custom_exclude_body: normalizedDraft.custom_exclude_body,
    openai_max_context: normalizedDraft.openai_max_context,
    bypass_status_check: normalizedDraft.bypass_status_check,
  };
}

export function writeProviderSettings(settings: AppSettings | Record<string, unknown>, draft: ChatProviderDraft): Record<string, unknown> {
  const root = asRecord(settings);
  const existing = asRecord(root.oai_settings);

  return {
    ...root,
    oai_settings: toPersistedProviderSettings(draft, existing),
  };
}

export function buildProviderRequestOptions(draft: ChatProviderDraft) {
  return {
    chat_completion_source: draft.chat_completion_source,
    model: draft.model,
    reverse_proxy: draft.reverse_proxy,
    proxy_password: draft.proxy_password,
    custom_url: draft.custom_url,
    custom_include_headers: draft.custom_include_headers,
    custom_include_body: draft.custom_include_body,
    custom_exclude_body: draft.custom_exclude_body,
    openai_max_context: draft.openai_max_context,
    bypass_status_check: draft.bypass_status_check,
  };
}