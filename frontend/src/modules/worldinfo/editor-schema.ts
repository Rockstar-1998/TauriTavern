import type { WorldInfoRecord } from '@/types/domain';

import { worldInfoLogic } from '@/modules/chats/world-info/compat-engine';

export const WORLD_INFO_DEFAULT_DEPTH = 4;
export const WORLD_INFO_DEFAULT_WEIGHT = 100;

export const worldInfoPosition = {
  before: 0,
  after: 1,
  anTop: 2,
  anBottom: 3,
  atDepth: 4,
  emTop: 5,
  emBottom: 6,
  outlet: 7,
} as const;

export const worldInfoRole = {
  system: 0,
  user: 1,
  assistant: 2,
} as const;

export type WorldInfoEntryId = string;

export type WorldInfoEntry = {
  uid: number;
  displayIndex: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  vectorized: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  order: number;
  position: number;
  disable: boolean;
  ignoreBudget: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  matchPersonaDescription: boolean;
  matchCharacterDescription: boolean;
  matchCharacterPersonality: boolean;
  matchCharacterDepthPrompt: boolean;
  matchScenario: boolean;
  matchCreatorNotes: boolean;
  delayUntilRecursion: number | boolean | null;
  probability: number;
  useProbability: boolean;
  depth: number;
  outletName: string;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId: string;
  role: number;
  sticky: number | null;
  cooldown: number | null;
  delay: number | null;
  characterFilterNames: string[];
  characterFilterTags: string[];
  characterFilterExclude: boolean;
  triggers: string[];
  extras: Record<string, unknown>;
};

export type NormalizedWorldInfoRecord = {
  entries: Record<WorldInfoEntryId, WorldInfoEntry>;
  extras: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, record);
}

