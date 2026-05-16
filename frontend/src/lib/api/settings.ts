import { settingsSchema, type AppSettings } from '@/types/domain';

type SillyTavernSettingsResponse = {
  settings?: unknown;
  world_names?: unknown;
  themes?: unknown;
};

const SETTINGS_PARSE_ERROR_PREFIX = '设置读取失败：';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseSettingsJson(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    throw new Error(`${SETTINGS_PARSE_ERROR_PREFIX}settings 不是有效 JSON${message ? ` (${message})` : ''}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${SETTINGS_PARSE_ERROR_PREFIX}settings 不是对象`);
  }

  return parsed;
}

export function parseSillyTavernSettingsPayload(payload: unknown): AppSettings {
  if (!isRecord(payload)) {
    throw new Error(`${SETTINGS_PARSE_ERROR_PREFIX}响应格式无效`);
  }

  const response = payload as SillyTavernSettingsResponse;
  if (typeof response.settings !== 'string') {
    throw new Error(`${SETTINGS_PARSE_ERROR_PREFIX}settings 字段缺失或不是字符串`);
  }

  const settingsData = parseSettingsJson(response.settings);
  const merged: Record<string, unknown> = { ...settingsData };

  if (response.world_names !== undefined) {
    merged.world_names = response.world_names;
  }
  if (response.themes !== undefined) {
    merged.themes = response.themes;
  }

  return settingsSchema.parse(merged);
}
