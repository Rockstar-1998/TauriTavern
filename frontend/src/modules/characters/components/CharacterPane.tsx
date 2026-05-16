import { For, Show, type JSX } from 'solid-js';

import { ContextSection } from '@/app/layout/desktop/ContextSection';
import { locale } from '@/shared/i18n';
import { ContextListCard } from '@/shared/components/desktop/ContextListCard';
import type { ContextSectionGroup } from '@/types/ui-desktop';

export function CharacterPane(props: { groups: ContextSectionGroup[] }): JSX.Element {
  return (
    <div class="space-y-6">
      <For each={props.groups}>
        {(group) => (
          <ContextSection title={group.title}>
            <div class="space-y-3">
              <Show when={group.items.length > 0} fallback={<div class="text-sm text-slate-400">{locale.characters.emptyList}</div>}>
                <For each={group.items}>{(item) => <ContextListCard item={item} compact />}</For>
              </Show>
            </div>
          </ContextSection>
        )}
      </For>
    </div>
  );
}
