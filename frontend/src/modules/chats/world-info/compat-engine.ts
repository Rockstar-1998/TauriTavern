import type { ChatMessage, WorldInfoRecord } from '@/types/domain';

export const worldInfoLogic = {
  AND_ANY: 0,
  NOT_ALL: 1,
  NOT_ANY: 2,
  AND_ALL: 3,
} as const;

export type NormalizedWorldInfoEntry = {
  world: string;
  uid: string;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  order: number;
  disable: boolean;
  probability: number;
  useProbability: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
};

export type ActivatedWorldInfoResult = {
  activatedEntries: NormalizedWorldInfoEntry[];
  contextBlock: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
  }
  return Boolean(value);
}

function entryBoolean(record: Record<string, unknown>, key: string): boolean {
  return coerceBoolean(record[key]);
}

function entryNumber(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function entryNullableBoolean(record: Record<string, unknown>, key: string): boolean | null {
  if (record[key] == null) {
    return null;
  }
  return coerceBoolean(record[key]);
}

function normalizeWorldInfoEntry(world: string, uid: string, raw: unknown): NormalizedWorldInfoEntry | null {
  const record = asRecord(raw);
  const content = String(record.content ?? '').trim();
  const key = asStringArray(record.key);

  if (!content) {
    return null;
  }

  return {
    world,
    uid,
    key,
    keysecondary: asStringArray(record.keysecondary),
    comment: String(record.comment ?? '').trim(),
    content,
    constant: entryBoolean(record, 'constant'),
    selective: entryBoolean(record, 'selective'),
    selectiveLogic: entryNumber(record, 'selectiveLogic', worldInfoLogic.AND_ANY),
    order: entryNumber(record, 'order', 0),
    disable: entryBoolean(record, 'disable'),
    probability: entryNumber(record, 'probability', 100),
    useProbability: entryBoolean(record, 'useProbability'),
    excludeRecursion: entryBoolean(record, 'excludeRecursion'),
    preventRecursion: entryBoolean(record, 'preventRecursion'),
    delayUntilRecursion: entryBoolean(record, 'delayUntilRecursion'),
    caseSensitive: entryNullableBoolean(record, 'caseSensitive'),
    matchWholeWords: entryNullableBoolean(record, 'matchWholeWords'),
  };
}

export function normalizeWorldInfoRecord(world: string, record: WorldInfoRecord | Record<string, unknown>): NormalizedWorldInfoEntry[] {
  return Object.entries(asRecord(asRecord(record).entries))
    .map(([uid, entry]) => normalizeWorldInfoEntry(world, uid, entry))
    .filter((entry): entry is NormalizedWorldInfoEntry => Boolean(entry));
}

function buildScanText(messages: ChatMessage[], recursiveContent: string[]): string {
  const timelineText = messages
    .map((message) => `${String(message.name ?? '').trim()}: ${String(message.mes ?? '').trim()}`.trim())
    .filter(Boolean)
    .join('\n');

  return [timelineText, ...recursiveContent].filter(Boolean).join('\n');
}

function matchesKey(text: string, rawKey: string, entry: NormalizedWorldInfoEntry): boolean {
  const key = rawKey.trim();
  if (!key) {
    return false;
  }

  const caseSensitive = entry.caseSensitive ?? false;
  const matchWholeWords = entry.matchWholeWords ?? false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? key : key.toLowerCase();

  if (!matchWholeWords) {
    return haystack.includes(needle);
  }

  const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(needle)}([^\\p{L}\\p{N}_]|$)`, caseSensitive ? 'u' : 'iu');
  return regex.test(text);
}

function matchesSecondary(entry: NormalizedWorldInfoEntry, text: string): boolean {
  if (!entry.keysecondary.length) {
    return true;
  }

  let hasAnyMatch = false;
  let hasAllMatch = true;

  for (const secondary of entry.keysecondary) {
    const hasMatch = matchesKey(text, secondary, entry);
    if (hasMatch) {
      hasAnyMatch = true;
    }
    if (!hasMatch) {
      hasAllMatch = false;
    }

    if (entry.selectiveLogic === worldInfoLogic.AND_ANY && hasMatch) {
      return true;
    }
    if (entry.selectiveLogic === worldInfoLogic.NOT_ALL && !hasMatch) {
      return true;
    }
  }

  if (entry.selectiveLogic === worldInfoLogic.NOT_ANY && !hasAnyMatch) {
    return true;
  }

  if (entry.selectiveLogic === worldInfoLogic.AND_ALL && hasAllMatch) {
    return true;
  }

  return false;
}

function entryMatches(entry: NormalizedWorldInfoEntry, text: string, recursionStep: number): boolean {
  if (entry.disable) {
    return false;
  }

  if (entry.delayUntilRecursion && recursionStep === 0) {
    return false;
  }

  if (entry.useProbability && entry.probability <= 0) {
    return false;
  }

  const primaryMatch = entry.key.some((key) => matchesKey(text, key, entry));
  if (!primaryMatch) {
    return false;
  }

  if (!entry.selective || !entry.keysecondary.length) {
    return true;
  }

  return matchesSecondary(entry, text);
}

export function buildWorldInfoContextBlock(entries: NormalizedWorldInfoEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  return ['[World Info Context]', ...entries.map((entry) => entry.content)].join('\n\n').trim();
}

export function activateWorldInfoEntries(options: {
  books: Array<{ name: string; data: WorldInfoRecord | Record<string, unknown> }>;
  messages: ChatMessage[];
  maxRecursionSteps?: number;
  maxCharacters?: number;
}): ActivatedWorldInfoResult {
  const normalized = options.books
    .flatMap((book) => normalizeWorldInfoRecord(book.name, book.data))
    .sort((left, right) => Number(right.order) - Number(left.order));

  const activated = new Map<string, NormalizedWorldInfoEntry>();
  const recursiveContent: string[] = [];
  const maxRecursionSteps = Math.max(0, options.maxRecursionSteps ?? 2);

  for (let step = 0; step <= maxRecursionSteps; step += 1) {
    const text = buildScanText(options.messages, recursiveContent);
    let activatedNow = false;

    for (const entry of normalized) {
      const key = `${entry.world}:${entry.uid}`;
      if (activated.has(key)) {
        continue;
      }

      if (!entryMatches(entry, text, step)) {
        continue;
      }

      activated.set(key, entry);
      activatedNow = true;

      if (!entry.preventRecursion && !entry.excludeRecursion) {
        recursiveContent.push(entry.content);
      }
    }

    if (!activatedNow) {
      break;
    }
  }

  const maxCharacters = Math.max(0, options.maxCharacters ?? 6000);
  let usedCharacters = 0;
  const limitedEntries: NormalizedWorldInfoEntry[] = [];

  for (const entry of Array.from(activated.values()).sort((left, right) => Number(right.order) - Number(left.order))) {
    if (maxCharacters > 0 && usedCharacters > 0 && usedCharacters + entry.content.length > maxCharacters) {
      continue;
    }
    limitedEntries.push(entry);
    usedCharacters += entry.content.length;
  }

  return {
    activatedEntries: limitedEntries,
    contextBlock: buildWorldInfoContextBlock(limitedEntries),
  };
}
