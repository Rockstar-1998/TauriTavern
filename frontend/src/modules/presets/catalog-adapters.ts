import type { PresetCatalogDefinition, PresetCatalogId, PresetFieldDefinition } from './registry';
import { getPresetCatalogDefinition, getPresetFieldDefinitions } from './registry';
import { mergeLegacyPromptFields } from './openai-prompt-manager';
import { materializePresetRegexScripts, resolvePresetRegexScripts } from '@/modules/chats/preset-regex';

export type PresetDraft = Record<string, unknown>;
export type PresetCatalogAdapter = {
  definition: PresetCatalogDefinition;
  createDefaultDraft(): PresetDraft;
  normalizeRestoredPreset(input: Record<string, unknown>): PresetDraft;
  serializePreset(input: Record<string, unknown>): Record<string, unknown>;
  readActiveName(settings: Record<string, unknown>): string | null;
  writeActiveName(settings: Record<string, unknown>, name: string): Record<string, unknown>;
  applyPresetDraftToSettings(settings: Record<string, unknown>, draft: Record<string, unknown>): Record<string, unknown>;
  readWorkspaceCompanion(settings: Record<string, unknown>): Record<string, unknown>;
  writeWorkspaceCompanion(settings: Record<string, unknown>, companion: Record<string, unknown>): Record<string, unknown>;
};

type AdapterConfig = {
  settingsPath: string[];
  activeNamePath: string[];
  includeNameInPreset: boolean;
};

const OPENAI_SENSITIVE_FIELD_KEYS = [
  'reverse_proxy',
  'proxy_password',
  'custom_url',
  'custom_include_body',
  'custom_exclude_body',
  'custom_include_headers',
  'vertexai_region',
  'vertexai_express_project_id',
  'azure_base_url',
  'azure_deployment_name',
  'azure_api_version',
  'bind_preset_to_connection',
] as const;

