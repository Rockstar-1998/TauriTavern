import { asRecord, deepClone } from './utils';

export const PROMPT_MANAGER_DUMMY_ID = 100001;
export const PROMPT_MANAGER_FALLBACK_ID = 100000;

export type PromptEntry = {
  identifier: string;
  name?: string;
  role?: string;
  content?: string;
  enabled?: boolean;
  system_prompt?: boolean;
  marker?: boolean;
  position?: string | number;
  injection_position?: number;
  injection_depth?: number;
  injection_order?: number;
  forbid_overrides?: boolean;
  extension?: boolean;
  injection_trigger?: string[];
};

export type PromptOrderEntry = {
  identifier: string;
  enabled: boolean;
};

export type PromptOrderList = {
  character_id: number | string;
  order: PromptOrderEntry[];
};

export type PromptManagerValidation = {
  valid: boolean;
  issues: string[];
};

export type PromptManagerNormalization = {
  prompts: unknown;
  prompt_order: unknown;
  inherited: boolean;
  migrated: boolean;
  migratedMap: boolean;
};

export type PromptManagerSanitizeResult = PromptManagerNormalization & {
  repaired: boolean;
  stats: PromptRepairStats;
};

export type PromptRepairStats = {
  renamed: number;
  generated: number;
  removedOrder: number;
  addedOrder: number;
};

export const DEFAULT_PROMPTS: PromptEntry[] = [
  {
    name: 'Main Prompt',
    system_prompt: true,
    role: 'system',
    content: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
    identifier: 'main',
  },
  {
    name: 'Auxiliary Prompt',
    system_prompt: true,
    role: 'system',
    content: '',
    identifier: 'nsfw',
  },
  {
    identifier: 'dialogueExamples',
    name: 'Chat Examples',
    system_prompt: true,
    marker: true,
  },
  {
    name: 'Post-History Instructions',
    system_prompt: true,
    role: 'system',
    content: '',
    identifier: 'jailbreak',
  },
  {
    identifier: 'chatHistory',
    name: 'Chat History',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'worldInfoAfter',
    name: 'World Info (after)',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'worldInfoBefore',
    name: 'World Info (before)',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'enhanceDefinitions',
    role: 'system',
    name: 'Enhance Definitions',
    content: 'If you have more knowledge of {{char}}, add to the character\'s lore and personality to enhance them but keep the Character Sheet\'s definitions absolute.',
    system_prompt: true,
    marker: false,
  },
  {
    identifier: 'charDescription',
    name: 'Char Description',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'charPersonality',
    name: 'Char Personality',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'scenario',
    name: 'Scenario',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'personaDescription',
    name: 'Persona Description',
    system_prompt: true,
    marker: true,
  },
];

const DEFAULT_ORDER_PRIMARY: PromptOrderEntry[] = [
  { identifier: 'main', enabled: true },
  { identifier: 'worldInfoBefore', enabled: true },
  { identifier: 'personaDescription', enabled: true },
  { identifier: 'charDescription', enabled: true },
  { identifier: 'charPersonality', enabled: true },
  { identifier: 'scenario', enabled: true },
  { identifier: 'enhanceDefinitions', enabled: false },
  { identifier: 'nsfw', enabled: true },
  { identifier: 'worldInfoAfter', enabled: true },
  { identifier: 'dialogueExamples', enabled: true },
  { identifier: 'chatHistory', enabled: true },
  { identifier: 'jailbreak', enabled: true },
];

const DEFAULT_ORDER_FALLBACK: PromptOrderEntry[] = [
  { identifier: 'main', enabled: true },
  { identifier: 'worldInfoBefore', enabled: true },
  { identifier: 'charDescription', enabled: true },
  { identifier: 'charPersonality', enabled: true },
  { identifier: 'scenario', enabled: true },
  { identifier: 'enhanceDefinitions', enabled: false },
  { identifier: 'nsfw', enabled: true },
  { identifier: 'worldInfoAfter', enabled: true },
  { identifier: 'dialogueExamples', enabled: true },
  { identifier: 'chatHistory', enabled: true },
  { identifier: 'jailbreak', enabled: true },
];

export const DEFAULT_PROMPT_ORDER_LISTS: PromptOrderList[] = [
  { character_id: PROMPT_MANAGER_FALLBACK_ID, order: DEFAULT_ORDER_FALLBACK },
  { character_id: PROMPT_MANAGER_DUMMY_ID, order: DEFAULT_ORDER_PRIMARY },
];

