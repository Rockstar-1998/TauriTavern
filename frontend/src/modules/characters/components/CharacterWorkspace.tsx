import { createEffect, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { Button, Card, EmptyState, Tag } from '@/shared/components/ui';
import { avatarStem } from '@/shared/utils/format';
import type { CharacterDetail } from '@/types/domain';

import type { CharacterEditorSection } from '../editor-sections';

function shortValue(value: string | null | undefined): string {
  return value?.trim() ? value : locale.characters.notSet;
}

function longValue(value: string | null | undefined): string {
  return value?.trim() ? value : locale.characters.notSet;
}

function stopCardOpen(event: Event): void {
  event.stopPropagation();
}

function DetailField(props: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <div class="space-y-2">
      <div class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{props.label}</div>
      <div class="text-sm text-slate-700">{props.children}</div>
    </div>
  );
}

function LongTextField(props: { label: string; value?: string | null }): JSX.Element {
  return (
    <DetailField label={props.label}>
      <div
        class="tt-muted-surface max-h-52 overflow-y-auto whitespace-pre-wrap rounded-[1.2rem] px-4 py-3 leading-7 text-slate-700"
        onClick={stopCardOpen}
      >
        {longValue(props.value)}
      </div>
    </DetailField>
  );
}

function EditableSectionCard(props: {
  section: CharacterEditorSection;
  title: string;
  children: JSX.Element;
  onOpen: (section: CharacterEditorSection) => void;
  class?: string;
}): JSX.Element {
  let sectionRef: HTMLElement | undefined;
  const open = () => props.onOpen(props.section);

  useMotionMount(() => sectionRef, 'card');

  return (
    <section
      ref={sectionRef}
      role="button"
      tabindex={0}
      aria-label={props.title}
      class={`tt-card-surface h-full cursor-pointer rounded-[1.8rem] px-5 py-5 transition hover:-translate-y-[1px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${props.class ?? ''}`.trim()}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
    >
      <header class="mb-4">
        <h2 class="text-lg font-semibold text-slate-900">{props.title}</h2>
      </header>
      {props.children}
    </section>
  );
}

const MULTIPLAYER_CHAT_LABEL = '联机会话';

