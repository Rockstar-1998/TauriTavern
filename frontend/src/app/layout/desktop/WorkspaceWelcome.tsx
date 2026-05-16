import { For, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import type { ContextListItem, WelcomeCardSpec } from '@/types/ui-desktop';
import { locale } from '@/shared/i18n';
import { QuickStartHero } from '@/shared/components/desktop/QuickStartHero';
import { ContextListCard } from '@/shared/components/desktop/ContextListCard';

export function WorkspaceWelcome(props: {
  greeting: string;
  subtitle?: string;
  hero: WelcomeCardSpec;
  recentItems: ContextListItem[];
}): JSX.Element {
  let welcomeRef: HTMLDivElement | undefined;
  useMotionMount(() => welcomeRef, 'page');

  return (
    <div ref={welcomeRef} class="space-y-8">
      <div>
        <h1 class="text-6xl font-bold tracking-tight text-slate-900">{props.greeting}</h1>
        <p class="mt-3 text-2xl text-slate-500">{props.subtitle ?? locale.greetings.subtitle}</p>
      </div>

      <QuickStartHero title={props.hero.title} description={props.hero.description} actionLabel={props.hero.actionLabel} onAction={props.hero.onAction} />

      <div class="space-y-4">
        <h2 class="text-2xl font-semibold text-slate-900">{locale.greetings.recent}</h2>
        <div class="space-y-4">
          <For each={props.recentItems}>
            {(item) => <ContextListCard item={item} compact={false} />}
          </For>
        </div>
      </div>
    </div>
  );
}
