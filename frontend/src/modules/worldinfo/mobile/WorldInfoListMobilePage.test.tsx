import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const controllerMocks = vi.hoisted(() => ({
  openCreate: vi.fn(),
  importWorldInfo: vi.fn(),
  setBookSearch: vi.fn(),
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
}));

vi.mock('../controller', () => ({
  createWorldInfoController: () => ({
    bookSearch: () => '',
    setBookSearch: controllerMocks.setBookSearch,
    filteredBooks: () => [],
    settingsQuery: { isPending: false },
    importWorldInfoMutation: {
      isPending: false,
      mutateAsync: controllerMocks.importWorldInfo,
    },
    bookDialog: () => ({ open: false }),
    bookDialogTitle: () => locale.worldInfo.createBook,
    bookDialogConfirmLabel: () => locale.common.create,
    bookNameInput: () => '',
    bookPending: () => false,
    setBookNameInput: vi.fn(),
    closeBookDialog: vi.fn(),
    submitBookDialog: vi.fn(),
    openCreate: controllerMocks.openCreate,
    selectBook: vi.fn(),
  }),
}));

vi.mock('@/shared/components/desktop/SearchField', () => ({
  SearchField: (props: { value: string; onInput: (event: Event & { currentTarget: HTMLInputElement }) => void; placeholder: string }) => (
    <input value={props.value} onInput={props.onInput as any} placeholder={props.placeholder} />
  ),
}));

vi.mock('../components/WorldInfoCreateBookModal', () => ({
  WorldInfoCreateBookModal: () => null,
}));

import WorldInfoListMobilePage from './WorldInfoListMobilePage';

describe('WorldInfoListMobilePage', () => {
  it('keeps create and import world book actions visible on mobile', async () => {
    const view = render(() => <WorldInfoListMobilePage />);

    await fireEvent.click(screen.getByRole('button', { name: locale.worldInfo.createBook }));

    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();
    const file = new File(['{}'], 'world.json', { type: 'application/json' });
    await fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(controllerMocks.openCreate).toHaveBeenCalledTimes(1);
    expect(controllerMocks.importWorldInfo).toHaveBeenCalledWith(file);
    expect(screen.getByText(locale.worldInfo.importBook)).toBeTruthy();
  });
});
