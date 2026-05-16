import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setSearchParams: vi.fn(),
  searchParams: { selected: 'alice' as string | undefined },
}));

const apiMocks = vi.hoisted(() => ({
  listCharacters: vi.fn(),
  getCharacter: vi.fn(),
  getSettings: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  importCharacter: vi.fn(),
  duplicateCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  exportCharacter: vi.fn(),
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
  useSearchParams: () => [routerMocks.searchParams, routerMocks.setSearchParams],
}));

vi.mock('@/app/providers', () => ({
  useToasts: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api/core-client', () => ({
  coreApiClient: {
    getSettings: apiMocks.getSettings,
    characters: {
      list: apiMocks.listCharacters,
      get: apiMocks.getCharacter,
      create: apiMocks.createCharacter,
      update: apiMocks.updateCharacter,
      import: apiMocks.importCharacter,
      duplicate: apiMocks.duplicateCharacter,
      delete: apiMocks.deleteCharacter,
      export: apiMocks.exportCharacter,
    },
  },
}));

vi.mock('@/app/layout/desktop/DesktopContextPane', () => ({
  DesktopContextPane: (props: any) => (
    <div>
      <button type="button" onClick={props.onFloatingAction}>{props.floatingActionLabel}</button>
      {props.children}
    </div>
  ),
}));

vi.mock('@/app/layout/desktop/DesktopWorkspaceBoard', () => ({
  DesktopWorkspaceBoard: (props: any) => <div>{props.children}</div>,
}));

vi.mock('@/app/layout/desktop/ContextToolbar', () => ({
  ContextToolbar: (props: any) => (
    <div>
      <div>{props.title}</div>
      <div>{props.subtitle}</div>
      {props.search}
      {props.actions}
    </div>
  ),
}));

vi.mock('@/app/layout/desktop/WorkspaceWelcome', () => ({
  WorkspaceWelcome: () => <div>Welcome</div>,
}));

vi.mock('@/shared/components/desktop/SearchField', () => ({
  SearchField: (props: any) => <input value={props.value} onInput={props.onInput} placeholder={props.placeholder} />,
}));

vi.mock('@/shared/components/ui', async () => {
  const actual = await vi.importActual<typeof import('@/shared/components/ui')>('@/shared/components/ui');
  return {
    ...actual,
    LoadingBlock: () => <div>Loading</div>,
  };
});

vi.mock('./components/CharacterPane', () => ({
  CharacterPane: () => <div>Character Pane</div>,
}));

vi.mock('./components/CharacterEditorModal', () => ({
  CharacterEditorModal: (props: any) => (props.open ? (
    <div data-testid="character-editor-modal">
      <div data-testid="editor-mode">{props.mode}</div>
      <div data-testid="editor-section">{'section' in props ? props.section : 'create-all'}</div>
      <div data-testid="editor-name">{props.form.name}</div>
    </div>
  ) : null),
}));

import CharactersPage from './page';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(() => (
    <QueryClientProvider client={queryClient}>
      <CharactersPage />
    </QueryClientProvider>
  ));
}

describe('CharactersPage', () => {
  beforeEach(() => {
    routerMocks.navigate.mockReset();
    routerMocks.setSearchParams.mockReset();
    routerMocks.searchParams.selected = 'alice';

    apiMocks.listCharacters.mockReset();
    apiMocks.getCharacter.mockReset();
    apiMocks.getSettings.mockReset();
    apiMocks.createCharacter.mockReset();
    apiMocks.updateCharacter.mockReset();
    apiMocks.importCharacter.mockReset();
    apiMocks.duplicateCharacter.mockReset();
    apiMocks.deleteCharacter.mockReset();
    apiMocks.exportCharacter.mockReset();

    apiMocks.listCharacters.mockResolvedValue([
      {
        name: 'Alice',
        avatar: 'alice.png',
        description: 'A careful strategist.',
        personality: 'Calm and thoughtful.',
        scenario: 'Watching over the guild hall.',
        fav: true,
      },
    ]);

    apiMocks.getCharacter.mockResolvedValue({
      name: 'Alice',
      avatar: 'alice.png',
      description: 'A careful strategist.',
      personality: 'Calm and thoughtful.',
      scenario: 'Watching over the guild hall.',
      first_mes: 'Welcome back.',
      mes_example: 'Alice: We should move at dawn.',
      creator: 'Tester',
      creator_notes: 'Internal note',
      character_version: '1.2',
      system_prompt: 'Stay in character.',
      post_history_instructions: 'Keep answers concise.',
      alternate_greetings: ['Hello there.', 'Ready for the mission?'],
      talkativeness: 0.65,
      fav: true,
      tags: ['leader', 'guild'],
      extensions: { world: 'Guildverse' },
    });

    apiMocks.getSettings.mockResolvedValue({ world_names: ['Guildverse'] });
  });

  it('opens a section-scoped editor modal from workspace cards', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: locale.characters.basicInfo })).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.basicInfo }));

    await waitFor(() => expect(screen.getByTestId('editor-mode').textContent).toBe('edit'));
    expect(screen.getByTestId('editor-section').textContent).toBe('basic-info');
    expect(screen.getByTestId('editor-name').textContent).toBe('Alice');

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.conversationParameters }));

    await waitFor(() => expect(screen.getByTestId('editor-section').textContent).toBe('conversation-parameters'));
  });

  it('keeps the floating create action opening the full create modal', async () => {
    renderPage();

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.createCharacter }));

    await waitFor(() => expect(screen.getByTestId('editor-mode').textContent).toBe('create'));
    expect(screen.getByTestId('editor-section').textContent).toBe('create-all');
    expect(screen.getByTestId('editor-name').textContent).toBe('');
  });
});
