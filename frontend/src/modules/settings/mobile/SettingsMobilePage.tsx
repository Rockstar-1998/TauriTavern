import { createQuery } from '@tanstack/solid-query';
import { useNavigate } from '@solidjs/router';
import { ChevronRight, Cpu, History, Image, Settings, Shield } from 'lucide-solid';
import { Dynamic } from 'solid-js/web';
import { For, Show, type JSX } from 'solid-js';

import { coreApiClient } from '@/lib/api/core-client';
import { LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import { SETTINGS_PANEL_REGISTRY, type SettingsPanelId } from '../registry';

export default function SettingsMobilePage(): JSX.Element {
  const navigate = useNavigate();
  const settingsQuery = createQuery(() => ({
    queryKey: ['settings'],
    queryFn: () => coreApiClient.getSettings(),
  }));

  const panelIcon = (id: SettingsPanelId) => {
    switch (id) {
      case 'system':
        return Cpu;
      case 'secrets':
        return Shield;
      case 'appearance':
        return Image;
      case 'snapshots':
        return History;
      default:
        return Settings;
    }
  };

  return (
    <div class="flex h-full flex-col bg-slate-50">
      <div class="px-4 py-6">
        <h1 class="text-2xl font-bold text-slate-900">{locale.settings.title}</h1>
        <p class="mt-1 text-sm text-slate-500">{locale.settings.subtitle}</p>
      </div>

      <div class="flex-1 overflow-y-auto px-4 pb-10">
        <Show when={!settingsQuery.isPending} fallback={<LoadingBlock />}>
          <div class="space-y-4">
            <For each={SETTINGS_PANEL_REGISTRY}>
              {(panel) => (
                <button
                  type="button"
                  onClick={() => navigate(`/settings/${panel.id}`)}
                  class="flex w-full items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-colors active:bg-slate-50"
                >
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <Dynamic component={panelIcon(panel.id)} size={22} />
                  </div>
                  <div class="flex-1 text-left">
                    <div class="font-semibold text-slate-900">{panel.title}</div>
                    <div class="mt-0.5 text-xs text-slate-500">{panel.description}</div>
                  </div>
                  <ChevronRight size={18} class="text-slate-300" />
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
