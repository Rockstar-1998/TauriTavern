import { createEffect, createSignal, Match, Switch, on, type JSX } from 'solid-js';

import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { locale } from '@/shared/i18n';
import { Button } from '@/shared/components/ui';
import type { ApiProfile, SessionBindings } from '@/types/domain';

import { SessionBindingApiProfileTab } from './SessionBindingApiProfileTab';
import { SessionBindingPresetTab } from './SessionBindingPresetTab';
import { SessionBindingWorldInfoTab } from './SessionBindingWorldInfoTab';

export type SessionBindingTab = 'world-info' | 'preset' | 'api-profile';

function normalizeBindings(bindings: SessionBindings): SessionBindings {
  return {
    world_info_names: Array.from(new Set((bindings.world_info_names ?? []).map((item) => String(item || '').trim()).filter(Boolean))),
    preset_ref: bindings.preset_ref?.name ? { api_id: 'openai', name: String(bindings.preset_ref.name).trim() } : null,
    api_profile_id: bindings.api_profile_id ? String(bindings.api_profile_id).trim() || null : null,
  };
}

export function SessionBindingOverlay(props: {
  open: boolean;
  activeTab: SessionBindingTab;
  bindings: SessionBindings;
  worldInfoNames: string[];
  presetNames: string[];
  apiProfiles: ApiProfile[];
  loadingPresets?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onTabChange: (tab: SessionBindingTab) => void;
  onSave: (bindings: SessionBindings) => void;
}): JSX.Element {
  const [draft, setDraft] = createSignal<SessionBindings>(normalizeBindings(props.bindings));
  const [availableWorldInfoNames, setAvailableWorldInfoNames] = createSignal<string[]>(props.worldInfoNames);
  const [availablePresetNames, setAvailablePresetNames] = createSignal<string[]>(props.presetNames);
  const [availableApiProfiles, setAvailableApiProfiles] = createSignal<ApiProfile[]>(props.apiProfiles);

  createEffect(on(() => props.open, (open) => {
    if (open) {
      setDraft(normalizeBindings(props.bindings));
      setAvailableWorldInfoNames(props.worldInfoNames);
      setAvailablePresetNames(props.presetNames);
      setAvailableApiProfiles(props.apiProfiles);
    }
  }, { defer: true }));

  createEffect(() => {
    if (!props.open) {
      setAvailableWorldInfoNames(props.worldInfoNames);
      setAvailablePresetNames(props.presetNames);
      setAvailableApiProfiles(props.apiProfiles);
      return;
    }

    setAvailableWorldInfoNames((current) => (props.worldInfoNames.length === 0 && current.length > 0 ? current : props.worldInfoNames));
    setAvailablePresetNames((current) => (props.presetNames.length === 0 && current.length > 0 ? current : props.presetNames));
    setAvailableApiProfiles((current) => (props.apiProfiles.length === 0 && current.length > 0 ? current : props.apiProfiles));
  });

  const tabClass = (tab: SessionBindingTab) => [
    'rounded-[1rem] px-4 py-2.5 text-sm font-medium transition',
    props.activeTab === tab ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  ].join(' ');

  return (
    <WorkbenchModal
      open={props.open}
      onClose={props.onClose}
      title={locale.chats.bindingTitle}
      size="lg"
      footer={
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-slate-500">{props.readOnly ? locale.chats.bindingReadOnly : locale.chats.bindingSaveHint}</div>
          <div class="flex gap-3">
            <Button variant="secondary" onClick={props.onClose}>{locale.common.cancel}</Button>
            <Button onClick={() => props.onSave(normalizeBindings(draft()))} disabled={props.readOnly || props.saving}>
              {props.saving ? locale.common.loading : locale.common.save}
            </Button>
          </div>
        </div>
      }
    >
      <div class="grid gap-6">
        <div class="flex flex-wrap gap-2">
          <button type="button" class={tabClass('world-info')} onClick={() => props.onTabChange('world-info')}>{locale.chats.bindWorldInfo}</button>
          <button type="button" class={tabClass('preset')} onClick={() => props.onTabChange('preset')}>{locale.chats.bindPreset}</button>
          <button type="button" class={tabClass('api-profile')} onClick={() => props.onTabChange('api-profile')}>{locale.chats.bindApiProfile}</button>
        </div>

        <Switch>
          <Match when={props.activeTab === 'world-info'}>
            <SessionBindingWorldInfoTab
              value={draft().world_info_names}
              availableNames={availableWorldInfoNames()}
              disabled={props.readOnly || props.saving}
              onAdd={(name) => setDraft((current) => ({ ...current, world_info_names: [...current.world_info_names, name] }))}
              onMove={(index, direction) => setDraft((current) => {
                const next = [...current.world_info_names];
                const target = index + direction;
                if (target < 0 || target >= next.length) {
                  return current;
                }
                [next[index], next[target]] = [next[target], next[index]];
                return { ...current, world_info_names: next };
              })}
              onRemove={(name) => setDraft((current) => ({ ...current, world_info_names: current.world_info_names.filter((item) => item !== name) }))}
            />
          </Match>
          <Match when={props.activeTab === 'preset'}>
            <SessionBindingPresetTab
              value={draft().preset_ref?.name ?? null}
              presetNames={availablePresetNames()}
              loading={props.loadingPresets}
              disabled={props.readOnly || props.saving}
              onChange={(value) => setDraft((current) => ({ ...current, preset_ref: value ? { api_id: 'openai', name: value } : null }))}
            />
          </Match>
          <Match when={props.activeTab === 'api-profile'}>
            <SessionBindingApiProfileTab
              value={draft().api_profile_id}
              profiles={availableApiProfiles()}
              disabled={props.readOnly || props.saving}
              onChange={(value) => setDraft((current) => ({ ...current, api_profile_id: value }))}
            />
          </Match>
        </Switch>
      </div>
    </WorkbenchModal>
  );
}