const adapterConfigs: Record<PresetCatalogId, AdapterConfig> = {
  openai: {
    settingsPath: ['oai_settings'],
    activeNamePath: ['oai_settings', 'preset_settings_openai'],
    includeNameInPreset: false,
  },
  kobold: {
    settingsPath: [],
    activeNamePath: ['preset_settings'],
    includeNameInPreset: false,
  },
  novel: {
    settingsPath: [],
    activeNamePath: ['preset_settings_novel'],
    includeNameInPreset: false,
  },
  textgenerationwebui: {
    settingsPath: [],
    activeNamePath: ['preset'],
    includeNameInPreset: false,
  },
  context: {
    settingsPath: ['power_user', 'context'],
    activeNamePath: ['power_user', 'context', 'preset'],
    includeNameInPreset: true,
  },
  instruct: {
    settingsPath: ['power_user', 'instruct'],
    activeNamePath: ['power_user', 'instruct', 'preset'],
    includeNameInPreset: true,
  },
  sysprompt: {
    settingsPath: ['power_user', 'sysprompt'],
    activeNamePath: ['power_user', 'sysprompt', 'name'],
    includeNameInPreset: true,
  },
  reasoning: {
    settingsPath: ['power_user', 'reasoning'],
    activeNamePath: ['power_user', 'reasoning', 'name'],
    includeNameInPreset: true,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON cloning below.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function readPath(source: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = source;
  for (const part of path) {
    cursor = asRecord(cursor)[part];
    if (cursor === undefined) {
      return undefined;
    }
  }
  return cursor;
}

function writePath(source: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  if (path.length === 0) {
    return deepClone(asRecord(value));
  }

  const next = deepClone(source);
  let cursor: Record<string, unknown> = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const child = asRecord(cursor[key]);
    cursor[key] = deepClone(child);
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = deepClone(value);
  return next;
}

function removeUndefinedEntries(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function fieldPath(config: AdapterConfig, field: PresetFieldDefinition): string[] {
  if (field.settingPath && field.settingPath.length > 0) {
    return field.settingPath;
  }
  return [...config.settingsPath, field.settingKey ?? field.id];
}

function presetFieldKey(field: PresetFieldDefinition): string {
  return field.presetKey ?? field.id;
}

function resolvePresetValue(source: Record<string, unknown>, field: PresetFieldDefinition): unknown {
  return Object.prototype.hasOwnProperty.call(source, field.id) ? source[field.id] : field.defaultValue;
}

function presetFields(definition: PresetCatalogDefinition): PresetFieldDefinition[] {
  return getPresetFieldDefinitions(definition).filter((field) => (field.scope ?? 'preset') === 'preset');
}

function companionFields(definition: PresetCatalogDefinition): PresetFieldDefinition[] {
  return getPresetFieldDefinitions(definition).filter((field) => (field.scope ?? 'preset') !== 'preset');
}

function convertNovelPreset(input: Record<string, unknown>): Record<string, unknown> {
  const parameters = asRecord(input.parameters);
  if (Number(input.presetVersion) !== 3 || Object.keys(parameters).length === 0) {
    return input;
  }

  const order = Array.isArray(parameters.order)
    ? parameters.order
      .filter((item) => asRecord(item).enabled && typeof asRecord(item).id === 'string')
      .map((item) => {
        const id = String(asRecord(item).id);
        const samplers: Record<string, number> = {
          temperature: 0,
          top_k: 1,
          top_p: 2,
          tfs: 3,
          top_a: 4,
          typical_p: 5,
          mirostat: 8,
          math1: 9,
          min_p: 10,
        };
        return samplers[id];
      })
      .filter((value) => value !== undefined)
    : [1, 5, 0, 2, 3, 4];

  return {
    max_context: 8000,
    temperature: parameters.temperature,
    max_length: parameters.max_length,
    min_length: parameters.min_length,
    top_k: parameters.top_k,
    top_p: parameters.top_p,
    top_a: parameters.top_a,
    typical_p: parameters.typical_p,
    tail_free_sampling: parameters.tail_free_sampling,
    repetition_penalty: parameters.repetition_penalty,
    repetition_penalty_range: parameters.repetition_penalty_range,
    repetition_penalty_slope: parameters.repetition_penalty_slope,
    repetition_penalty_frequency: parameters.repetition_penalty_frequency,
    repetition_penalty_presence: parameters.repetition_penalty_presence,
    phrase_rep_pen: parameters.phrase_rep_pen,
    mirostat_lr: parameters.mirostat_lr,
    mirostat_tau: parameters.mirostat_tau,
    math1_temp: parameters.math1_temp,
    math1_quad: parameters.math1_quad,
    math1_quad_entropy_scale: parameters.math1_quad_entropy_scale,
    min_p: parameters.min_p,
    order,
    extensions: {},
  };
}

function createAdapter(apiId: PresetCatalogId): PresetCatalogAdapter {
  const definition = getPresetCatalogDefinition(apiId);
  const config = adapterConfigs[apiId];
  const presetOnlyFields = presetFields(definition);
  const nonPresetFields = companionFields(definition);

  return {
    definition,
    createDefaultDraft(): PresetDraft {
      const draft: PresetDraft = Object.fromEntries(
        presetOnlyFields.map((field) => [field.id, deepClone(field.defaultValue)]),
      );
      if (config.includeNameInPreset) {
        draft.name = '';
      }
      if (!('__extras' in draft)) {
        draft.__extras = {};
      }
      return draft;
    },
    normalizeRestoredPreset(input: Record<string, unknown>): PresetDraft {
      const baseSource = apiId === 'novel' ? convertNovelPreset(asRecord(input)) : asRecord(input);
      const { payload: mergedPromptPayload } = apiId === 'openai'
        ? mergeLegacyPromptFields(asRecord(baseSource))
        : { payload: baseSource };
      const source = mergedPromptPayload;
      const draft = this.createDefaultDraft();
      const knownKeys = new Set<string>();
      for (const field of presetOnlyFields) {
        const key = presetFieldKey(field);
        knownKeys.add(key);
        if (key in source) {
          draft[field.id] = deepClone(source[key]);
        }
      }
      if (config.includeNameInPreset) {
        draft.name = typeof source.name === 'string' ? source.name : '';
      }
      const extras = Object.fromEntries(
        Object.entries(source).filter(([key]) => !knownKeys.has(key) && key !== 'name'),
      );
      draft.__extras = extras;
      if (apiId === 'openai') {
        if (!('prompts' in source)) {
          draft.prompts = null;
        }
        if (!('prompt_order' in source)) {
          draft.prompt_order = null;
        }

        const materialized = materializePresetRegexScripts(draft);
        if (Array.isArray(materialized.regex_scripts) && materialized.regex_scripts.length > 0) {
          draft.regex_scripts = deepClone(materialized.regex_scripts);
        }
      }
      return draft;
    },
    serializePreset(input: Record<string, unknown>): Record<string, unknown> {
      const source = asRecord(input);
      const payload: Record<string, unknown> = {};
      if (config.includeNameInPreset && typeof source.name === 'string' && source.name.trim()) {
        payload.name = source.name;
      }
      for (const field of presetOnlyFields) {
        if (field.id === '__extras') {
          continue;
        }
        payload[presetFieldKey(field)] = deepClone(resolvePresetValue(source, field));
      }

      const extras = deepClone(asRecord(source.__extras));
      if (apiId === 'openai') {
        delete extras.regex_scripts;
        const normalizedRegexScripts = resolvePresetRegexScripts(source);
        if (normalizedRegexScripts.length > 0) {
          payload.regex_scripts = normalizedRegexScripts.map((script) => {
            const { source_kind, ...rest } = script;
            return deepClone(rest);
          });
        }
      }

      return removeUndefinedEntries({ ...payload, ...extras });
    },
    readActiveName(settings: Record<string, unknown>): string | null {
      const value = readPath(settings, config.activeNamePath);
      return typeof value === 'string' && value.trim() ? value : null;
    },
    writeActiveName(settings: Record<string, unknown>, name: string): Record<string, unknown> {
      return writePath(settings, config.activeNamePath, name);
    },
    applyPresetDraftToSettings(settings: Record<string, unknown>, draft: Record<string, unknown>): Record<string, unknown> {
      let next = deepClone(settings);
      const source = asRecord(draft);
      for (const field of presetOnlyFields) {
        if (field.id === '__extras') {
          continue;
        }
        next = writePath(next, fieldPath(config, field), resolvePresetValue(source, field));
      }
      return next;
    },
    readWorkspaceCompanion(settings: Record<string, unknown>): Record<string, unknown> {
      return Object.fromEntries(
        nonPresetFields.map((field) => {
          const current = readPath(settings, fieldPath(config, field));
          return [field.id, current === undefined ? deepClone(field.defaultValue) : deepClone(current)];
        }),
      );
    },
    writeWorkspaceCompanion(settings: Record<string, unknown>, companion: Record<string, unknown>): Record<string, unknown> {
      let next = deepClone(settings);
      const source = asRecord(companion);
      for (const field of nonPresetFields) {
        next = writePath(next, fieldPath(config, field), source[field.id] ?? field.defaultValue);
      }
      return next;
    },
  };
}

export const presetCatalogAdapters = {
  openai: createAdapter('openai'),
  kobold: createAdapter('kobold'),
  novel: createAdapter('novel'),
  textgenerationwebui: createAdapter('textgenerationwebui'),
  context: createAdapter('context'),
  instruct: createAdapter('instruct'),
  sysprompt: createAdapter('sysprompt'),
  reasoning: createAdapter('reasoning'),
} as const satisfies Record<PresetCatalogId, PresetCatalogAdapter>;

export function getPresetCatalogAdapter(apiId: PresetCatalogId): PresetCatalogAdapter {
  return presetCatalogAdapters[apiId];
}

export function isOpenAISensitiveFieldKey(key: string): boolean {
  return OPENAI_SENSITIVE_FIELD_KEYS.includes(key as (typeof OPENAI_SENSITIVE_FIELD_KEYS)[number]);
}

export function stripOpenAISensitiveFields(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !isOpenAISensitiveFieldKey(key)));
}