const SYSTEM_PROMPT_IDS = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'] as const;
const FORCE_EDIT_PROMPTS = ['charDescription', 'charPersonality', 'scenario', 'personaDescription', 'worldInfoBefore', 'worldInfoAfter'] as const;
const FORCE_TOGGLE_PROMPTS = ['charDescription', 'charPersonality', 'scenario', 'personaDescription', 'worldInfoBefore', 'worldInfoAfter', 'main', 'chatHistory', 'dialogueExamples'] as const;

const LEGACY_PROMPT_FIELDS = ['main_prompt', 'nsfw_prompt', 'jailbreak_prompt'] as const;

function isPromptOrderList(value: unknown): value is PromptOrderList {
  const record = asRecord(value);
  return Object.prototype.hasOwnProperty.call(record, 'character_id') && Array.isArray(record.order);
}

function coerceCharacterId(value: unknown, fallback: number): string | number {
  if (typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  return fallback;
}

function normalizePromptMapEntries(map: Record<string, unknown>): { entries: PromptEntry[]; migrated: boolean } {
  const entries: PromptEntry[] = [];
  let migrated = false;
  for (const [key, value] of Object.entries(map)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = deepClone(asRecord(value));
      const rawIdentifier = typeof record.identifier === 'string' ? record.identifier.trim() : '';
      const entry: PromptEntry = {
        ...(record as PromptEntry),
        identifier: rawIdentifier || key,
      };
      if (!Array.isArray(entry.injection_trigger)) {
        entry.injection_trigger = [];
        migrated = true;
      }
      if (!rawIdentifier || rawIdentifier !== record.identifier) {
        migrated = true;
      }
      entries.push(entry);
      continue;
    }
    if (typeof value === 'string') {
      entries.push({
        identifier: key,
        name: key,
        role: 'system',
        content: value,
        system_prompt: false,
        marker: false,
        injection_trigger: [],
      });
      migrated = true;
      continue;
    }
    entries.push({
      identifier: key,
      name: key,
      role: 'system',
      content: value == null ? '' : String(value),
      system_prompt: false,
      marker: false,
      injection_trigger: [],
    });
    migrated = true;
  }
  return { entries, migrated };
}

function coercePromptOrderEnabled(value: unknown): { enabled: boolean; migrated: boolean } {
  if (typeof value === 'boolean') {
    return { enabled: value, migrated: false };
  }
  if (typeof value === 'number') {
    return { enabled: value !== 0, migrated: true };
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return { enabled: true, migrated: true };
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return { enabled: false, migrated: true };
    }
  }
  return { enabled: true, migrated: true };
}

function coercePromptOrderEntry(value: unknown): { entry: PromptOrderEntry | null; migrated: boolean } {
  if (typeof value === 'string') {
    return { entry: { identifier: value, enabled: true }, migrated: true };
  }
  if (!value || typeof value !== 'object') {
    return { entry: null, migrated: true };
  }
  const record = asRecord(value);
  if (typeof record.identifier !== 'string' || !record.identifier.trim()) {
    return { entry: null, migrated: true };
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'enabled')) {
    return {
      entry: { identifier: record.identifier.trim(), enabled: true },
      migrated: true,
    };
  }
  const { enabled, migrated } = coercePromptOrderEnabled(record.enabled);
  const entry: PromptOrderEntry = {
    identifier: record.identifier.trim(),
    enabled,
  };
  return { entry, migrated: migrated || typeof record.enabled !== 'boolean' };
}

function normalizePromptOrderEntries(value: unknown): { entries: PromptOrderEntry[]; migrated: boolean } {
  const entries: PromptOrderEntry[] = [];
  let migrated = false;

  if (Array.isArray(value)) {
    for (const item of value) {
      const { entry, migrated: entryMigrated } = coercePromptOrderEntry(item);
      if (entry) {
        entries.push(entry);
      }
      if (entryMigrated || !entry) {
        migrated = true;
      }
    }
    return { entries, migrated };
  }

  if (value && typeof value === 'object') {
    const map = asRecord(value);
    for (const [identifier, enabledValue] of Object.entries(map)) {
      const { enabled, migrated: enabledMigrated } = coercePromptOrderEnabled(enabledValue);
      entries.push({ identifier, enabled });
      if (enabledMigrated) {
        migrated = true;
      }
    }
    return { entries, migrated: true };
  }

  return { entries, migrated: false };
}

