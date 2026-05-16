import { For, Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, EmptyState, Tag } from '@/shared/components/ui';
import type { ApiProfile } from '@/types/domain';

export function ApiProfilesPanel(props: {
  profiles: ApiProfile[];
  onCreate: () => void;
  onEdit: (profile: ApiProfile) => void;
  onDelete: (profile: ApiProfile) => void;
}): JSX.Element {
  return (
    <div class="grid gap-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-base font-semibold text-slate-900">{locale.settings.apiProfilesTitle}</div>
          <div class="mt-1 text-sm text-slate-500">{locale.settings.apiProfilesHint}</div>
        </div>
        <Button onClick={props.onCreate}>{locale.settings.createApiProfile}</Button>
      </div>

      <Show when={props.profiles.length > 0} fallback={<EmptyState title={locale.settings.apiProfileEmpty} description={locale.settings.apiProfileEmptyHint} action={<Button onClick={props.onCreate}>{locale.settings.createApiProfile}</Button>} />}>
        <div class="grid gap-3">
          <For each={props.profiles}>{(profile) => (
            <div class="tt-card-surface flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] px-4 py-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <div class="truncate text-sm font-semibold text-slate-900">{profile.name}</div>
                  <Tag>{profile.settings.chat_completion_source || 'openai'}</Tag>
                </div>
                <div class="mt-1 text-xs text-slate-500">{profile.settings.openai_model || profile.settings.openrouter_model || profile.settings.custom_model || profile.settings.claude_model || profile.settings.google_model || profile.settings.deepseek_model || profile.settings.moonshot_model || profile.settings.siliconflow_model || profile.settings.zai_model || '?'}</div>
              </div>
              <div class="flex gap-2">
                <Button variant="secondary" onClick={() => props.onEdit(profile)}>{locale.common.edit}</Button>
                <Button variant="danger" onClick={() => props.onDelete(profile)}>{locale.common.delete}</Button>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  );
}