function firstDefined(record: Record<string, unknown>, ...paths: string[]): unknown {
  for (const path of paths) {
    const value = path.includes('.') ? getPath(record, path) : record[path];
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function stringValue(record: Record<string, unknown>, fallback: string, ...paths: string[]): string {
  const value = firstDefined(record, ...paths);
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function numberValue(record: Record<string, unknown>, fallback: number, ...paths: string[]): number {
  const value = Number(firstDefined(record, ...paths));
  return Number.isFinite(value) ? value : fallback;
}

function nullableNumberValue(record: Record<string, unknown>, fallback: number | null, ...paths: string[]): number | null {
  const value = firstDefined(record, ...paths);
  if (value == null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(record: Record<string, unknown>, fallback: boolean, ...paths: string[]): boolean {
  const value = firstDefined(record, ...paths);
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
  }
  return Boolean(value);
}

function nullableBooleanValue(record: Record<string, unknown>, fallback: boolean | null, ...paths: string[]): boolean | null {
  const value = firstDefined(record, ...paths);
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'default' || normalized === 'inherit' || normalized === 'null') {
      return null;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
  }
  return Boolean(value);
}

function arrayValue(record: Record<string, unknown>, ...paths: string[]): string[] {
  const value = firstDefined(record, ...paths);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
}

function delayValue(record: Record<string, unknown>, fallback: number | boolean | null, ...paths: string[]): number | boolean | null {
  const value = firstDefined(record, ...paths);
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function removeEntryCompatibilityKeys(record: Record<string, unknown>): Record<string, unknown> {
  delete record.uid;
  delete record.key;
  delete record.keys;
  delete record.keysecondary;
  delete record.secondary_keys;
  delete record.comment;
  delete record.content;
  delete record.constant;
  delete record.vectorized;
  delete record.selective;
  delete record.selectiveLogic;
  delete record.addMemo;
  delete record.order;
  delete record.insertion_order;
  delete record.position;
  delete record.disable;
  delete record.enabled;
  delete record.ignoreBudget;
  delete record.excludeRecursion;
  delete record.preventRecursion;
  delete record.matchPersonaDescription;
  delete record.matchCharacterDescription;
  delete record.matchCharacterPersonality;
  delete record.matchCharacterDepthPrompt;
  delete record.matchScenario;
  delete record.matchCreatorNotes;
  delete record.delayUntilRecursion;
  delete record.probability;
  delete record.useProbability;
  delete record.depth;
  delete record.outletName;
  delete record.group;
  delete record.groupOverride;
  delete record.groupWeight;
  delete record.scanDepth;
  delete record.caseSensitive;
  delete record.matchWholeWords;
  delete record.useGroupScoring;
  delete record.automationId;
  delete record.role;
  delete record.sticky;
  delete record.cooldown;
  delete record.delay;
  delete record.characterFilterNames;
  delete record.characterFilterTags;
  delete record.characterFilterExclude;
  delete record.characterFilter;
  delete record.character_filter;
  delete record.triggers;
  delete record.displayIndex;

  const extensions = asRecord(record.extensions);
  delete extensions.display_index;
  delete extensions.exclude_recursion;
  delete extensions.prevent_recursion;
  delete extensions.delay_until_recursion;
  delete extensions.depth;
  delete extensions.probability;
  delete extensions.useProbability;
  delete extensions.position;
  delete extensions.role;
  delete extensions.match_whole_words;
  delete extensions.use_group_scoring;
  delete extensions.case_sensitive;
  delete extensions.match_persona_description;
  delete extensions.match_character_description;
  delete extensions.match_character_personality;
  delete extensions.match_character_depth_prompt;
  delete extensions.match_scenario;
  delete extensions.match_creator_notes;
  delete extensions.scan_depth;
  delete extensions.automation_id;
  delete extensions.vectorized;
  delete extensions.group;
  delete extensions.group_override;
  delete extensions.group_weight;
  delete extensions.sticky;
  delete extensions.cooldown;
  delete extensions.delay;
  delete extensions.triggers;
  delete extensions.ignore_budget;
  delete extensions.outlet_name;

  record.extensions = extensions;
  return record;
}

function normalizeEntry(uidKey: string, rawValue: unknown, displayIndex: number): WorldInfoEntry {
  const raw = asRecord(rawValue);
  const uid = numberValue(raw, Number(uidKey) || displayIndex, 'uid', 'id');
  const characterFilter = asRecord(firstDefined(raw, 'characterFilter', 'character_filter'));

  return {
    uid,
    displayIndex: numberValue(raw, displayIndex, 'displayIndex', 'extensions.display_index'),
    key: arrayValue(raw, 'key', 'keys'),
    keysecondary: arrayValue(raw, 'keysecondary', 'secondary_keys'),
    comment: stringValue(raw, '', 'comment', 'name'),
    content: stringValue(raw, '', 'content'),
    constant: booleanValue(raw, false, 'constant'),
    vectorized: booleanValue(raw, false, 'vectorized', 'extensions.vectorized'),
    selective: booleanValue(raw, true, 'selective'),
    selectiveLogic: numberValue(raw, worldInfoLogic.AND_ANY, 'selectiveLogic', 'extensions.selectiveLogic'),
    addMemo: booleanValue(raw, false, 'addMemo'),
    order: numberValue(raw, 100, 'order', 'insertion_order'),
    position: typeof firstDefined(raw, 'position') === 'string'
      ? String(firstDefined(raw, 'position')) === 'before_char'
        ? worldInfoPosition.before
        : worldInfoPosition.after
      : numberValue(raw, worldInfoPosition.before, 'position', 'extensions.position'),
    disable: firstDefined(raw, 'disable') !== undefined
      ? booleanValue(raw, false, 'disable')
      : !booleanValue(raw, true, 'enabled'),
    ignoreBudget: booleanValue(raw, false, 'ignoreBudget', 'extensions.ignore_budget'),
    excludeRecursion: booleanValue(raw, false, 'excludeRecursion', 'extensions.exclude_recursion'),
    preventRecursion: booleanValue(raw, false, 'preventRecursion', 'extensions.prevent_recursion'),
    matchPersonaDescription: booleanValue(raw, false, 'matchPersonaDescription', 'extensions.match_persona_description'),
    matchCharacterDescription: booleanValue(raw, false, 'matchCharacterDescription', 'extensions.match_character_description'),
    matchCharacterPersonality: booleanValue(raw, false, 'matchCharacterPersonality', 'extensions.match_character_personality'),
    matchCharacterDepthPrompt: booleanValue(raw, false, 'matchCharacterDepthPrompt', 'extensions.match_character_depth_prompt'),
    matchScenario: booleanValue(raw, false, 'matchScenario', 'extensions.match_scenario'),
    matchCreatorNotes: booleanValue(raw, false, 'matchCreatorNotes', 'extensions.match_creator_notes'),
    delayUntilRecursion: delayValue(raw, 0, 'delayUntilRecursion', 'extensions.delay_until_recursion'),
    probability: numberValue(raw, 100, 'probability', 'extensions.probability'),
    useProbability: booleanValue(raw, true, 'useProbability', 'extensions.useProbability'),
    depth: numberValue(raw, WORLD_INFO_DEFAULT_DEPTH, 'depth', 'extensions.depth'),
    outletName: stringValue(raw, '', 'outletName', 'extensions.outlet_name'),
    group: stringValue(raw, '', 'group', 'extensions.group'),
    groupOverride: booleanValue(raw, false, 'groupOverride', 'extensions.group_override'),
    groupWeight: numberValue(raw, WORLD_INFO_DEFAULT_WEIGHT, 'groupWeight', 'extensions.group_weight'),
    scanDepth: nullableNumberValue(raw, null, 'scanDepth', 'extensions.scan_depth'),
    caseSensitive: nullableBooleanValue(raw, null, 'caseSensitive', 'extensions.case_sensitive'),
    matchWholeWords: nullableBooleanValue(raw, null, 'matchWholeWords', 'extensions.match_whole_words'),
    useGroupScoring: nullableBooleanValue(raw, null, 'useGroupScoring', 'extensions.use_group_scoring'),
    automationId: stringValue(raw, '', 'automationId', 'extensions.automation_id'),
    role: numberValue(raw, worldInfoRole.system, 'role', 'extensions.role'),
    sticky: nullableNumberValue(raw, null, 'sticky', 'extensions.sticky'),
    cooldown: nullableNumberValue(raw, null, 'cooldown', 'extensions.cooldown'),
    delay: nullableNumberValue(raw, null, 'delay', 'extensions.delay'),
    characterFilterNames: arrayValue(raw, 'characterFilterNames').length > 0
      ? arrayValue(raw, 'characterFilterNames')
      : arrayValue(characterFilter, 'names'),
    characterFilterTags: arrayValue(raw, 'characterFilterTags').length > 0
      ? arrayValue(raw, 'characterFilterTags')
      : arrayValue(characterFilter, 'tags'),
    characterFilterExclude: firstDefined(raw, 'characterFilterExclude') !== undefined
      ? booleanValue(raw, false, 'characterFilterExclude')
      : booleanValue(characterFilter, false, 'isExclude'),
    triggers: arrayValue(raw, 'triggers', 'extensions.triggers'),
    extras: removeEntryCompatibilityKeys(cloneRecord(raw)),
  };
}

export function normalizeWorldInfoRecord(input: WorldInfoRecord): NormalizedWorldInfoRecord {
  const raw = cloneRecord(asRecord(input));
  const rawEntriesValue = raw.entries;
  delete raw.entries;

  const entriesSource = Array.isArray(rawEntriesValue)
    ? Object.fromEntries(rawEntriesValue.map((entry, index) => [String(numberValue(asRecord(entry), index, 'uid', 'id')), entry]))
    : asRecord(rawEntriesValue);

  const entries = Object.entries(entriesSource).reduce<Record<WorldInfoEntryId, WorldInfoEntry>>((result, [uid, entry], index) => {
    result[uid] = normalizeEntry(uid, entry, index);
    return result;
  }, {});

  return {
    entries,
    extras: raw,
  };
}

export function serializeWorldInfoRecord(input: NormalizedWorldInfoRecord): WorldInfoRecord {
  const root = cloneRecord(input.extras);
  const entries = Object.entries(input.entries).reduce<Record<string, unknown>>((result, [uid, entry]) => {
    const base = removeEntryCompatibilityKeys(cloneRecord(entry.extras));
    const extensions = asRecord(base.extensions);

    base.uid = entry.uid;
    base.keys = [...entry.key];
    base.secondary_keys = [...entry.keysecondary];
    base.comment = entry.comment;
    base.content = entry.content;
    base.constant = entry.constant;
    base.selective = entry.selective;
    base.selectiveLogic = entry.selectiveLogic;
    base.insertion_order = entry.order;
    base.enabled = !entry.disable;
    base.addMemo = entry.addMemo;
    base.character_filter = {
      isExclude: entry.characterFilterExclude,
      names: [...entry.characterFilterNames],
      tags: [...entry.characterFilterTags],
    };

    base.extensions = {
      ...extensions,
      display_index: entry.displayIndex,
      exclude_recursion: entry.excludeRecursion,
      prevent_recursion: entry.preventRecursion,
      delay_until_recursion: entry.delayUntilRecursion,
      depth: entry.depth,
      probability: entry.probability,
      useProbability: entry.useProbability,
      position: entry.position,
      role: entry.role,
      match_whole_words: entry.matchWholeWords,
      use_group_scoring: entry.useGroupScoring,
      case_sensitive: entry.caseSensitive,
      match_persona_description: entry.matchPersonaDescription,
      match_character_description: entry.matchCharacterDescription,
      match_character_personality: entry.matchCharacterPersonality,
      match_character_depth_prompt: entry.matchCharacterDepthPrompt,
      match_scenario: entry.matchScenario,
      match_creator_notes: entry.matchCreatorNotes,
      scan_depth: entry.scanDepth,
      automation_id: entry.automationId,
      vectorized: entry.vectorized,
      group: entry.group,
      group_override: entry.groupOverride,
      group_weight: entry.groupWeight,
      sticky: entry.sticky,
      cooldown: entry.cooldown,
      delay: entry.delay,
      triggers: [...entry.triggers],
      ignore_budget: entry.ignoreBudget,
      outlet_name: entry.outletName,
    };

    result[uid] = base;
    return result;
  }, {});

  root.entries = entries;
  return root as WorldInfoRecord;
}

function getNextUid(record: NormalizedWorldInfoRecord): number {
  const used = new Set(Object.values(record.entries).map((entry) => entry.uid));
  let candidate = 0;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

function getNextDisplayIndex(record: NormalizedWorldInfoRecord): number {
  const current = Object.values(record.entries).map((entry) => entry.displayIndex);
  if (current.length === 0) {
    return 0;
  }
  return Math.max(...current) + 1;
}

export function createEmptyWorldInfoRecord(): NormalizedWorldInfoRecord {
  return {
    entries: {},
    extras: {},
  };
}

export function createWorldInfoEntry(record: NormalizedWorldInfoRecord): WorldInfoEntry {
  return {
    uid: getNextUid(record),
    displayIndex: getNextDisplayIndex(record),
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: worldInfoLogic.AND_ANY,
    addMemo: false,
    order: 100,
    position: worldInfoPosition.before,
    disable: false,
    ignoreBudget: false,
    excludeRecursion: false,
    preventRecursion: false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: WORLD_INFO_DEFAULT_DEPTH,
    outletName: '',
    group: '',
    groupOverride: false,
    groupWeight: WORLD_INFO_DEFAULT_WEIGHT,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: worldInfoRole.system,
    sticky: null,
    cooldown: null,
    delay: null,
    characterFilterNames: [],
    characterFilterTags: [],
    characterFilterExclude: false,
    triggers: [],
    extras: {},
  };
}