export function CharacterWorkspace(props: {
  detail?: CharacterDetail;
  onEditSection: (section: CharacterEditorSection) => void;
  onStartChat?: () => void;
  onStartMultiplayerChat?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExportJson: () => void;
  onExportPng: () => void;
}): JSX.Element {
  let workspaceRef: HTMLDivElement | undefined;

  useMotionMount(() => workspaceRef, 'page');

  createEffect(() => {
    console.info('[character-workspace] multiplayer action visibility', {
      detailName: props.detail?.name ?? '',
      hasStartChat: Boolean(props.onStartChat),
      hasStartMultiplayerChat: Boolean(props.onStartMultiplayerChat),
    });
  });

  return (
    <Show when={props.detail} fallback={<EmptyState title={locale.characters.emptyWorkspace} description={locale.characters.emptyWorkspaceHint} />}>
      {(detail) => {
        const title = () => detail().name || avatarStem(detail().avatar);
        const avatarFileName = () => shortValue(detail().avatar);
        const worldName = () => shortValue(typeof detail().extensions?.world === 'string' ? String(detail().extensions.world) : '');
        const tags = () => (detail().tags ?? []).map((tag) => String(tag)).filter(Boolean);
        const alternateGreetings = () => (detail().alternate_greetings ?? []).map((greeting) => String(greeting)).filter((greeting) => greeting.trim().length > 0);
        const talkativeness = () => Number(detail().talkativeness ?? 0.5).toFixed(2);

        return (
          <div ref={workspaceRef} class="space-y-5">
            <Card>
              <div class="flex flex-wrap items-start justify-between gap-5">
                <div class="flex min-w-0 items-start gap-4">
                  <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600">
                    {title().slice(0, 1)}
                  </div>
                  <div class="min-w-0">
                    <h2 class="truncate text-3xl font-semibold text-slate-900">{title()}</h2>
                    <p class="mt-1 text-sm text-slate-500">{locale.characters.parameterWorkspaceSubtitle}</p>
                    <div class="mt-3 flex flex-wrap gap-2">
                      {detail().fav ? <Tag tone="success">{locale.characters.favorites}</Tag> : null}
                      <Show when={tags().length > 0} fallback={<Tag>{locale.characters.notSet}</Tag>}>
                        {tags().map((tag) => <Tag>{tag}</Tag>)}
                      </Show>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  {props.onStartChat ? <Button onClick={props.onStartChat}>{locale.characters.startChat}</Button> : null}
                  {props.onStartMultiplayerChat ? <Button onClick={props.onStartMultiplayerChat}>{MULTIPLAYER_CHAT_LABEL}</Button> : null}
                  <Button variant="secondary" onClick={props.onDuplicate}>{locale.common.duplicate}</Button>
                  <Button variant="secondary" onClick={props.onExportJson}>{locale.characters.exportJson}</Button>
                  <Button variant="secondary" onClick={props.onExportPng}>{locale.characters.exportPng}</Button>
                  <Button variant="danger" onClick={props.onDelete}>{locale.common.delete}</Button>
                </div>
              </div>
            </Card>

            <div class="grid gap-5 xl:grid-cols-2">
              <EditableSectionCard section="basic-info" title={locale.characters.basicInfo} class="h-full" onOpen={props.onEditSection}>
                <div class="grid gap-5 md:grid-cols-2">
                  <DetailField label={locale.characters.name}><span>{shortValue(detail().name)}</span></DetailField>
                  <DetailField label={locale.characters.creator}><span>{shortValue(detail().creator)}</span></DetailField>
                  <DetailField label={locale.characters.version}><span>{shortValue(detail().character_version)}</span></DetailField>
                  <DetailField label={locale.characters.favorites}><span>{detail().fav ? locale.common.yes : locale.common.no}</span></DetailField>
                  <DetailField label={locale.characters.world}><span>{worldName()}</span></DetailField>
                  <DetailField label={locale.characters.avatar}>
                    <div class="flex items-center gap-3">
                      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                        {title().slice(0, 1)}
                      </div>
                      <span class="break-all">{avatarFileName()}</span>
                    </div>
                  </DetailField>
                  <div class="md:col-span-2">
                    <DetailField label={locale.characters.tags}>
                      <Show when={tags().length > 0} fallback={<span>{locale.characters.notSet}</span>}>
                        <div class="flex flex-wrap gap-2">
                          {tags().map((tag) => <Tag>{tag}</Tag>)}
                        </div>
                      </Show>
                    </DetailField>
                  </div>
                </div>
              </EditableSectionCard>

              <EditableSectionCard section="character-setup" title={locale.characters.characterSetup} class="h-full" onOpen={props.onEditSection}>
                <div class="space-y-5">
                  <LongTextField label={locale.characters.description} value={detail().description} />
                  <LongTextField label={locale.characters.personality} value={detail().personality} />
                  <LongTextField label={locale.characters.scenario} value={detail().scenario} />
                </div>
              </EditableSectionCard>

              <EditableSectionCard section="conversation-parameters" title={locale.characters.conversationParameters} class="h-full" onOpen={props.onEditSection}>
                <div class="space-y-5">
                  <LongTextField label={locale.characters.firstMessage} value={detail().first_mes} />
                  <DetailField label={locale.characters.alternateGreetings}>
                    <Show when={alternateGreetings().length > 0} fallback={<div class="tt-muted-surface rounded-[1.2rem] px-4 py-3 text-sm text-slate-700">{locale.characters.notSet}</div>}>
                      <div
                        class="tt-muted-surface max-h-52 overflow-y-auto rounded-[1.2rem] px-4 py-3 text-sm leading-7 text-slate-700"
                        onClick={stopCardOpen}
                      >
                        {alternateGreetings().map((greeting) => <div class="whitespace-pre-wrap">{greeting}</div>)}
                      </div>
                    </Show>
                  </DetailField>
                  <LongTextField label={locale.characters.exampleMessages} value={detail().mes_example} />
                  <DetailField label={locale.characters.talkativeness}><span>{talkativeness()}</span></DetailField>
                </div>
              </EditableSectionCard>

              <EditableSectionCard section="prompt-and-notes" title={locale.characters.promptAndNotes} class="h-full" onOpen={props.onEditSection}>
                <div class="space-y-5">
                  <LongTextField label={locale.characters.systemPrompt} value={detail().system_prompt} />
                  <LongTextField label={locale.characters.postHistoryInstructions} value={detail().post_history_instructions} />
                  <LongTextField label={locale.characters.creatorNotes} value={detail().creator_notes} />
                </div>
              </EditableSectionCard>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
