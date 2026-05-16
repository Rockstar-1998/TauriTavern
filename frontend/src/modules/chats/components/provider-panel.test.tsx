import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { ChatProviderDraft } from '@/types/domain';
import { locale } from '@/shared/i18n';

import { ProviderPanel } from './provider-panel';

const baseDraft: ChatProviderDraft = {
  chat_completion_source: 'openai',
  model: 'gpt-4.1-mini',
  openai_model: 'gpt-4.1-mini',
  openrouter_model: '',
  claude_model: '',
  google_model: '',
  deepseek_model: '',
  moonshot_model: '',
  siliconflow_model: '',
  zai_model: '',
  custom_model: '',
  reverse_proxy: '',
  proxy_password: '',
  custom_url: '',
  custom_include_headers: '',
  custom_include_body: '',
  custom_exclude_body: '',
  openai_max_context: '',
  bypass_status_check: false,
};

describe('ProviderPanel', () => {
  it('shows custom-only fields for custom source', () => {
    render(() => (
      <ProviderPanel
        draft={{ ...baseDraft, chat_completion_source: 'custom', model: 'local-model', custom_model: 'local-model' }}
        modelOptions={[]}
        onSourceChange={vi.fn()}
        onModelChange={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshModels={vi.fn()}
        onSaveDefaults={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    ));

    expect(screen.getByText(locale.chats.providerPanel.customUrlLabel)).toBeTruthy();
    expect(screen.getByText(locale.chats.providerPanel.customIncludeBodyLabel)).toBeTruthy();
  });

  it('hides custom-only fields for non-custom source', () => {
    render(() => (
      <ProviderPanel
        draft={baseDraft}
        modelOptions={[]}
        onSourceChange={vi.fn()}
        onModelChange={vi.fn()}
        onFieldChange={vi.fn()}
        onRefreshModels={vi.fn()}
        onSaveDefaults={vi.fn()}
        onResetDefaults={vi.fn()}
      />
    ));

    expect(screen.getByText(locale.chats.providerPanel.maxContextLabel)).toBeTruthy();
    expect(screen.queryByText(locale.chats.providerPanel.customUrlLabel)).toBeNull();
  });
});