function normalizePromptOrderLists(value: unknown, dummyId: number): { lists: PromptOrderList[]; migrated: boolean } {
  let migrated = false;
  const lists: PromptOrderList[] = [];
  const extraEntries: PromptOrderEntry[] = [];

  if (Array.isArray(value)) {
    const hasListShape = value.some((item) => {
      const record = asRecord(item);
      return Object.prototype.hasOwnProperty.call(record, 'character_id') || Object.prototype.hasOwnProperty.call(record, 'order');
    });

    if (!hasListShape) {
      const normalized = normalizePromptOrderEntries(value);
      return {
        lists: [{ character_id: dummyId, order: normalized.entries }],
        migrated: true || normalized.migrated,
      };
    }

    value.forEach((item) => {
      if (isPromptOrderList(item) || (item && typeof item === 'object')) {
        const record = asRecord(item);
        if (Object.prototype.hasOwnProperty.call(record, 'character_id')) {
          const characterId = coerceCharacterId(record.character_id, dummyId);
          const normalized = normalizePromptOrderEntries(record.order);
          lists.push({ character_id: characterId, order: normalized.entries });
          if (normalized.migrated || !isPromptOrderList(item)) {
            migrated = true;
          }
          return;
        }
      }

      const { entry, migrated: entryMigrated } = coercePromptOrderEntry(item);
      if (entry) {
        extraEntries.push(entry);
      }
      if (entryMigrated || !entry) {
        migrated = true;
      }
    });
  } else if (value && typeof value === 'object') {
    if (isPromptOrderList(value) || Object.prototype.hasOwnProperty.call(asRecord(value), 'order')) {
      const record = asRecord(value);
      const characterId = coerceCharacterId(record.character_id, dummyId);
      const normalized = normalizePromptOrderEntries(record.order);
      lists.push({ character_id: characterId, order: normalized.entries });
      migrated = true || normalized.migrated;
    } else {
      const normalized = normalizePromptOrderEntries(value);
      return { lists: [{ character_id: dummyId, order: normalized.entries }], migrated: true };
    }
  }

  if (extraEntries.length > 0) {
    let dummyList = lists.find((entry) => String(entry.character_id) === String(dummyId));
    if (!dummyList) {
      dummyList = { character_id: dummyId, order: [] };
      lists.push(dummyList);
      migrated = true;
    }
    dummyList.order = [...dummyList.order, ...extraEntries];
  }

  return { lists, migrated };
}

function resolveFallbackPrompts(value: unknown): PromptEntry[] | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? clone(value as PromptEntry[]) : null;
  }
  if (value && typeof value === 'object') {
    const normalized = normalizePromptMapEntries(asRecord(value));
    return normalized.entries.length > 0 ? normalized.entries : null;
  }
  return null;
}

function resolveFallbackOrder(value: unknown): PromptOrderList[] | null {
  if (Array.isArray(value) && value.length > 0) {
    return clone(value as PromptOrderList[]);
  }
  return null;
}

function buildPromptOrderEntries(prompts: PromptEntry[]): PromptOrderEntry[] {
  return prompts
    .map((prompt) => (typeof prompt?.identifier === 'string' && prompt.identifier.trim()
      ? {
        identifier: prompt.identifier.trim(),
        enabled: typeof prompt.enabled === 'boolean' ? prompt.enabled : true,
      }
      : null))
    .filter(Boolean) as PromptOrderEntry[];
}

function clone<T>(value: T): T {
  return deepClone(value);
}

function toPromptEntries(value: unknown): PromptEntry[] {
  return Array.isArray(value) ? (value as PromptEntry[]) : [];
}

function toPromptOrderLists(value: unknown): PromptOrderList[] {
  return Array.isArray(value) ? (value as PromptOrderList[]) : [];
}

export function isPromptDeletionAllowed(prompt: PromptEntry): boolean {
  return !prompt.system_prompt;
}

export function isPromptEditAllowed(prompt: PromptEntry): boolean {
  return FORCE_EDIT_PROMPTS.includes(prompt.identifier as (typeof FORCE_EDIT_PROMPTS)[number]) || !prompt.marker;
}

