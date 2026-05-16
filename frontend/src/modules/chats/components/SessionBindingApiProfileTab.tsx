import { Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button, EmptyState, Field, Select, Tag } from '@/shared/components/ui';
import type { ApiProfile } from '@/types/domain';

export function SessionBindingApiProfileTab(props: {
  value: string | null;
  profiles: ApiProfile[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
}): JSX.Element {
  const selectedProfile = () => props.profiles.find((profile) => profile.id === props.value) ?? null;
  const missing = () => Boolean(props.value) && !selectedProfile();

  return (
    <div class="grid gap-5">
      <div>
        <h3 class="text-base font-semibold text-slate-900">{locale.chats.bindingApiProfileTabTitle}</h3>
        <p class="mt-1 text-sm text-slate-500">{locale.chats.bindingApiProfileHint}</p>
      </div>

      <Field label={locale.chats.bindApiProfile}>
        <Select value={props.value ?? ''} onChange={(event) => props.onChange(event.currentTarget.value || null)} disabled={props.disabled}>
          <option value="">{locale.chats.bindingGlobalDefault}</option>
          {props.profiles.map((profile) => <option value={profile.id}>{profile.name}</option>)}
        </Select>
      </Field>

      <div class="flex flex-wrap items-center gap-3">
        <Tag tone={missing() ? 'danger' : 'default'}>{missing() ? locale.chats.bindingMissingResource : (selectedProfile()?.name ?? locale.chats.bindingGlobalDefault)}</Tag>
        <Button variant="secondary" onClick={() => props.onChange(null)} disabled={props.disabled || !props.value}>{locale.chats.bindingClear}</Button>
      </div>

      <Show when={props.profiles.length === 0}>
        <EmptyState title={locale.chats.bindingNoApiProfiles} description={locale.chats.bindingNoApiProfilesHint} />
      </Show>
    </div>
  );
}
