import { describe, expect, it } from 'vitest';

import { createEmptyWorldInfoRecord, createWorldInfoEntry, normalizeWorldInfoRecord, serializeWorldInfoRecord } from './editor-schema';

describe('worldInfo editor schema', () => {
  it('normalizes legacy-shaped entries and preserves compatibility fields on serialize', () => {
    const normalized = normalizeWorldInfoRecord({
      entries: {
        '1': {
          uid: 1,
          keys: ['alpha'],
          secondary_keys: ['beta'],
          comment: 'Alpha Entry',
          content: 'Lore content',
          insertion_order: 88,
          enabled: true,
          character_filter: {
            isExclude: true,
            names: ['Alice'],
            tags: ['tag-a'],
          },
          extensions: {
            display_index: 5,
            position: 4,
            role: 2,
            probability: 77,
            delay_until_recursion: 2,
            vectorized: true,
            case_sensitive: true,
          },
        },
      },
      extraFlag: true,
    });

    expect(normalized.extras.extraFlag).toBe(true);
    expect(normalized.entries['1'].key).toEqual(['alpha']);
    expect(normalized.entries['1'].keysecondary).toEqual(['beta']);
    expect(normalized.entries['1'].order).toBe(88);
    expect(normalized.entries['1'].disable).toBe(false);
    expect(normalized.entries['1'].displayIndex).toBe(5);
    expect(normalized.entries['1'].position).toBe(4);
    expect(normalized.entries['1'].role).toBe(2);
    expect(normalized.entries['1'].probability).toBe(77);
    expect(normalized.entries['1'].delayUntilRecursion).toBe(2);
    expect(normalized.entries['1'].vectorized).toBe(true);
    expect(normalized.entries['1'].caseSensitive).toBe(true);
    expect(normalized.entries['1'].characterFilterExclude).toBe(true);
    expect(normalized.entries['1'].characterFilterNames).toEqual(['Alice']);
    expect(normalized.entries['1'].characterFilterTags).toEqual(['tag-a']);

    const serialized = serializeWorldInfoRecord(normalized);
    const entry = serialized.entries?.['1'] as Record<string, unknown>;
    const extensions = entry.extensions as Record<string, unknown>;
    const characterFilter = entry.character_filter as Record<string, unknown>;

    expect(entry.keys).toEqual(['alpha']);
    expect(entry.secondary_keys).toEqual(['beta']);
    expect(entry.insertion_order).toBe(88);
    expect(entry.enabled).toBe(true);
    expect(extensions.display_index).toBe(5);
    expect(extensions.position).toBe(4);
    expect(extensions.role).toBe(2);
    expect(extensions.probability).toBe(77);
    expect(extensions.delay_until_recursion).toBe(2);
    expect(extensions.vectorized).toBe(true);
    expect(characterFilter.isExclude).toBe(true);
    expect(characterFilter.names).toEqual(['Alice']);
    expect(characterFilter.tags).toEqual(['tag-a']);
  });

  it('creates unique entry ids and advances display index', () => {
    const record = createEmptyWorldInfoRecord();
    const first = createWorldInfoEntry(record);
    record.entries[String(first.uid)] = first;

    const second = createWorldInfoEntry(record);
    expect(second.uid).not.toBe(first.uid);
    expect(second.displayIndex).toBeGreaterThan(first.displayIndex);
  });
});