export function isPromptToggleAllowed(prompt: PromptEntry): boolean {
  return prompt.marker && !FORCE_TOGGLE_PROMPTS.includes(prompt.identifier as (typeof FORCE_TOGGLE_PROMPTS)[number]) ? false : true;
}

export function getDefaultPromptManagerPayload(): { prompts: PromptEntry[]; prompt_order: PromptOrderList[] } {
  return {
    prompts: clone(DEFAULT_PROMPTS),
    prompt_order: clone(DEFAULT_PROMPT_ORDER_LISTS),
  };
}

export function normalizePromptManagerPayload(input: {
  prompts: unknown;
  promptOrder: unknown;
  fallbackPrompts?: unknown;
  fallbackOrder?: unknown;
  dummyId?: number;
  fallbackId?: number;
}): PromptManagerNormalization {
  const dummyId = input.dummyId ?? PROMPT_MANAGER_DUMMY_ID;
  const fallbackId = input.fallbackId ?? PROMPT_MANAGER_FALLBACK_ID;
  const fallbackPrompts = resolveFallbackPrompts(input.fallbackPrompts);
  const fallbackOrder = resolveFallbackOrder(input.fallbackOrder);

  let inherited = false;
  let migrated = false;
  let migratedMap = false;

  let nextPrompts: unknown = input.prompts;
  if (Array.isArray(input.prompts)) {
    if (input.prompts.length > 0) {
      nextPrompts = clone(input.prompts as PromptEntry[]);
    } else if (fallbackPrompts) {
      nextPrompts = clone(fallbackPrompts);
      inherited = true;
    }
  } else if (input.prompts && typeof input.prompts === 'object') {
    const normalized = normalizePromptMapEntries(asRecord(input.prompts));
    if (normalized.entries.length > 0) {
      nextPrompts = normalized.entries;
    } else if (fallbackPrompts) {
      nextPrompts = clone(fallbackPrompts);
      inherited = true;
    }
    migrated = true;
    migratedMap = true;
  } else if (input.prompts == null && fallbackPrompts) {
    nextPrompts = clone(fallbackPrompts);
    inherited = true;
  }

  let nextOrder: unknown = input.promptOrder;
  if (Array.isArray(input.promptOrder) && input.promptOrder.length === 0) {
    nextOrder = null;
  } else if (input.promptOrder !== undefined) {
    const normalized = normalizePromptOrderLists(input.promptOrder, dummyId);
    if (normalized.lists.length > 0) {
      nextOrder = normalized.lists;
      if (normalized.migrated) {
        migrated = true;
      }
    }
  }
  if ((input.promptOrder == null || (Array.isArray(input.promptOrder) && input.promptOrder.length === 0) || !Array.isArray(nextOrder)) && fallbackOrder) {
    const normalized = normalizePromptOrderLists(fallbackOrder, dummyId);
    nextOrder = normalized.lists;
    inherited = true;
  }
  if (!Array.isArray(nextOrder) && Array.isArray(nextPrompts)) {
    const orderEntries = buildPromptOrderEntries(nextPrompts as PromptEntry[]);
    nextOrder = [{ character_id: dummyId, order: orderEntries }];
    migrated = true;
  }

  if (Array.isArray(nextOrder)) {
    const orderLists = nextOrder.filter(isPromptOrderList);
    const hasDummy = orderLists.some((entry) => String(entry.character_id) === String(dummyId));
    const fallbackList = orderLists.find((entry) => String(entry.character_id) === String(fallbackId));
    if (!hasDummy && fallbackList) {
      const updatedLists = clone(nextOrder as unknown[]) as PromptOrderList[];
      updatedLists.push({ character_id: dummyId, order: clone(fallbackList.order) });
      nextOrder = updatedLists;
      migrated = true;
    }
  }

  return {
    prompts: nextPrompts,
    prompt_order: nextOrder,
    inherited,
    migrated,
    migratedMap,
  };
}

