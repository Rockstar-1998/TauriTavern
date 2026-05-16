import { ArrowDownToLine, MessageSquarePlus, Users } from 'lucide-solid';
import type { JSX } from 'solid-js';

import { Button } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

export function MobileChatActionBar(props: {
  onCreate: () => void;
  onJoinRoom: () => void;
  onImport: (file: File) => void;
}): JSX.Element {
  return (
    <div class="border-b bg-slate-50 px-3 py-2">
      <div class="no-scrollbar flex gap-2 overflow-x-auto">
        <Button variant="secondary" class="shrink-0" onClick={props.onCreate}>
          <MessageSquarePlus size={16} class="mr-2" />
          {locale.chats.newChat}
        </Button>
        <Button variant="secondary" class="shrink-0" onClick={props.onJoinRoom}>
          <Users size={16} class="mr-2" />
          {locale.chats.joinRoom}
        </Button>
        <label class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[1.2rem] bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition active:bg-slate-200" title={locale.chats.importChat}>
          <ArrowDownToLine size={16} class="mr-2" />
          {locale.chats.importChat}
          <input
            type="file"
            class="hidden"
            accept=".json,.jsonl"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                props.onImport(file);
              }
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
