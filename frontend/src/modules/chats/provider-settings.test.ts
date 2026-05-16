import { describe, expect, it } from 'vitest';

import type { AppSettings } from '@/types/domain';

import { readProviderSettings, setProviderModel, setProviderSource, toPersistedProviderSettings, writeProviderSettings } from './provider-settings';

describe('provider settings helpers', () => {
  it('reads legacy root-level provider fields as fallback', () => {
    const settings = {
      name1: 'You',
      world_names: [],
      themes: [],
      chat_completion_source: 'claude',
      claude_model: 'claude-3-7-sonnet',
      reverse_proxy: 'https://proxy.example.com',
      openai_max_context: '8192',
    } as unknown as AppSettings;

    const draft = readProviderSettings(settings);
    expect(draft.chat_completion_source).toBe('claude');
    expect(draft.model).toBe('claude-3-7-sonnet');
    expect(draft.reverse_proxy).toBe('https://proxy.example.com');
    expect(draft.openai_max_context).toBe('8192');
  });

  it('switches source using remembered model', () => {
    const draft = readProviderSettings({
      name1: 'You',
      world_names: [],
      themes: [],
      oai_settings: {
        chat_completion_source: 'openai',
        openai_model: 'gpt-4.1-mini',
        claude_model: 'claude-3-7-sonnet',
      },
    } as unknown as AppSettings);

    const switched = setProviderSource(draft, 'claude');
    expect(switched.model).toBe('claude-3-7-sonnet');
  });

  it('writes current model back into oai_settings', () => {
    const draft = {
      ...setProviderModel(readProviderSettings({} as AppSettings), 'gpt-4.1'),
      openai_max_context: '4096',
    };
    const saved = writeProviderSettings({ name1: 'You', world_names: [], themes: [], api_profiles: [] } as unknown as AppSettings, draft);
    expect((saved.oai_settings as Record<string, unknown>).openai_model).toBe('gpt-4.1');
    expect((saved.oai_settings as Record<string, unknown>).chat_completion_source).toBe('openai');
    expect((saved.oai_settings as Record<string, unknown>).openai_max_context).toBe('4096');
  });

  it('builds persisted provider settings without relying on draft-only model field', () => {
    const persisted = toPersistedProviderSettings({
      ...readProviderSettings({} as AppSettings),
      chat_completion_source: 'custom',
      model: 'deepseek-v4-lite-web-think',
      custom_model: 'deepseek-v4-lite-web-think',
      reverse_proxy: 'https://sunlea.de/v1',
      openai_max_context: '1000000',
    });

    expect(persisted.chat_completion_source).toBe('custom');
    expect(persisted.custom_model).toBe('deepseek-v4-lite-web-think');
    expect(persisted.openai_max_context).toBe('1000000');
    expect('model' in persisted).toBe(false);
  });
});
