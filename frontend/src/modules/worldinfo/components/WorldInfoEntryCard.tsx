import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { Tag } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import type { WorldInfoEntry } from '../editor-schema';
import { getWorldInfoEntryContentPreview, getWorldInfoEntryKeywordSummary, getWorldInfoEntryTitle } from '../entry-summary';

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

export function WorldInfoEntryCard(props: {
  entry: WorldInfoEntry;
  onOpen: () => void;
}): JSX.Element {
  let cardRef: HTMLElement | undefined;
  const title = () => getWorldInfoEntryTitle(props.entry);
  const keywordSummary = () => getWorldInfoEntryKeywordSummary(props.entry);
  const contentPreview = () => getWorldInfoEntryContentPreview(props.entry);
  const probabilityVisible = () => props.entry.useProbability;

  useMotionMount(() => cardRef, 'card');
  usePressMotion(() => cardRef as HTMLButtonElement | undefined);

  return (
    <article
      ref={cardRef}
      role="button"
      tabindex={0}
      aria-label={title()}
      class={`tt-card-surface h-full cursor-pointer rounded-[1.8rem] px-5 py-5 transition hover:-translate-y-[1px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${props.entry.disable ? 'opacity-70' : ''}`.trim()}
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onOpen();
        }
      }}
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <div class="truncate text-lg font-semibold text-slate-900">{title()}</div>
          <div class="mt-2 text-sm text-slate-500">{keywordSummary()}</div>
        </div>
        <Tag tone={props.entry.disable ? 'danger' : 'success'}>
          {props.entry.disable ? locale.worldInfo.entryStatusDisabled : locale.worldInfo.entryStatusEnabled}
        </Tag>
      </div>

      <div
        class="tt-muted-surface mt-4 min-h-[92px] rounded-[1.4rem] px-4 py-3 text-sm leading-6 text-slate-700"
        onClick={stopPropagation}
      >
        <div class="line-clamp-3 whitespace-pre-wrap">{contentPreview()}</div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <Tag>{`UID ${props.entry.uid}`}</Tag>
        <Tag>{`order ${props.entry.order}`}</Tag>
        <Tag>{`depth ${props.entry.depth}`}</Tag>
        <Tag>{`pos ${props.entry.position}`}</Tag>
        {probabilityVisible() ? <Tag>{`p ${props.entry.probability}`}</Tag> : null}
        {props.entry.constant ? <Tag>constant</Tag> : null}
        {props.entry.vectorized ? <Tag>vectorized</Tag> : null}
      </div>
    </article>
  );
}
