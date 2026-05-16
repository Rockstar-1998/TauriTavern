import { createQuery } from '@tanstack/solid-query';
import { createSignal } from 'solid-js';

import { coreApiClient } from '@/lib/api/core-client';
import type { ChatSessionFilter } from '@/types/domain';

export function createChatSessionCatalogController() {
  const [search, setSearch] = createSignal('');
  const [filter, setFilter] = createSignal<ChatSessionFilter>('all');

  const sessionsQuery = createQuery(() => ({
    queryKey: ['chat-sessions', filter(), search().trim()],
    queryFn: () => coreApiClient.chats.listSessions(filter(), search().trim()),
  }));

  return {
    search,
    setSearch,
    filter,
    setFilter,
    sessionsQuery,
  };
}
