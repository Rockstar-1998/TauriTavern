import type { JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { locale } from '@/shared/i18n';
import { Button, Card, Field, Input, Select, TextArea } from '@/shared/components/ui';

import type { WorldInfoEntry } from '../editor-schema';

function joinList(values: string[]): string {
  return values.join(', ');
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toTriState(value: boolean | null): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'default';
}

function fromTriState(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function nullableNumberText(value: number | null): string {
  return value == null ? '' : String(value);
}

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function delayText(value: number | boolean | null): string {
  if (value == null) {
    return '';
  }
  return String(value);
}

function parseDelayValue(value: string): number | boolean | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}): JSX.Element {
  return (
    <label class="tt-muted-surface flex items-center justify-between gap-4 rounded-[1.2rem] px-4 py-3 text-sm text-slate-700">
      <div>
        <div class="font-medium text-slate-900">{props.label}</div>
        {props.hint ? <div class="mt-1 text-xs text-slate-500">{props.hint}</div> : null}
      </div>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.currentTarget.checked)} />
    </label>
  );
}

function SectionCard(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <Card title={props.title} class="h-full">
      <div class="grid gap-4">{props.children}</div>
    </Card>
  );
}

export function WorldInfoEntryEditorModal(props: {
  open: boolean;
  entry?: WorldInfoEntry;
  saveDirty?: boolean;
  savePending?: boolean;
  saveError?: string | null;
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onChange: <T extends keyof WorldInfoEntry>(field: T, value: WorldInfoEntry[T]) => void;
}): JSX.Element {
  const entry = () => props.entry;
  const saveSummary = () => {
    if (props.saveError) return props.saveError;
    if (props.savePending) return locale.worldInfo.savePending;
    if (props.saveDirty) return locale.worldInfo.saveDirty;
    return locale.worldInfo.saveSynced;
  };
  const editorLocale = () => locale.worldInfo.editor;

  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={locale.worldInfo.editEntry}
      size="xl"
      actions={
        <>
          <Button variant="secondary" onClick={props.onDuplicate}>{locale.worldInfo.duplicateEntry}</Button>
          <Button variant="danger" onClick={props.onDelete}>{locale.worldInfo.deleteEntry}</Button>
        </>
      }
      footer={
        <div class="flex items-center justify-between gap-4">
          <div class={`text-sm ${props.saveError ? 'text-rose-600' : 'text-slate-500'}`}>{saveSummary()}</div>
          <Button variant="secondary" onClick={props.onClose}>{locale.common.close}</Button>
        </div>
      }
    >
      {entry() ? (
        <div class="grid gap-5 xl:grid-cols-2">
          <SectionCard title={editorLocale().sectionBasic}>
            <Field label={editorLocale().comment}>
              <Input value={entry()!.comment} onInput={(event) => props.onChange('comment', event.currentTarget.value)} />
            </Field>
            <Field label={editorLocale().content}>
              <TextArea value={entry()!.content} onInput={(event) => props.onChange('content', event.currentTarget.value)} class="min-h-[220px]" />
            </Field>
            <ToggleField label={editorLocale().disableEntry} checked={entry()!.disable} onChange={(checked) => props.onChange('disable', checked)} />
            <ToggleField
              label={editorLocale().constantEntry}
              checked={entry()!.constant}
              onChange={(checked) => {
                props.onChange('constant', checked);
                if (checked) {
                  props.onChange('vectorized', false);
                }
              }}
            />
            <ToggleField
              label={editorLocale().vectorEntry}
              checked={entry()!.vectorized}
              onChange={(checked) => {
                props.onChange('vectorized', checked);
                if (checked) {
                  props.onChange('constant', false);
                }
              }}
            />
            <ToggleField label={editorLocale().addMemo} checked={entry()!.addMemo} onChange={(checked) => props.onChange('addMemo', checked)} />
          </SectionCard>

          <SectionCard title={editorLocale().sectionKeywords}>
            <Field label={editorLocale().primaryKeywords}>
              <TextArea value={joinList(entry()!.key)} onInput={(event) => props.onChange('key', splitList(event.currentTarget.value))} class="min-h-[110px]" />
            </Field>
            <Field label={editorLocale().secondaryKeywords}>
              <TextArea value={joinList(entry()!.keysecondary)} onInput={(event) => props.onChange('keysecondary', splitList(event.currentTarget.value))} class="min-h-[110px]" />
            </Field>
            <ToggleField label={editorLocale().selective} checked={entry()!.selective} onChange={(checked) => props.onChange('selective', checked)} />
            <Field label={editorLocale().selectiveLogic}>
              <Select value={String(entry()!.selectiveLogic)} onChange={(event) => props.onChange('selectiveLogic', Number(event.currentTarget.value))}>
                <option value="0">{editorLocale().selectiveLogicAndAny}</option>
                <option value="1">{editorLocale().selectiveLogicNotAll}</option>
                <option value="2">{editorLocale().selectiveLogicNotAny}</option>
                <option value="3">{editorLocale().selectiveLogicAndAll}</option>
              </Select>
            </Field>
            <Field label={editorLocale().caseSensitive}>
              <Select value={toTriState(entry()!.caseSensitive)} onChange={(event) => props.onChange('caseSensitive', fromTriState(event.currentTarget.value))}>
                <option value="default">{editorLocale().triStateDefault}</option>
                <option value="true">{editorLocale().triStateEnabled}</option>
                <option value="false">{editorLocale().triStateDisabled}</option>
              </Select>
            </Field>
            <Field label={editorLocale().matchWholeWords}>
              <Select value={toTriState(entry()!.matchWholeWords)} onChange={(event) => props.onChange('matchWholeWords', fromTriState(event.currentTarget.value))}>
                <option value="default">{editorLocale().triStateDefault}</option>
                <option value="true">{editorLocale().triStateEnabled}</option>
                <option value="false">{editorLocale().triStateDisabled}</option>
              </Select>
            </Field>
            <ToggleField label={editorLocale().useProbability} checked={entry()!.useProbability} onChange={(checked) => props.onChange('useProbability', checked)} />
            <Field label={editorLocale().probability}>
              <Input type="number" value={String(entry()!.probability)} onInput={(event) => props.onChange('probability', Number(event.currentTarget.value || '0'))} />
            </Field>
            <Field label={editorLocale().triggers}>
              <Input value={joinList(entry()!.triggers)} onInput={(event) => props.onChange('triggers', splitList(event.currentTarget.value))} />
            </Field>
          </SectionCard>

          <SectionCard title={editorLocale().sectionInsert}>
            <Field label={editorLocale().insertPosition}>
              <Select value={String(entry()!.position)} onChange={(event) => props.onChange('position', Number(event.currentTarget.value))}>
                <option value="0">{editorLocale().positionBeforeCharacter}</option>
                <option value="1">{editorLocale().positionAfterCharacter}</option>
                <option value="2">{editorLocale().positionAnTop}</option>
                <option value="3">{editorLocale().positionAnBottom}</option>
                <option value="4">{editorLocale().positionAtDepth}</option>
                <option value="5">{editorLocale().positionEmTop}</option>
                <option value="6">{editorLocale().positionEmBottom}</option>
                <option value="7">{editorLocale().positionOutlet}</option>
              </Select>
            </Field>
            <Field label={editorLocale().role}>
              <Select value={String(entry()!.role)} onChange={(event) => props.onChange('role', Number(event.currentTarget.value))}>
                <option value="0">{editorLocale().roleSystem}</option>
                <option value="1">{editorLocale().roleUser}</option>
                <option value="2">{editorLocale().roleAssistant}</option>
              </Select>
            </Field>
            <Field label={editorLocale().order}>
              <Input type="number" value={String(entry()!.order)} onInput={(event) => props.onChange('order', Number(event.currentTarget.value || '0'))} />
            </Field>
            <Field label={editorLocale().depth}>
              <Input type="number" value={String(entry()!.depth)} onInput={(event) => props.onChange('depth', Number(event.currentTarget.value || '0'))} />
            </Field>
            <Field label={editorLocale().scanDepth}>
              <Input value={nullableNumberText(entry()!.scanDepth)} onInput={(event) => props.onChange('scanDepth', parseNullableNumber(event.currentTarget.value))} placeholder={editorLocale().scanDepthPlaceholder} />
            </Field>
            <ToggleField label={editorLocale().ignoreBudget} checked={entry()!.ignoreBudget} onChange={(checked) => props.onChange('ignoreBudget', checked)} />
            <Field label={editorLocale().outletName}>
              <Input value={entry()!.outletName} onInput={(event) => props.onChange('outletName', event.currentTarget.value)} />
            </Field>
          </SectionCard>

          <SectionCard title={editorLocale().sectionRecursion}>
            <ToggleField label={editorLocale().excludeRecursion} checked={entry()!.excludeRecursion} onChange={(checked) => props.onChange('excludeRecursion', checked)} />
            <ToggleField label={editorLocale().preventRecursion} checked={entry()!.preventRecursion} onChange={(checked) => props.onChange('preventRecursion', checked)} />
            <Field label={editorLocale().delayUntilRecursion}>
              <Input value={delayText(entry()!.delayUntilRecursion)} onInput={(event) => props.onChange('delayUntilRecursion', parseDelayValue(event.currentTarget.value))} placeholder={editorLocale().delayUntilRecursionPlaceholder} />
            </Field>
            <Field label={editorLocale().sticky}>
              <Input value={nullableNumberText(entry()!.sticky)} onInput={(event) => props.onChange('sticky', parseNullableNumber(event.currentTarget.value))} />
            </Field>
            <Field label={editorLocale().cooldown}>
              <Input value={nullableNumberText(entry()!.cooldown)} onInput={(event) => props.onChange('cooldown', parseNullableNumber(event.currentTarget.value))} />
            </Field>
            <Field label={editorLocale().delay}>
              <Input value={nullableNumberText(entry()!.delay)} onInput={(event) => props.onChange('delay', parseNullableNumber(event.currentTarget.value))} />
            </Field>
          </SectionCard>

          <SectionCard title={editorLocale().sectionGroup}>
            <Field label={editorLocale().group}>
              <Input value={entry()!.group} onInput={(event) => props.onChange('group', event.currentTarget.value)} />
            </Field>
            <ToggleField label={editorLocale().groupOverride} checked={entry()!.groupOverride} onChange={(checked) => props.onChange('groupOverride', checked)} />
            <Field label={editorLocale().groupWeight}>
              <Input type="number" value={String(entry()!.groupWeight)} onInput={(event) => props.onChange('groupWeight', Number(event.currentTarget.value || '0'))} />
            </Field>
            <Field label={editorLocale().useGroupScoring}>
              <Select value={toTriState(entry()!.useGroupScoring)} onChange={(event) => props.onChange('useGroupScoring', fromTriState(event.currentTarget.value))}>
                <option value="default">{editorLocale().triStateDefault}</option>
                <option value="true">{editorLocale().triStateEnabled}</option>
                <option value="false">{editorLocale().triStateDisabled}</option>
              </Select>
            </Field>
          </SectionCard>

          <SectionCard title={editorLocale().sectionContextMatch}>
            <ToggleField label={editorLocale().matchPersonaDescription} checked={entry()!.matchPersonaDescription} onChange={(checked) => props.onChange('matchPersonaDescription', checked)} />
            <ToggleField label={editorLocale().matchCharacterDescription} checked={entry()!.matchCharacterDescription} onChange={(checked) => props.onChange('matchCharacterDescription', checked)} />
            <ToggleField label={editorLocale().matchCharacterPersonality} checked={entry()!.matchCharacterPersonality} onChange={(checked) => props.onChange('matchCharacterPersonality', checked)} />
            <ToggleField label={editorLocale().matchCharacterDepthPrompt} checked={entry()!.matchCharacterDepthPrompt} onChange={(checked) => props.onChange('matchCharacterDepthPrompt', checked)} />
            <ToggleField label={editorLocale().matchScenario} checked={entry()!.matchScenario} onChange={(checked) => props.onChange('matchScenario', checked)} />
            <ToggleField label={editorLocale().matchCreatorNotes} checked={entry()!.matchCreatorNotes} onChange={(checked) => props.onChange('matchCreatorNotes', checked)} />
          </SectionCard>

          <SectionCard title={editorLocale().sectionCharacterFilter}>
            <Field label={editorLocale().characterFilterNames}>
              <Input value={joinList(entry()!.characterFilterNames)} onInput={(event) => props.onChange('characterFilterNames', splitList(event.currentTarget.value))} />
            </Field>
            <Field label={editorLocale().characterFilterTags}>
              <Input value={joinList(entry()!.characterFilterTags)} onInput={(event) => props.onChange('characterFilterTags', splitList(event.currentTarget.value))} />
            </Field>
            <ToggleField label={editorLocale().characterFilterExclude} checked={entry()!.characterFilterExclude} onChange={(checked) => props.onChange('characterFilterExclude', checked)} />
          </SectionCard>

          <SectionCard title={editorLocale().sectionExtras}>
            <Field label={editorLocale().automationId}>
              <Input value={entry()!.automationId} onInput={(event) => props.onChange('automationId', event.currentTarget.value)} />
            </Field>
          </SectionCard>
        </div>
      ) : null}
    </WorkbenchModal>
  );
}
