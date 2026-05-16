import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const sessionCatalogMocks = vi.hoisted(() => ({
  setSearch: vi.fn(),
  setFilter: vi.fn(),
  sessionsQuery: { isPending: false, data: [] as unknown[] },
}));

vi.mock('@solidjs/router', () => ({
  useNavigate: () => routerMocks.navigate,
}));

vi.mock('../session-catalog-controller', () => ({
  createChatSessionCatalogController: () => ({
    search: () => '',
    setSearch: sessionCatalogMocks.setSearch,
    filter: () => 'all',
    setFilter: sessionCatalogMocks.setFilter,
    sessionsQuery: sessionCatalogMocks.sessionsQuery,
  }),
}));

vi.mock('@/shared/components/desktop/SearchField', () => ({
  SearchField: (props: { value: string; onInput: (event: Event & { currentTarget: HTMLInputElement }) => void; placeholder: string }) => (
    <input value={props.value} onInput={props.onInput as any} placeholder={props.placeholder} />
  ),
}));

vi.mock('../components/ChatSessionListCard', () => ({
  ChatSessionListCard: () => <div data-testid="session-card" />,
}));

import ChatsListMobilePage from './ChatsListMobilePage';

describe('ChatsListMobilePage', () => {
  it('shows explicit mobile multiplayer entry buttons', async () => {
    render(() => <ChatsListMobilePage />);

    expect(screen.getByText('多人联机')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: '创建联机会话（房主）' }));
    await fireEvent.click(screen.getByRole('button', { name: '加入联机房间' }));

    expect(routerMocks.navigate).toHaveBeenNthCalledWith(1, '/characters');
    expect(routerMocks.navigate).toHaveBeenNthCalledWith(2, '/characters?intent=join-room');
    expect(routerMocks.navigate).toHaveBeenCalledTimes(2);
    expect(screen.getByText(locale.chats.emptySessions)).toBeTruthy();
  });
});
