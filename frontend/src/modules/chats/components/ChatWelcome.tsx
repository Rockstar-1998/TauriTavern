import type { JSX } from 'solid-js';

import { locale } from '@/shared/i18n';

export function ChatWelcome(props: { greeting: string }): JSX.Element {
  return (
    <div class="flex h-full min-h-0 items-center justify-center px-6 text-center">
      <div class="tt-panel-surface max-w-xl rounded-[2rem] px-10 py-12 text-slate-600 shadow-sm">
        <p class="text-2xl font-semibold text-slate-900">{`${props.greeting}，${locale.chats.clickSessionToContinue}`}</p>
      </div>
    </div>
  );
}