export function sanitizePromptManagerPayload(input: {
  prompts: unknown;
  promptOrder: unknown;
  fallbackPrompts?: unknown;
  fallbackOrder?: unknown;
  dummyId?: number;
  fallbackId?: number;
  appendMissingOrder?: boolean;
}): PromptManagerSanitizeResult {
  const dummyId = input.dummyId ?? PROMPT_MANAGER_DUMMY_ID;
  const fallbackId = input.fallbackId ?? PROMPT_MANAGER_FALLBACK_ID;
  const fallbackPrompts = resolveFallbackPrompts(input.fallbackPrompts);
  const fallbackOrder = resolveFallbackOrder(input.fallbackOrder);
  const normalization = normalizePromptManagerPayload(input);
  const appendMissingOrder = input.appendMissingOrder !== false;

  const stats: PromptRepairStats = {
    renamed: 0,
    generated: 0,
    removedOrder: 0,
    addedOrder: 0,
  };
  let repaired = false;

  const sourcePrompts = Array.isArray(normalization.prompts)
    ? clone(normalization.prompts as PromptEntry[])
    : [];
  let workingPrompts = sourcePrompts;
  if (workingPrompts.length === 0) {
    workingPrompts = fallbackPrompts ? clone(fallbackPrompts) : clone(DEFAULT_PROMPTS);
    repaired = true;
  }

  const repairedPrompts: PromptEntry[] = [];
  const usedIds = new Set<string>();

  workingPrompts.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      const id = ensureUniqueIdentifier(createPromptIdentifier(index), usedIds);
      repairedPrompts.push({
        identifier: id,
        name: '',
        role: 'system',
        content: entry == null ? '' : String(entry),
        system_prompt: false,
        marker: false,
        injection_trigger: [],
      });
      usedIds.add(id);
      stats.generated += 1;
      repaired = true;
      return;
    }

    const next = clone(entry);
    const rawId = typeof next.identifier === 'string' ? next.identifier.trim() : '';
    let identifier = rawId;
    if (!identifier) {
      identifier = ensureUniqueIdentifier(createPromptIdentifier(index), usedIds);
      stats.generated += 1;
      repaired = true;
    } else if (usedIds.has(identifier)) {
      identifier = ensureUniqueIdentifier(identifier, usedIds);
      stats.renamed += 1;
      repaired = true;
    }
    next.identifier = identifier;
    if (!Array.isArray(next.injection_trigger)) {
      next.injection_trigger = [];
      repaired = true;
    }
    repairedPrompts.push(next);
    usedIds.add(identifier);
  });

  if (repairedPrompts.length === 0) {
    repairedPrompts.push(...clone(DEFAULT_PROMPTS));
    repaired = true;
  }

  const promptMap = new Map<string, PromptEntry>(repairedPrompts.map((prompt) => [prompt.identifier, prompt]));
  for (const defaultPrompt of DEFAULT_PROMPTS) {
    if (promptMap.has(defaultPrompt.identifier)) {
      continue;
    }
    const cloned = clone(defaultPrompt);
    if (!Array.isArray(cloned.injection_trigger)) {
      cloned.injection_trigger = [];
    }
    repairedPrompts.push(cloned);
    promptMap.set(cloned.identifier, cloned);
    usedIds.add(cloned.identifier);
    repaired = true;
  }

  let orderLists = Array.isArray(normalization.prompt_order)
    ? clone(normalization.prompt_order as PromptOrderList[])
    : [];
  if (orderLists.length === 0) {
    if (fallbackOrder) {
      orderLists = clone(fallbackOrder);
    } else {
      orderLists = [{ character_id: dummyId, order: buildPromptOrderEntries(repairedPrompts) }];
    }
    repaired = true;
  }

  let activeList = getActivePromptOrderList(orderLists, dummyId);
  if (!activeList) {
    const fallbackList = orderLists.find((entry) => String(entry.character_id) === String(fallbackId));
    const nextOrder = fallbackList ? clone(fallbackList.order) : buildPromptOrderEntries(repairedPrompts);
    orderLists = applyActivePromptOrder(orderLists, nextOrder, dummyId);
    activeList = getActivePromptOrderList(orderLists, dummyId);
    repaired = true;
  }

  const activeOrder = activeList?.order ?? [];
  const filteredOrder = activeOrder.filter((entry) => {
    const exists = promptMap.has(entry.identifier);
    if (!exists) {
      stats.removedOrder += 1;
      repaired = true;
    }
    return exists;
  });

  const orderIds = new Set(filteredOrder.map((entry) => entry.identifier));
  if (appendMissingOrder) {
    for (const prompt of repairedPrompts) {
      if (!orderIds.has(prompt.identifier)) {
        const enabled = typeof prompt.enabled === 'boolean' ? prompt.enabled : true;
        filteredOrder.push({ identifier: prompt.identifier, enabled });
        orderIds.add(prompt.identifier);
        stats.addedOrder += 1;
        repaired = true;
      }
    }
  }

  orderLists = applyActivePromptOrder(orderLists, filteredOrder, dummyId);

  if (stats.generated || stats.renamed || stats.addedOrder || stats.removedOrder) {
    repaired = true;
  }

  return {
    ...normalization,
    prompts: repairedPrompts,
    prompt_order: orderLists,
    repaired,
    stats,
  };
}

