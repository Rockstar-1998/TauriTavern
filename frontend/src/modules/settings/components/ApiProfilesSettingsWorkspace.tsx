import type { ApiProfile } from '@/types/domain';
import type { JSX } from 'solid-js';

import { Button, Card, EmptyState, Tag } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

function resolveModel(profile: ApiProfile): string {
  return profile.settings.openai_model
    || profile.settings.openrouter_model
    || profile.settings.custom_model
    || profile.settings.claude_model
    || profile.settings.google_model
    || profile.settings.deepseek_model
    || profile.settings.moonshot_model
    || profile.settings.siliconflow_model
    || profile.settings.zai_model
    || locale.characters.notSet;
}

export function ApiProfilesSettingsWorkspace(props: {
  profile: ApiProfile | null;
  onCreate: () => void;
  onEdit: (profile: ApiProfile) => void;
  onDelete: (profile: ApiProfile) => void;
}): JSX.Element {
  if (!props.profile) {
    return (
      <EmptyState
        title={locale.settings.noProfilesSelected}
        description={locale.settings.apiProfilesHint}
        action={<Button onClick={props.onCreate}>{locale.settings.createApiProfile}</Button>}
      />
    );
  }

  return (
    <Card title={props.profile.name} subtitle={locale.settings.profileSummary}>
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
            <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.providerLabel}</div>
            <div class="mt-2"><Tag>{props.profile.settings.chat_completion_source || 'openai'}</Tag></div>
          </div>
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
            <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.modelLabel}</div>
            <div class="mt-2 text-sm text-slate-700 break-all">{resolveModel(props.profile)}</div>
          </div>
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 md:col-span-2">
            <div class="text-xs uppercase tracking-[0.16em] text-slate-400">{locale.settings.updatedAtLabel}</div>
            <div class="mt-2 text-sm text-slate-700">{props.profile.updated_at || locale.characters.notSet}</div>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => props.onCreate()}>{locale.settings.createApiProfile}</Button>
          <Button variant="secondary" onClick={() => props.onEdit(props.profile!)}>{locale.common.edit}</Button>
          <Button variant="danger" onClick={() => props.onDelete(props.profile!)}>{locale.common.delete}</Button>
        </div>
      </div>
    </Card>
  );
}
