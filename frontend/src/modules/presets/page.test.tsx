import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: {
    apiId: undefined as string | undefined,
    selected: undefined as string | undefined,
  },
}));

const apiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  listPresets: vi.fn(),
  getPreset: vi.fn(),
  restorePreset: vi.fn(),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  saveSettings: vi.fn(),
  toastPush: vi.fn(),
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
  useSearchParams: () => [routerMocks.searchParams],
  useBeforeLeave: () => undefined,
}));

vi.mock('@/app/providers', () => ({
  useToasts: () => ({ push: apiMocks.toastPush }),
}));

vi.mock('@/lib/api/core-client', () => ({
  coreApiClient: {
    getSettings: (...args: unknown[]) => apiMocks.getSettings(...args),
    settings: {
      save: (...args: unknown[]) => apiMocks.saveSettings(...args),
    },
    presets: {
      list: (...args: unknown[]) => apiMocks.listPresets(...args),
      get: (...args: unknown[]) => apiMocks.getPreset(...args),
      restore: (...args: unknown[]) => apiMocks.restorePreset(...args),
      save: (...args: unknown[]) => apiMocks.savePreset(...args),
      delete: (...args: unknown[]) => apiMocks.deletePreset(...args),
    },
  },
}));

vi.mock('@/app/layout/desktop/DesktopContextPane', () => ({
  DesktopContextPane: (props: { children: JSX.Element; floatingActionLabel?: string; onFloatingAction?: () => void }) => (
    <div>
      {props.onFloatingAction ? <button type="button" onClick={props.onFloatingAction}>{props.floatingActionLabel}</button> : null}
      {props.children}
    </div>
  ),
}));

vi.mock('@/app/layout/desktop/DesktopWorkspaceBoard', () => ({
  DesktopWorkspaceBoard: (props: { children: JSX.Element }) => <div>{props.children}</div>,
}));

vi.mock('./components/AdvancedFormattingHubModal', () => ({
  AdvancedFormattingHubModal: (props: { open: boolean; initialApiId?: string; initialSelectedName?: string }) => (
    props.open ? <div>{`AdvancedFormatting:${props.initialApiId ?? ''}:${props.initialSelectedName ?? ''}`}</div> : null
  ),
}));

import PresetsPage from './page';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(() => (
    <QueryClientProvider client={client}>
      <PresetsPage />
    </QueryClientProvider>
  ));
}

