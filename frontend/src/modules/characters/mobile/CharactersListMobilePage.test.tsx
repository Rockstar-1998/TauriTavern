import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const controllerMocks = vi.hoisted(() => ({
  openCreate: vi.fn(),
  importCharacter: vi.fn(),
  setSearch: vi.fn(),
  selectCharacter: vi.fn(),
}));

const searchParamMocks = vi.hoisted(() => ({
  intent: undefined as string | undefined,
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
  useSearchParams: () => [searchParamMocks, vi.fn()],
}));

vi.mock('../controller', () => ({
  createCharactersController: () => ({
    search: () => '',
    setSearch: controllerMocks.setSearch,
    favorites: () => [{ name: 'Alice', avatar: 'alice.png', description: '' }],
    regularCharacters: () => [],
    charactersQuery: { isPending: false },
    editorModal: () => null,
    importCharacterMutation: {
      isPending: false,
      mutateAsync: controllerMocks.importCharacter,
    },
    openCreate: controllerMocks.openCreate,
    selectCharacter: (id: string) => {
      controllerMocks.selectCharacter(id);
      routerMocks.navigate(
        searchParamMocks.intent === 'join-room'
          ? `/chats/character/${encodeURIComponent(id)}?join=room`
          : `/characters/${encodeURIComponent(id)}`,
      );
    },
  }),
}));

vi.mock('@/shared/components/desktop/SearchField', () => ({
  SearchField: (props: { value: string; onInput: (event: Event & { currentTarget: HTMLInputElement }) => void; placeholder: string }) => (
    <input value={props.value} onInput={props.onInput as any} placeholder={props.placeholder} />
  ),
}));

import CharactersListMobilePage from './CharactersListMobilePage';

describe('CharactersListMobilePage', () => {
  it('keeps create and import actions visible on mobile', async () => {
    searchParamMocks.intent = undefined;
    controllerMocks.selectCharacter.mockReset();
    const view = render(() => <CharactersListMobilePage />);

    await fireEvent.click(screen.getByRole('button', { name: locale.characters.createCharacter }));

    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    const file = new File(['{}'], 'hero.charx', { type: 'application/octet-stream' });
    await fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(controllerMocks.openCreate).toHaveBeenCalledTimes(1);
    expect(controllerMocks.importCharacter).toHaveBeenCalledWith(file);
    expect(screen.getByText(locale.characters.importCharacter)).toBeTruthy();
  });

  it('selects a character and navigates to the chat page when join-room intent is present', async () => {
    searchParamMocks.intent = 'join-room';
    controllerMocks.selectCharacter.mockReset();
    routerMocks.navigate.mockReset();
    render(() => <CharactersListMobilePage />);

    await fireEvent.click(screen.getByRole('button', { name: /Alice/i }));

    expect(controllerMocks.selectCharacter).toHaveBeenCalledWith('alice');
    expect(routerMocks.navigate).toHaveBeenCalledWith('/chats/character/alice?create=single&join=room');
  });
});
