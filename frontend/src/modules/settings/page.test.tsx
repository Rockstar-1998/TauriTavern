import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { render, screen, waitFor } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';
import type { ApiProfile, Snapshot } from '@/types/domain';

const mocks = vi.hoisted(() => ({
  searchParams: {
    panel: undefined as string | undefined,
    section: undefined as string | undefined,
    selected: undefined as string | undefined,
  },
  navigate: vi.fn(),
  toastPush: vi.fn(),
  getSettings: vi.fn(),
  listSnapshots: vi.fn(),
  saveSettings: vi.fn(),
  makeSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  loadSnapshot: vi.fn(),
  readSecretState: vi.fn(),
  writeSecret: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.searchParams],
}));

vi.mock('@/app/providers', () => ({
  useToasts: () => ({ push: mocks.toastPush }),
}));

vi.mock('@/app/layout/desktop/DesktopContextPane', () => ({
  DesktopContextPane: (props: { children: JSX.Element }) => <div data-testid="desktop-context-pane">{props.children}</div>,
}));

vi.mock('@/app/layout/desktop/DesktopWorkspaceBoard', () => ({
  DesktopWorkspaceBoard: (props: { children: JSX.Element }) => <div data-testid="desktop-workspace-board">{props.children}</div>,
}));

vi.mock('@/app/layout/desktop/ContextToolbar', () => ({
  ContextToolbar: (props: { title: string; subtitle?: string }) => (
    <div>
      <div>{props.title}</div>
      {props.subtitle ? <div>{props.subtitle}</div> : null}
    </div>
  ),
}));

vi.mock('./components/ApiProfileEditorModal', () => ({
  ApiProfileEditorModal: () => null,
}));

vi.mock('@/lib/api/core-client', () => ({
  coreApiClient: {
    getSettings: (...args: unknown[]) => mocks.getSettings(...args),
    settings: {
      listSnapshots: (...args: unknown[]) => mocks.listSnapshots(...args),
      save: (...args: unknown[]) => mocks.saveSettings(...args),
      makeSnapshot: (...args: unknown[]) => mocks.makeSnapshot(...args),
      restoreSnapshot: (...args: unknown[]) => mocks.restoreSnapshot(...args),
      loadSnapshot: (...args: unknown[]) => mocks.loadSnapshot(...args),
    },
    secrets: {
      readState: (...args: unknown[]) => mocks.readSecretState(...args),
      write: (...args: unknown[]) => mocks.writeSecret(...args),
    },
    generation: {
      listModels: (...args: unknown[]) => mocks.listModels(...args),
    },
  },
}));

import SettingsPage from './page';

const sampleProfile = {
  id: 'profile-a',
  name: 'Alpha',
  settings: {
    chat_completion_source: 'openai',
    openai_model: 'gpt-4.1',
  },
  updated_at: '2026-03-09T03:00:00Z',
} as ApiProfile;

const sampleSnapshot = {
  name: 'snapshot-1',
  created_at: '2026-03-09T03:10:00Z',
} as Snapshot;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(() => (
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>
  ));
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.toastPush.mockReset();
    mocks.getSettings.mockReset();
    mocks.listSnapshots.mockReset();
    mocks.saveSettings.mockReset();
    mocks.makeSnapshot.mockReset();
    mocks.restoreSnapshot.mockReset();
    mocks.loadSnapshot.mockReset();
    mocks.readSecretState.mockReset();
    mocks.writeSecret.mockReset();
    mocks.listModels.mockReset();

    mocks.searchParams.panel = undefined;
    mocks.searchParams.section = undefined;
    mocks.searchParams.selected = undefined;

    mocks.getSettings.mockResolvedValue({
      name1: 'Tester',
      world_names: ['World A', 'World B'],
      themes: ['Default'],
      api_profiles: [sampleProfile],
    });
    mocks.listSnapshots.mockResolvedValue([sampleSnapshot]);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.makeSnapshot.mockResolvedValue(undefined);
    mocks.restoreSnapshot.mockResolvedValue(undefined);
    mocks.loadSnapshot.mockResolvedValue(undefined);
    mocks.readSecretState.mockResolvedValue({ state: 'ok' });
    mocks.writeSecret.mockResolvedValue(undefined);
    mocks.listModels.mockResolvedValue({ data: [] });
  });

  it('normalizes missing search params to system/general and renders inline content', async () => {
    renderPage();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/settings?panel=system&section=general', { replace: true }));
    await waitFor(() => expect(screen.getAllByText(locale.settings.generalSection).length).toBeGreaterThan(0));

    expect(screen.queryByText('Quick Start')).toBeNull();
    expect(screen.queryByText('下午好')).toBeNull();
  });

  it('redirects presets compatibility routes', async () => {
    mocks.searchParams.panel = 'presets';

    renderPage();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/presets?apiId=openai', { replace: true }));
  });

  it('normalizes invalid panels back to the first settings section', async () => {
    mocks.searchParams.panel = 'invalid-panel';
    mocks.searchParams.section = 'invalid-section';

    renderPage();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/settings?panel=system&section=general', { replace: true }));
  });

  it('auto-selects the first api profile in the inline split workspace', async () => {
    mocks.searchParams.panel = 'api-profiles';
    mocks.searchParams.section = 'profiles';

    renderPage();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/settings?panel=api-profiles&section=profiles&selected=profile-a', { replace: true }));
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  });

  it('auto-selects the first snapshot in the inline split workspace', async () => {
    mocks.searchParams.panel = 'snapshots';
    mocks.searchParams.section = 'library';

    renderPage();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/settings?panel=snapshots&section=library&selected=snapshot-1', { replace: true }));
    await waitFor(() => expect(screen.getByText('snapshot-1')).toBeTruthy());
  });
});
