import type { JSX } from 'solid-js';

import { Button, Card, Field, Input, JsonEditor, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

export function SystemSettingsDetail(props: {
  section: 'general' | 'raw-json';
  loading?: boolean;
  userName: string;
  worldCount: number;
  themeCount: number;
  apiProfileCount: number;
  onUserNameChange: (value: string) => void;
  onSaveGeneral: () => void;
  savingGeneral?: boolean;
  settingsText: string;
  onSettingsTextChange: (value: string) => void;
  onReloadJson: () => void;
  onSaveJson: () => void;
  savingJson?: boolean;
}): JSX.Element {
  if (props.loading) {
    return <LoadingBlock />;
  }

  if (props.section === 'raw-json') {
    return (
      <Card title={locale.settings.rawJsonSection} subtitle={locale.settings.systemJson}>
        <div class="space-y-4">
          <JsonEditor value={props.settingsText} onInput={(event) => props.onSettingsTextChange(event.currentTarget.value)} minHeight={560} />
          <div class="flex justify-end gap-3">
            <Button variant="secondary" onClick={props.onReloadJson}>{locale.common.refresh}</Button>
            <Button onClick={props.onSaveJson} disabled={props.savingJson}>{locale.common.save}</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div class="space-y-4">
      <Card title={locale.settings.generalSection} subtitle={locale.settings.systemOverview}>
        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div class="space-y-4">
            <Field label={locale.settings.userNameLabel}>
              <Input value={props.userName} onInput={(event) => props.onUserNameChange(event.currentTarget.value)} />
            </Field>
            <div class="flex justify-end">
              <Button onClick={props.onSaveGeneral} disabled={props.savingGeneral}>{locale.common.save}</Button>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
              <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.worldCountLabel}</div>
              <div class="mt-2 text-2xl font-semibold text-slate-900">{props.worldCount}</div>
            </div>
            <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
              <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.themeCountLabel}</div>
              <div class="mt-2 text-2xl font-semibold text-slate-900">{props.themeCount}</div>
            </div>
            <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
              <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.apiProfileCountLabel}</div>
              <div class="mt-2 text-2xl font-semibold text-slate-900">{props.apiProfileCount}</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