export function getActivePromptOrderList(promptOrder: unknown, dummyId = PROMPT_MANAGER_DUMMY_ID): PromptOrderList | null {
  const lists = toPromptOrderLists(promptOrder);
  const list = lists.find((entry) => String(entry?.character_id) === String(dummyId));
  if (!list || !Array.isArray(list.order)) {
    return null;
  }
  return list;
}

export function getActivePromptOrderEntries(promptOrder: unknown, dummyId = PROMPT_MANAGER_DUMMY_ID): PromptOrderEntry[] {
  return getActivePromptOrderList(promptOrder, dummyId)?.order ?? [];
}

export function validatePromptManagerPayload(prompts: unknown, promptOrder: unknown): PromptManagerValidation {
  const issues: string[] = [];
  if (!Array.isArray(prompts) || prompts.length === 0) {
    issues.push('missing_prompts');
  }
  const promptEntries = toPromptEntries(prompts);
  const identifiers = new Set<string>();
  for (const entry of promptEntries) {
    if (!entry || typeof entry !== 'object' || typeof entry.identifier !== 'string' || !entry.identifier.trim()) {
      issues.push('invalid_prompt');
      continue;
    }
    const id = entry.identifier.trim();
    if (identifiers.has(id)) {
      issues.push('duplicate_prompt');
    }
    identifiers.add(id);
  }
  if (!Array.isArray(promptOrder)) {
    issues.push('missing_order');
  }
  const activeList = getActivePromptOrderList(promptOrder);
  if (!activeList) {
    issues.push('missing_active_order');
  } else {
    const orderIds = new Set<string>();
    for (const entry of activeList.order) {
      if (!entry || typeof entry.identifier !== 'string' || typeof entry.enabled !== 'boolean') {
        issues.push('invalid_order_entry');
        continue;
      }
      orderIds.add(entry.identifier);
      if (!identifiers.has(entry.identifier)) {
        issues.push('order_missing_prompt');
      }
    }
  }
  return { valid: issues.length === 0, issues: Array.from(new Set(issues)) };
}

export function mergeLegacyPromptFields(input: Record<string, unknown>): { payload: Record<string, unknown>; migrated: boolean } {
  const hasLegacy = LEGACY_PROMPT_FIELDS.some((key) => typeof input[key] === 'string' && String(input[key]).trim().length > 0);
  if (!hasLegacy) {
    return { payload: input, migrated: false };
  }

  const next = clone(input);
  let prompts = Array.isArray(next.prompts) ? clone(next.prompts as PromptEntry[]) : clone(DEFAULT_PROMPTS);
  const promptMap = new Map(prompts.map((prompt) => [prompt.identifier, prompt]));

  if (typeof next.main_prompt === 'string') {
    const target = promptMap.get('main');
    if (target) {
      target.content = next.main_prompt;
    }
  }
  if (typeof next.nsfw_prompt === 'string') {
    const target = promptMap.get('nsfw');
    if (target) {
      target.content = next.nsfw_prompt;
    }
  }
  if (typeof next.jailbreak_prompt === 'string') {
    const target = promptMap.get('jailbreak');
    if (target) {
      target.content = next.jailbreak_prompt;
    }
  }

  for (const key of LEGACY_PROMPT_FIELDS) {
    delete next[key];
  }

  next.prompts = prompts;
  return { payload: next, migrated: true };
}

export function applyActivePromptOrder(promptOrder: PromptOrderList[], order: PromptOrderEntry[], dummyId = PROMPT_MANAGER_DUMMY_ID): PromptOrderList[] {
  const next = clone(promptOrder);
  const index = next.findIndex((entry) => String(entry?.character_id) === String(dummyId));
  if (index >= 0) {
    next[index] = { character_id: next[index].character_id, order: clone(order) };
    return next;
  }
  next.push({ character_id: dummyId, order: clone(order) });
  return next;
}

