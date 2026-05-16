import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: {
    tab: undefined as string | undefined,
    selected: undefined as string | undefined,
  },
}));

const apiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getWorldInfo: vi.fn(),
  saveWorldInfo: vi.fn(),
  deleteWorldInfo: vi.fn(),
  importWorldInfo: vi.fn(),
  toastPush: vi.fn(),
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
  useSearchParams: () => [routerMocks.searchParams],
}));

vi.mock('@/app/providers', () => ({
  useToasts: () => ({ push: apiMocks.toastPush }),
}));

vi.mock('@/lib/api/core-client', () => ({
  coreApiClient: {
    getSettings: apiMocks.getSettings,
    worldInfo: {
      get: apiMocks.getWorldInfo,
      save: apiMocks.saveWorldInfo,
      delete: apiMocks.deleteWorldInfo,
      import: apiMocks.importWorldInfo,
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

vi.mock('@/app/layout/desktop/ContextToolbar', () => ({
  ContextToolbar: (props: { title: string; subtitle?: string; search?: JSX.Element; actions?: JSX.Element }) => (
    <div>
      <div>{props.title}</div>
      <div>{props.subtitle}</div>
      {props.search}
      {props.actions}
    </div>
  ),
}));

import WorldInfoPage from './page';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(() => (
    <QueryClientProvider client={queryClient}>
      <WorldInfoPage />
    </QueryClientProvider>
  ));
}

describe('WorldInfoPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    routerMocks.navigate.mockReset();
    routerMocks.searchParams.tab = undefined;
    routerMocks.searchParams.selected = 'Book A';

    apiMocks.getSettings.mockReset();
    apiMocks.getWorldInfo.mockReset();
    apiMocks.saveWorldInfo.mockReset();
    apiMocks.deleteWorldInfo.mockReset();
    apiMocks.importWorldInfo.mockReset();
    apiMocks.toastPush.mockReset();

    apiMocks.getSettings.mockResolvedValue({ world_names: ['Book A'] });
    apiMocks.getWorldInfo.mockResolvedValue({
      entries: {
        '1': {
          uid: 1,
          comment: 'Entry One',
          keys: ['alpha'],
          secondary_keys: ['beta'],
          content: 'Lore line one.',
          insertion_order: 80,
          enabled: true,
          extensions: {
            display_index: 0,
            depth: 4,
            probability: 100,
            position: 0,
            role: 0,
          },
        },
      },
    });
    apiMocks.saveWorldInfo.mockResolvedValue({ ok: true });
    apiMocks.deleteWorldInfo.mockResolvedValue({ ok: true });
    apiMocks.importWorldInfo.mockResolvedValue({ name: 'Imported Book' });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('canonicalizes legacy tab params back to the single world-info workspace', async () => {
    routerMocks.searchParams.tab = 'character';

    renderPage();

    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith('/world-info?selected=Book%20A', { replace: true }));
  });

  it('removes overview and fake tabs from the workspace UI', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: locale.worldInfo.newEntry })).toBeTruthy());
    expect(screen.queryByText(locale.common.overview)).toBeNull();
    expect(screen.queryByText('角色书')).toBeNull();
    expect(screen.queryByText('记忆')).toBeNull();
    expect(screen.queryByRole('button', { name: locale.common.edit })).toBeNull();
    expect(screen.getByRole('button', { name: locale.worldInfo.newEntry })).toBeTruthy();
    expect(screen.getByText(locale.worldInfo.renameBook)).toBeTruthy();
    expect(screen.getByText(locale.worldInfo.duplicateBook)).toBeTruthy();
    expect(screen.getByText(locale.worldInfo.exportBook)).toBeTruthy();
  });

  it('creates a new entry and saves the current world book with debounce', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: locale.worldInfo.newEntry })).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: locale.worldInfo.newEntry }));

    expect(apiMocks.saveWorldInfo).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(310);

    await waitFor(() => expect(apiMocks.saveWorldInfo).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveWorldInfo.mock.calls[0][0]).toBe('Book A');
    expect(Object.keys(apiMocks.saveWorldInfo.mock.calls[0][1].entries)).toHaveLength(2);
    expect(screen.getByText(locale.worldInfo.editEntry)).toBeTruthy();
  });
});

