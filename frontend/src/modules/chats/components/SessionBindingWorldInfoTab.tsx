import { ArrowDown, ArrowUp, Plus } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, EmptyState, Tag } from '@/shared/components/ui';

export function SessionBindingWorldInfoTab(props: {
  value: string[];
  availableNames: string[];
  disabled?: boolean;
  onAdd: (name: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (name: string) => void;
}): JSX.Element {
  const missingNames = () => props.value.filter((name) => !props.availableNames.includes(name));
  const availableToAdd = () => props.availableNames.filter((name) => !props.value.includes(name));

  return (
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <section class="grid gap-3">
        <div>
          <h3 class="text-base font-semibold text-slate-900">{locale.chats.bindingSelectedWorldInfo}</h3>
          <p class="mt-1 text-sm text-slate-500">{locale.chats.bindingWorldInfoHint}</p>
        </div>

        <Show
          when={props.value.length > 0}
          fallback={<EmptyState title={locale.chats.bindingNoWorldInfoBound} description={locale.chats.bindingWorldInfoEmptyHint} />}
        >
          <div class="grid gap-3">
            <For each={props.value}>{(name, index) => (
              <div class="tt-card-surface flex items-center justify-between gap-3 rounded-[1.4rem] px-4 py-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium text-slate-900" title={name}>{name}</div>
                  <Show when={missingNames().includes(name)}>
                    <div class="mt-1"><Tag tone="danger">{locale.chats.bindingMissingResource}</Tag></div>
                  </Show>
                </div>
                <div class="flex shrink-0 gap-2">
                  <Button variant="ghost" class="h-10 w-10 px-0" onClick={() => props.onMove(index(), -1)} disabled={props.disabled || index() === 0}>
                    <ArrowUp size={16} />
                  </Button>
                  <Button variant="ghost" class="h-10 w-10 px-0" onClick={() => props.onMove(index(), 1)} disabled={props.disabled || index() === props.value.length - 1}>
                    <ArrowDown size={16} />
                  </Button>
                  <Button variant="ghost" onClick={() => props.onRemove(name)} disabled={props.disabled}>{locale.common.remove}</Button>
                </div>
              </div>
            )}</For>
          </div>
        </Show>
      </section>

      <section class="grid gap-3">
        <div>
          <h3 class="text-base font-semibold text-slate-900">{locale.chats.bindingAvailableWorldInfo}</h3>
          <p class="mt-1 text-sm text-slate-500">{locale.chats.bindingWorldInfoAvailableHint}</p>
        </div>

        <Show
          when={availableToAdd().length > 0}
          fallback={<EmptyState title={locale.chats.bindingNoWorldInfoAvailable} description={locale.chats.bindingWorldInfoUnavailableHint} />}
        >
          <div class="grid gap-3">
            <For each={availableToAdd()}>{(name) => (
              <div class="tt-card-surface flex items-center justify-between gap-3 rounded-[1.4rem] px-4 py-3">
                <div class="min-w-0 truncate text-sm font-medium text-slate-900" title={name}>{name}</div>
                <Button variant="secondary" onClick={() => props.onAdd(name)} disabled={props.disabled} class="gap-2">
                  <Plus size={16} />
                  {locale.common.add}
                </Button>
              </div>
            )}</For>
          </div>
        </Show>
      </section>
    </div>
  );
}