export function repairPromptManagerPayload(
  prompts: unknown,
  promptOrder: unknown,
  dummyId = PROMPT_MANAGER_DUMMY_ID,
): { prompts: PromptEntry[]; prompt_order: PromptOrderList[]; stats: PromptRepairStats } {
  const sanitized = sanitizePromptManagerPayload({
    prompts,
    promptOrder,
    fallbackPrompts: DEFAULT_PROMPTS,
    fallbackOrder: DEFAULT_PROMPT_ORDER_LISTS,
    dummyId,
  });

  return {
    prompts: sanitized.prompts as PromptEntry[],
    prompt_order: sanitized.prompt_order as PromptOrderList[],
    stats: sanitized.stats,
  };
}

export function reorderPromptOrderEntries(order: PromptOrderEntry[], sourceId: string, targetId: string): PromptOrderEntry[] {
  const next = clone(order);
  const fromIndex = next.findIndex((entry) => entry.identifier === sourceId);
  const toIndex = next.findIndex((entry) => entry.identifier === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return next;
  }
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function mergePromptImport(currentPrompts: unknown, currentOrder: unknown, importData: unknown): { ok: boolean; prompts: PromptEntry[]; prompt_order: PromptOrderList[]; issues?: string[] } {
  const control = asRecord(importData);
  const data = asRecord(control.data);
  if (control.version !== 1 || !Array.isArray(data.prompts) || !Array.isArray(data.prompt_order)) {
    return { ok: false, prompts: toPromptEntries(currentPrompts), prompt_order: toPromptOrderLists(currentOrder), issues: ['invalid_import'] };
  }

  const mergedPrompts = mergePrompts(toPromptEntries(currentPrompts), data.prompts as PromptEntry[]);
  const updatedOrders = applyActivePromptOrder(toPromptOrderLists(currentOrder), data.prompt_order as PromptOrderEntry[]);

  return { ok: true, prompts: mergedPrompts, prompt_order: updatedOrders };
}

export function exportPromptBundle(prompts: PromptEntry[], promptOrder: PromptOrderList[]): Record<string, unknown> {
  return {
    version: 1,
    type: 'full',
    data: {
      prompts: clone(prompts),
      prompt_order: clone(getActivePromptOrderEntries(promptOrder)),
    },
  };
}

export function getPromptManagerSummary(prompts: unknown, promptOrder: unknown): { enabled: number; total: number } | null {
  const validation = validatePromptManagerPayload(prompts, promptOrder);
  if (!validation.valid) {
    return null;
  }
  const order = getActivePromptOrderEntries(promptOrder);
  const enabled = order.filter((entry) => entry.enabled).length;
  return { enabled, total: order.length };
}

function mergePrompts(existing: PromptEntry[], incoming: PromptEntry[]): PromptEntry[] {
  const merged = [...existing, ...incoming];
  const map = new Map<string, PromptEntry>();
  for (const prompt of merged) {
    if (!prompt || typeof prompt.identifier !== 'string') {
      continue;
    }
    map.set(prompt.identifier, prompt);
  }
  return Array.from(map.values());
}

function createPromptIdentifier(index: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `prompt_${Date.now()}_${index}`;
}

function ensureUniqueIdentifier(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${base}__fix__${counter}`;
    counter += 1;
  }
  return candidate;
}

export function describePromptManagerIssues(validation: PromptManagerValidation): string[] {
  return validation.issues;
}

export function resolvePromptOrDefault(prompts: PromptEntry[], identifier: string): PromptEntry | null {
  return prompts.find((prompt) => prompt.identifier === identifier) ?? null;
}

export function isSystemPrompt(prompt: PromptEntry): boolean {
  return Boolean(prompt.system_prompt);
}

export function getSystemPromptDefaults(): Record<string, string> {
  const defaults: Record<string, string> = {};
  DEFAULT_PROMPTS.filter((prompt) => SYSTEM_PROMPT_IDS.includes(prompt.identifier as (typeof SYSTEM_PROMPT_IDS)[number])).forEach((prompt) => {
    defaults[prompt.identifier] = String(prompt.content ?? '');
  });
  return defaults;
}
