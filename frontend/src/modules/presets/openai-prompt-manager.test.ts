import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROMPTS,
  DEFAULT_PROMPT_ORDER_LISTS,
  exportPromptBundle,
  getActivePromptOrderEntries,
  normalizePromptManagerPayload,
  sanitizePromptManagerPayload,
  PROMPT_MANAGER_DUMMY_ID,
  PROMPT_MANAGER_FALLBACK_ID,
  mergeLegacyPromptFields,
  repairPromptManagerPayload,
} from './openai-prompt-manager';

describe('openai prompt manager', () => {
  it('uses the chat completion dummy order id', () => {
    const order = getActivePromptOrderEntries(DEFAULT_PROMPT_ORDER_LISTS);
    expect(order.length).toBeGreaterThan(0);
    expect(order[0].identifier).toBe('main');
  });

  it('merges legacy prompt fields into prompts', () => {
    const { payload, migrated } = mergeLegacyPromptFields({
      main_prompt: 'Legacy Main',
      nsfw_prompt: 'Legacy NSFW',
      jailbreak_prompt: 'Legacy Jailbreak',
    });
    expect(migrated).toBe(true);
    expect(payload.main_prompt).toBeUndefined();
    const prompts = payload.prompts as typeof DEFAULT_PROMPTS;
    const main = prompts.find((prompt) => prompt.identifier === 'main');
    expect(main?.content).toBe('Legacy Main');
  });

  it('exports bundles with legacy format metadata', () => {
    const bundle = exportPromptBundle(DEFAULT_PROMPTS, DEFAULT_PROMPT_ORDER_LISTS);
    expect(bundle).toMatchObject({ version: 1, type: 'full' });
  });

  it('inherits prompt manager data when missing', () => {
    const result = normalizePromptManagerPayload({
      prompts: undefined,
      promptOrder: undefined,
      fallbackPrompts: DEFAULT_PROMPTS,
      fallbackOrder: DEFAULT_PROMPT_ORDER_LISTS,
    });
    expect(result.inherited).toBe(true);
    expect(result.migrated).toBe(false);
    expect(Array.isArray(result.prompts)).toBe(true);
    expect(Array.isArray(result.prompt_order)).toBe(true);
  });

  it('treats empty prompt arrays as missing and inherits fallback', () => {
    const result = normalizePromptManagerPayload({
      prompts: [],
      promptOrder: [],
      fallbackPrompts: DEFAULT_PROMPTS,
      fallbackOrder: DEFAULT_PROMPT_ORDER_LISTS,
    });
    expect(result.inherited).toBe(true);
    const prompts = result.prompts as Array<{ identifier: string }>;
    expect(prompts.length).toBeGreaterThan(0);
  });

  it('wraps legacy prompt order entries into a dummy list', () => {
    const result = normalizePromptManagerPayload({
      prompts: DEFAULT_PROMPTS,
      promptOrder: [{ identifier: 'main', enabled: true }],
    });
    expect(result.migrated).toBe(true);
    const orders = result.prompt_order as Array<{ character_id: number; order: Array<{ identifier: string }> }>;
    expect(orders[0].character_id).toBe(PROMPT_MANAGER_DUMMY_ID);
    expect(orders[0].order[0].identifier).toBe('main');
  });

  it('adds a dummy prompt order when only fallback order exists', () => {
    const result = normalizePromptManagerPayload({
      prompts: DEFAULT_PROMPTS,
      promptOrder: [{ character_id: PROMPT_MANAGER_FALLBACK_ID, order: [{ identifier: 'main', enabled: true }] }],
    });
    expect(result.migrated).toBe(true);
    const orders = result.prompt_order as Array<{ character_id: number }>;
    expect(orders.some((entry) => entry.character_id === PROMPT_MANAGER_DUMMY_ID)).toBe(true);
  });

  it('normalizes prompt maps while preserving identifiers', () => {
    const result = normalizePromptManagerPayload({
      prompts: {
        main: { identifier: 'main_prompt', content: 'Hello', role: 'system' },
        custom: 'Custom content',
      },
      promptOrder: [{ identifier: 'main', enabled: true }],
    });
    expect(result.migrated).toBe(true);
    expect(result.migratedMap).toBe(true);
    const prompts = result.prompts as Array<{ identifier: string; content?: string }>;
    expect(prompts.some((prompt) => prompt.identifier === 'main_prompt')).toBe(true);
    expect(prompts.some((prompt) => prompt.identifier === 'custom' && prompt.content === 'Custom content')).toBe(true);
  });

  it('normalizes prompt order maps and coerces enabled values', () => {
    const result = normalizePromptManagerPayload({
      prompts: DEFAULT_PROMPTS,
      promptOrder: { main: 1, nsfw: 'false' },
    });
    expect(result.migrated).toBe(true);
    const orders = result.prompt_order as Array<{ character_id: number; order: Array<{ identifier: string; enabled: boolean }> }>;
    const orderEntries = orders[0].order;
    expect(orderEntries.find((entry) => entry.identifier === 'main')?.enabled).toBe(true);
    expect(orderEntries.find((entry) => entry.identifier === 'nsfw')?.enabled).toBe(false);
  });

  it('generates prompt order from prompts using enabled flags when missing', () => {
    const result = normalizePromptManagerPayload({
      prompts: [
        { identifier: 'custom-a', enabled: false, role: 'system' },
        { identifier: 'custom-b', enabled: true, role: 'system' },
      ],
      promptOrder: undefined,
    });
    const orders = result.prompt_order as Array<{ character_id: number; order: Array<{ identifier: string; enabled: boolean }> }>;
    const orderEntries = orders[0].order;
    expect(orderEntries.find((entry) => entry.identifier === 'custom-a')?.enabled).toBe(false);
    expect(orderEntries.find((entry) => entry.identifier === 'custom-b')?.enabled).toBe(true);
  });

  it('appends missing prompts to order while preserving enabled state', () => {
    const result = sanitizePromptManagerPayload({
      prompts: [
        { identifier: 'custom-a', enabled: false, role: 'system' },
        { identifier: 'custom-b', enabled: true, role: 'system' },
      ],
      promptOrder: [{ character_id: PROMPT_MANAGER_DUMMY_ID, order: [{ identifier: 'custom-b', enabled: true }] }],
    });
    const order = getActivePromptOrderEntries(result.prompt_order);
    expect(order.find((entry) => entry.identifier === 'custom-a')?.enabled).toBe(false);
    expect(order.find((entry) => entry.identifier === 'custom-b')?.enabled).toBe(true);
  });

  it('does not append missing prompts when appendMissingOrder is false', () => {
    const result = sanitizePromptManagerPayload({
      prompts: [
        { identifier: 'custom-a', enabled: false, role: 'system' },
        { identifier: 'custom-b', enabled: true, role: 'system' },
      ],
      promptOrder: [{ character_id: PROMPT_MANAGER_DUMMY_ID, order: [{ identifier: 'custom-b', enabled: true }] }],
      appendMissingOrder: false,
    });
    const order = getActivePromptOrderEntries(result.prompt_order);
    expect(order.some((entry) => entry.identifier === 'custom-a')).toBe(false);
    expect(order.some((entry) => entry.identifier === 'custom-b')).toBe(true);
  });

  it('repairs prompt maps without dropping entries', () => {
    const repaired = repairPromptManagerPayload(
      { main: { content: 'Hello' }, custom: { content: 'Custom' } },
      { main: true, custom: true },
    );
    const identifiers = repaired.prompts.map((prompt) => prompt.identifier);
    expect(identifiers).toContain('main');
    expect(identifiers).toContain('custom');
  });

  it('sanitizes missing system prompts and order', () => {
    const result = sanitizePromptManagerPayload({
      prompts: [{ identifier: 'custom', content: 'Hello', role: 'system' }],
      promptOrder: [],
      fallbackPrompts: DEFAULT_PROMPTS,
      fallbackOrder: DEFAULT_PROMPT_ORDER_LISTS,
    });
    expect(result.repaired).toBe(true);
    const prompts = result.prompts as Array<{ identifier: string }>;
    expect(prompts.some((prompt) => prompt.identifier === 'main')).toBe(true);
    const order = getActivePromptOrderEntries(result.prompt_order);
    expect(order.some((entry) => entry.identifier === 'custom')).toBe(true);
  });
});
