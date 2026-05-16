import { Show, type JSX } from 'solid-js';

import type { CharacterFormInput } from '@/lib/api/core-client';
import { locale } from '@/shared/i18n';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Field, Input, TextArea } from '@/shared/components/ui';

import {
  CHARACTER_EDITOR_SECTION_ORDER,
  type CharacterEditorSection,
} from '../editor-sections';

export type CharacterEditorForm = CharacterFormInput & {
  avatarFile: File | null;
};

type CharacterEditorModalSharedProps = {
  open: boolean;
  form: CharacterEditorForm;
  worldNames: string[];
  pending?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: <T extends keyof CharacterEditorForm>(field: T, value: CharacterEditorForm[T]) => void;
};

type CharacterEditorModalProps =
  | (CharacterEditorModalSharedProps & {
      mode: 'create';
    })
  | (CharacterEditorModalSharedProps & {
      mode: 'edit';
      section: CharacterEditorSection;
    });

function parseAlternateGreetings(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Section(props: { title: string; children: JSX.Element; showTitle?: boolean }): JSX.Element {
  return (
    <section class="space-y-4">
      <Show when={props.showTitle ?? true}>
        <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">{props.title}</h3>
      </Show>
      <div class="grid gap-4 xl:grid-cols-2">{props.children}</div>
    </section>
  );
}

function sectionLabel(section: CharacterEditorSection): string {
  switch (section) {
    case 'basic-info':
      return locale.characters.basicInfo;
    case 'character-setup':
      return locale.characters.characterSetup;
    case 'conversation-parameters':
      return locale.characters.conversationParameters;
    case 'prompt-and-notes':
      return locale.characters.promptAndNotes;
  }
}

function sectionEditTitle(section: CharacterEditorSection): string {
  switch (section) {
    case 'basic-info':
      return locale.characters.editBasicInfo;
    case 'character-setup':
      return locale.characters.editCharacterSetup;
    case 'conversation-parameters':
      return locale.characters.editConversationParameters;
    case 'prompt-and-notes':
      return locale.characters.editPromptAndNotes;
  }
}

function renderBasicInfoFields(props: CharacterEditorModalSharedProps): JSX.Element {
  return (
    <>
      <Field label={locale.characters.name}><Input value={props.form.name} onInput={(event) => props.onChange('name', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.creator}><Input value={props.form.creator} onInput={(event) => props.onChange('creator', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.version}><Input value={props.form.version} onInput={(event) => props.onChange('version', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.world}>
        <Input list="character-world-info-options" value={props.form.world} onInput={(event) => props.onChange('world', event.currentTarget.value)} />
        <datalist id="character-world-info-options">
          {props.worldNames.map((world) => <option value={world} />)}
        </datalist>
      </Field>
      <Field label={locale.characters.tags} hint={locale.characters.tagsHint}><Input value={(props.form.tags ?? []).join(', ')} onInput={(event) => props.onChange('tags', event.currentTarget.value.split(',').map((item) => item.trim()).filter(Boolean))} /></Field>
      <Field label={locale.characters.favorites}>
        <label class="tt-input-surface inline-flex w-full items-center gap-3 rounded-[1.2rem] px-3 py-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            aria-label={locale.characters.favorites}
            checked={Boolean(props.form.favorite)}
            onChange={(event) => props.onChange('favorite', event.currentTarget.checked)}
          />
          <span>{Boolean(props.form.favorite) ? locale.common.yes : locale.common.no}</span>
        </label>
      </Field>
      <Field label={locale.characters.avatar}>
        <input type="file" accept="image/*" class="text-sm text-slate-700" onChange={(event) => props.onChange('avatarFile', event.currentTarget.files?.[0] ?? null)} />
      </Field>
      <Show when={props.form.avatarFile}><div class="text-sm text-slate-500">{locale.characters.avatarSelected}{props.form.avatarFile?.name}</div></Show>
    </>
  );
}

function renderCharacterSetupFields(props: CharacterEditorModalSharedProps): JSX.Element {
  return (
    <>
      <Field label={locale.characters.description}><TextArea value={props.form.description} onInput={(event) => props.onChange('description', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.personality}><TextArea value={props.form.personality} onInput={(event) => props.onChange('personality', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.scenario}><TextArea value={props.form.scenario} onInput={(event) => props.onChange('scenario', event.currentTarget.value)} /></Field>
    </>
  );
}

function renderConversationParameterFields(props: CharacterEditorModalSharedProps): JSX.Element {
  const talkativeness = () => Number(props.form.talkativeness ?? 0.5).toFixed(2);

  return (
    <>
      <Field label={locale.characters.firstMessage}><TextArea value={props.form.firstMessage} onInput={(event) => props.onChange('firstMessage', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.alternateGreetings}>
        <TextArea
          aria-label={locale.characters.alternateGreetings}
          value={(props.form.alternateGreetings ?? []).join('\n')}
          onInput={(event) => props.onChange('alternateGreetings', parseAlternateGreetings(event.currentTarget.value))}
        />
      </Field>
      <Field label={locale.characters.exampleMessages}><TextArea value={props.form.exampleMessages} onInput={(event) => props.onChange('exampleMessages', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.talkativeness} hint={talkativeness()}>
        <div class="tt-input-surface rounded-[1.2rem] px-3 py-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label={locale.characters.talkativeness}
            value={String(props.form.talkativeness ?? 0.5)}
            class="w-full accent-slate-800"
            onInput={(event) => props.onChange('talkativeness', Number(event.currentTarget.value))}
          />
          <div class="mt-2 text-xs text-slate-500">{talkativeness()}</div>
        </div>
      </Field>
    </>
  );
}

function renderPromptAndNotesFields(props: CharacterEditorModalSharedProps): JSX.Element {
  return (
    <>
      <Field label={locale.characters.systemPrompt}><TextArea value={props.form.systemPrompt} onInput={(event) => props.onChange('systemPrompt', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.postHistoryInstructions}><TextArea value={props.form.postHistoryInstructions} onInput={(event) => props.onChange('postHistoryInstructions', event.currentTarget.value)} /></Field>
      <Field label={locale.characters.creatorNotes}><TextArea value={props.form.creatorNotes} onInput={(event) => props.onChange('creatorNotes', event.currentTarget.value)} /></Field>
    </>
  );
}

function renderSectionFields(props: CharacterEditorModalSharedProps, section: CharacterEditorSection): JSX.Element {
  switch (section) {
    case 'basic-info':
      return renderBasicInfoFields(props);
    case 'character-setup':
      return renderCharacterSetupFields(props);
    case 'conversation-parameters':
      return renderConversationParameterFields(props);
    case 'prompt-and-notes':
      return renderPromptAndNotesFields(props);
  }
}

export function CharacterEditorModal(props: CharacterEditorModalProps): JSX.Element {
  const title = () => (props.mode === 'create' ? locale.characters.createTitle : sectionEditTitle(props.section));
  const sections = () => (props.mode === 'create' ? CHARACTER_EDITOR_SECTION_ORDER : [props.section]);

  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={title()}
      size={props.mode === 'create' ? 'xl' : 'md'}
      footer={
        <div class="flex justify-end gap-3">
          <Button variant="secondary" onClick={props.onClose}>{locale.common.cancel}</Button>
          <Button onClick={props.onSubmit} disabled={props.pending || !props.form.name?.trim()}>{props.mode === 'create' ? locale.characters.createCharacter : locale.common.save}</Button>
        </div>
      }
    >
      <div class="space-y-6">
        {sections().map((section) => (
          <Section title={sectionLabel(section)} showTitle={props.mode === 'create'}>
            {renderSectionFields(props, section)}
          </Section>
        ))}
      </div>
    </WorkbenchModal>
  );
}