describe('PresetsPage', () => {
  beforeEach(() => {
    routerMocks.navigate.mockReset();
    routerMocks.searchParams.apiId = undefined;
    routerMocks.searchParams.selected = undefined;

    apiMocks.getSettings.mockReset();
    apiMocks.listPresets.mockReset();
    apiMocks.getPreset.mockReset();
    apiMocks.restorePreset.mockReset();
    apiMocks.savePreset.mockReset();
    apiMocks.deletePreset.mockReset();
    apiMocks.saveSettings.mockReset();
    apiMocks.toastPush.mockReset();

    apiMocks.getSettings.mockResolvedValue({
      oai_settings: {
        preset_settings_openai: 'Alpha',
        chat_completion_source: 'openai',
        openai_model: 'gpt-4.1',
        prompts: [
          {
            identifier: 'main',
            name: 'Main Prompt',
            content: 'Main',
            role: 'system',
            system_prompt: true,
          },
        ],
        prompt_order: [
          {
            character_id: 100001,
            order: [{ identifier: 'main', enabled: true }],
          },
        ],
      },
      power_user: {
        context: { preset: 'Context Default', story_string: 'Story', example_separator: '***', chat_start: '***' },
        instruct: { preset: 'Alpaca', input_sequence: '### Instruction:', output_sequence: '### Response:' },
        sysprompt: { name: 'Neutral - Chat', content: 'System', post_history: '' },
        reasoning: { name: 'DeepSeek', prefix: '<think>', suffix: '</think>', separator: '\n\n' },
        user_prompt_bias: '',
        show_user_prompt_bias: true,
        model_templates_mappings: {},
      },
    });
    apiMocks.listPresets.mockImplementation((apiId: string) => {
      switch (apiId) {
        case 'openai':
          return Promise.resolve(['Alpha']);
        case 'kobold':
          return Promise.resolve(['Kobold Default']);
        case 'novel':
          return Promise.resolve(['Novel Default']);
        case 'textgenerationwebui':
          return Promise.resolve(['TextGen Default']);
        default:
          return Promise.resolve(['Context Default']);
      }
    });
    apiMocks.getPreset.mockResolvedValue({
      temperature: 1,
      openai_model: 'gpt-4.1',
      chat_completion_source: 'openai',
      prompts: [
        {
          identifier: 'main',
          name: 'Main Prompt',
          content: 'Main',
          role: 'system',
          system_prompt: true,
        },
      ],
      prompt_order: [
        {
          character_id: 100001,
          order: [{ identifier: 'main', enabled: true }],
        },
      ],
      bias_presets: { 'Default (none)': [] },
      bias_preset_selected: 'Default (none)',
      extensions: {},
    });
    apiMocks.saveSettings.mockResolvedValue({ result: 'ok' });
    apiMocks.savePreset.mockResolvedValue({ name: 'Alpha' });
    apiMocks.deletePreset.mockResolvedValue({ ok: true });
  });

  it('canonicalizes /presets to openai and auto-selects the first preset', async () => {
    renderPage();

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith('/presets?apiId=openai', { replace: true }));
    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith('/presets?apiId=openai&selected=Alpha', { replace: true }));
  });

  it('renders completion-only main navigation and syncs live settings for the selected preset', async () => {
    routerMocks.searchParams.apiId = 'openai';
    routerMocks.searchParams.selected = 'Alpha';

    renderPage();

    await waitFor(() => expect(apiMocks.getPreset).toHaveBeenCalledWith('openai', 'Alpha'));
    await waitFor(() => expect(apiMocks.saveSettings).toHaveBeenCalled());

    expect(screen.getByText('补全引擎')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /OpenAI/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Kobold/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Context/i })).toBeNull();
    expect(screen.queryByText('Preset JSON')).toBeNull();
    expect(screen.queryByText('绑定预设到连接')).toBeNull();
  });

  it('hides model/source fields in the parameters editor', async () => {
    routerMocks.searchParams.apiId = 'openai';
    routerMocks.searchParams.selected = 'Alpha';

    renderPage();

    await waitFor(() => expect(apiMocks.getPreset).toHaveBeenCalledWith('openai', 'Alpha'));

    const parametersCard = await screen.findByRole('button', { name: '参数' });
    fireEvent.click(parametersCard);

    expect(screen.queryByText('聊天补全来源')).toBeNull();
    expect(screen.queryByText('OpenAI 模型')).toBeNull();
    expect(screen.queryByText('Claude 模型')).toBeNull();
  });

  it('inherits prompt manager data when preset is missing prompts', async () => {
    routerMocks.searchParams.apiId = 'openai';
    routerMocks.searchParams.selected = 'Alpha';

    apiMocks.getPreset.mockResolvedValueOnce({
      temperature: 1,
      chat_completion_source: 'openai',
      openai_model: 'gpt-4.1',
      extensions: {},
    });

    renderPage();

    await waitFor(() => expect(apiMocks.getPreset).toHaveBeenCalledWith('openai', 'Alpha'));
    await waitFor(() => expect(apiMocks.saveSettings).toHaveBeenCalled());

    await waitFor(() => {
      const titles = apiMocks.toastPush.mock.calls.map((call) => call[0]?.title).filter(Boolean);
      expect(titles).toContain('预设缺少词条，已沿用当前词条数据保存。');
    });
  });

  it('shows a toast when prompt maps are migrated', async () => {
    routerMocks.searchParams.apiId = 'openai';
    routerMocks.searchParams.selected = 'Alpha';

    apiMocks.getPreset.mockResolvedValueOnce({
      temperature: 1,
      prompts: { main: { content: 'Main', role: 'system' } },
      prompt_order: [{ identifier: 'main', enabled: true }],
    });

    renderPage();

    await waitFor(() => expect(apiMocks.getPreset).toHaveBeenCalledWith('openai', 'Alpha'));

    await waitFor(() => {
      const titles = apiMocks.toastPush.mock.calls.map((call) => call[0]?.title).filter(Boolean);
      expect(titles).toContain('检测到旧格式词条字典，已迁移。');
    });
  });

  it('shows advanced-formatting as a secondary action instead of a main rail button', async () => {
    routerMocks.searchParams.apiId = 'openai';
    routerMocks.searchParams.selected = 'Alpha';

    renderPage();

    await waitFor(() => expect(apiMocks.getPreset).toHaveBeenCalledWith('openai', 'Alpha'));

    expect(screen.getByRole('button', { name: '高级格式…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Context/i })).toBeNull();
  });

  it('redirects legacy advanced-formatting urls back to the completion route', async () => {
    routerMocks.searchParams.apiId = 'context';
    routerMocks.searchParams.selected = 'Context Default';

    renderPage();

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith('/presets?apiId=openai', { replace: true }));
    expect(screen.queryByRole('button', { name: /Context/i })).toBeNull();
  });
});
