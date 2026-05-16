import { For, Show, type JSX } from 'solid-js';

import { Button, Card, Field, Select } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';
import type { RendererManifest, UiRendererSettings } from '@/types/domain';

export function AppearanceSettingsDetail(props: {
  section: 'desktop-theme' | 'window-material' | 'renderers';
  rendererSettings: UiRendererSettings;
  renderers: RendererManifest[];
  loadingRenderers?: boolean;
  savingRendererSettings?: boolean;
  onSaveRendererSettings: (settings: UiRendererSettings) => void;
  onImportRenderer: (file: File) => void;
  onDeleteRenderer: (renderer: RendererManifest) => void;
}): JSX.Element {
  const saveSetting = (patch: Partial<UiRendererSettings>) => {
    props.onSaveRendererSettings({
      ...props.rendererSettings,
      ...patch,
    });
  };

  if (props.section === 'renderers') {
    return (
      <Card title="Renderer Packages" subtitle="Manage imported renderer packages and global defaults.">
        <div class="grid gap-5">
          <div class="grid gap-4 md:grid-cols-3">
            <Field label="Default Renderer">
              <Select
                value={props.rendererSettings.default_renderer_id ?? 'native'}
                onChange={(event) => saveSetting({ default_renderer_id: event.currentTarget.value || null })}
                disabled={props.savingRendererSettings}
              >
                <option value="native">Native</option>
                <For each={props.renderers.filter((renderer) => renderer.id !== 'native')}>
                  {(renderer) => <option value={renderer.id}>{renderer.name} ({renderer.mode})</option>}
                </For>
              </Select>
            </Field>

            <Field label="Iframe Dev Mode">
              <Select
                value={props.rendererSettings.iframe_dev_mode_enabled ? 'enabled' : 'disabled'}
                onChange={(event) => saveSetting({ iframe_dev_mode_enabled: event.currentTarget.value === 'enabled' })}
                disabled={props.savingRendererSettings}
              >
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
              </Select>
            </Field>

            <Field label="Mobile Policy">
              <Select
                value={props.rendererSettings.mobile_effect_policy}
                onChange={(event) => saveSetting({ mobile_effect_policy: event.currentTarget.value as UiRendererSettings['mobile_effect_policy'] })}
                disabled={props.savingRendererSettings}
              >
                <option value="adaptive">Adaptive</option>
              </Select>
            </Field>
          </div>

          <div class="rounded-[1.4rem] border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600">
            <div class="mb-3 font-semibold text-slate-900">Import Renderer Package</div>
            <input
              type="file"
              accept=".zip,application/zip"
              class="text-sm text-slate-700"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  props.onImportRenderer(file);
                  event.currentTarget.value = '';
                }
              }}
            />
            <div class="mt-2 text-xs text-slate-500">Host renderers are the default high-performance path. Iframe dev renderers stay opt-in.</div>
          </div>

          <Show when={!props.loadingRenderers} fallback={<div class="text-sm text-slate-500">Loading renderers...</div>}>
            <div class="grid gap-3">
              <For each={props.renderers}>
                {(renderer) => (
                  <div class="tt-card-surface flex items-center justify-between gap-4 rounded-[1.4rem] px-4 py-4">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-slate-900">{renderer.name}</div>
                      <div class="mt-1 text-xs text-slate-500">{renderer.id} · {renderer.mode} · v{renderer.version}</div>
                    </div>
                    <Show when={renderer.id !== 'native'}>
                      <Button variant="danger" onClick={() => props.onDeleteRenderer(renderer)}>Delete</Button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Card>
    );
  }

  if (props.section === 'window-material') {
    return (
      <Card title={locale.settings.windowMaterialSection} subtitle={locale.settings.appearanceHint}>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-sm text-slate-600">
            <div class="font-semibold text-slate-900">{locale.settings.windowMaterialTitle}</div>
            <div class="mt-2">{locale.settings.windowMaterialDescription}</div>
          </div>
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-sm text-slate-600">
            <div class="font-semibold text-slate-900">{locale.settings.windowMaterialFallbackTitle}</div>
            <div class="mt-2">{locale.settings.windowMaterialFallbackDescription}</div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div class="grid gap-4">
      <Card title={locale.settings.desktopThemeSection} subtitle={locale.settings.appearanceHint}>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-sm text-slate-600">
            <div class="font-semibold text-slate-900">{locale.settings.desktopThemeTitle}</div>
            <div class="mt-2">{locale.settings.desktopThemeDescription}</div>
          </div>
          <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-sm text-slate-600">
            <div class="font-semibold text-slate-900">{locale.settings.windowMaterialSection}</div>
            <div class="mt-2">{locale.settings.windowMaterialDescription}</div>
          </div>
        </div>
      </Card>
      <Card title="Renderer Summary" subtitle="Renderer defaults are configured in the dedicated Renderers section.">
        <div class="grid gap-2 text-sm text-slate-600">
          <div><span class="font-semibold text-slate-900">Default:</span> {props.rendererSettings.default_renderer_id ?? 'native'}</div>
          <div><span class="font-semibold text-slate-900">Iframe dev:</span> {props.rendererSettings.iframe_dev_mode_enabled ? 'enabled' : 'disabled'}</div>
          <div><span class="font-semibold text-slate-900">Mobile policy:</span> {props.rendererSettings.mobile_effect_policy}</div>
        </div>
      </Card>
    </div>
  );
}
