import { createQuery } from '@tanstack/solid-query';
import { useSearchParams } from '@solidjs/router';
import { createMemo, createResource, createSignal, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { ContextToolbar } from '@/app/layout/desktop/ContextToolbar';
import { WorkspaceWelcome } from '@/app/layout/desktop/WorkspaceWelcome';
import { coreApiClient } from '@/lib/api/core-client';
import { nativeBridge } from '@/lib/native/bridge';
import { locale, getGreeting } from '@/shared/i18n';
import { ContextListCard } from '@/shared/components/desktop/ContextListCard';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Card, EmptyState, LoadingBlock } from '@/shared/components/ui';
import { humanFileSize, safeJsonStringify } from '@/shared/utils/format';

import { AssetManagerWorkspace } from '@/modules/assets/components/AssetManagerWorkspace';
import { normalizeAssetPanelId } from '@/modules/assets/navigation';
import { MigrationToolTabs, type MigrationToolId } from './components/MigrationToolTabs';

const PANELS = [
  { id: 'backups', title: locale.workbench.panels.backups, description: locale.workbench.panelDescriptions.backups },
  { id: 'sync', title: locale.workbench.panels.sync, description: locale.workbench.panelDescriptions.sync },
  { id: 'extensions', title: locale.workbench.panels.extensions, description: locale.workbench.panelDescriptions.extensions },
  { id: 'stats', title: locale.workbench.panels.stats, description: locale.workbench.panelDescriptions.stats },
  { id: 'migration', title: locale.workbench.panels.migration, description: locale.workbench.panelDescriptions.migration },
] as const;

type PanelId = (typeof PANELS)[number]['id'];

export default function WorkbenchPage(): JSX.Element {
  let pageRef: HTMLDivElement | undefined;
  const [searchParams, setSearchParams] = useSearchParams<{
    panel?: PanelId;
    tool?: MigrationToolId;
    assetPanel?: string;
    assetSelected?: string;
  }>();
  const [modalOpen, setModalOpen] = createSignal(false);

  const backupsQuery = createQuery(() => ({ queryKey: ['workbench', 'backups'], queryFn: () => coreApiClient.workbench.backups() }));
  const statsQuery = createQuery(() => ({ queryKey: ['workbench', 'stats'], queryFn: () => coreApiClient.workbench.stats() }));
  const extensionsQuery = createQuery(() => ({ queryKey: ['workbench', 'extensions'], queryFn: () => coreApiClient.workbench.extensions() }));
  const [lanSyncStatus] = createResource(() => nativeBridge.lanSync.getStatus());

  const panel = createMemo<PanelId | undefined>(() => (searchParams.panel && PANELS.some((item) => item.id === searchParams.panel) ? searchParams.panel : undefined));
  const selectedPanel = createMemo(() => PANELS.find((item) => item.id === panel()));
  const migrationTool = createMemo<MigrationToolId | undefined>(() => (panel() === 'migration' && searchParams.tool === 'assets' ? 'assets' : undefined));
  const assetPanel = createMemo(() => normalizeAssetPanelId(searchParams.assetPanel));
  const assetSelected = createMemo(() => decodeURIComponent(searchParams.assetSelected ?? ''));

  const recentItems = createMemo(() => PANELS.slice(0, 5).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    onClick: () => setSearchParams({ panel: item.id }),
  })));

  const rawPayload = createMemo(() => {
    switch (panel()) {
      case 'backups':
        return backupsQuery.data ?? [];
      case 'sync':
        return lanSyncStatus() ?? { available: false };
      case 'extensions':
        return extensionsQuery.data ?? [];
      case 'stats':
        return statsQuery.data ?? {};
      case 'migration':
        return {
          tool: migrationTool() ?? null,
          assetPanel: assetPanel(),
          assetSelected: assetSelected() || null,
        };
      default:
        return {};
    }
  });

  function openMigrationTool(tool: MigrationToolId): void {
    setSearchParams({
      panel: 'migration',
      tool,
      assetPanel: assetPanel(),
      assetSelected: assetSelected() || undefined,
    });
  }

  useMotionMount(() => pageRef, 'page');

  return (
    <div ref={pageRef} class="flex h-full min-h-0 gap-4 overflow-hidden">
      <DesktopContextPane floatingActionLabel={panel() && panel() !== 'migration' ? locale.common.open : undefined} onFloatingAction={panel() && panel() !== 'migration' ? () => setModalOpen(true) : undefined}>
        <ContextToolbar title={locale.workbench.title} subtitle={locale.workbench.subtitle} />
        <div class="mt-6 space-y-3">
          {PANELS.map((item) => (
            <ContextListCard
              item={{
                id: item.id,
                title: item.title,
                description: item.description,
                tone: panel() === item.id ? 'active' : 'default',
                onClick: () => setSearchParams({ panel: item.id }),
              }}
              compact
            />
          ))}
        </div>
      </DesktopContextPane>

      <DesktopWorkspaceBoard>
        <Show
          when={panel()}
          fallback={
            <WorkspaceWelcome
              greeting={getGreeting()}
              subtitle={locale.workbench.emptyWorkspaceHint}
              hero={{
                title: locale.greetings.quickStart,
                description: locale.greetings.quickStartHint,
                actionLabel: locale.common.open,
              }}
              recentItems={recentItems()}
            />
          }
        >
          <div class="space-y-5">
            <Card title={selectedPanel()?.title} subtitle={selectedPanel()?.description}>
              <div class="flex flex-wrap gap-2">
                <Show when={panel() !== 'migration'}>
                  <Button variant="secondary" onClick={() => setModalOpen(true)}>{locale.common.open}</Button>
                </Show>
              </div>
            </Card>

            <Show when={panel() === 'backups'}>
              <Card title={locale.workbench.panels.backups}>
                <Show when={!backupsQuery.isPending} fallback={<LoadingBlock />}>
                  <div class="grid gap-3 md:grid-cols-2">
                    {(backupsQuery.data ?? []).slice(0, 8).map((backup) => (
                      <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
                        <div class="font-medium text-slate-900">{String(backup.name ?? 'backup.zip')}</div>
                        <div class="mt-1 text-xs text-slate-500">{humanFileSize(backup.size as number | string | undefined)}</div>
                        <div class="mt-4 flex gap-2">
                          <Button variant="secondary" onClick={() => void coreApiClient.workbench.downloadBackup(String(backup.name ?? 'backup.zip'))}>{locale.workbench.downloadBackup}</Button>
                          <Button variant="danger" onClick={() => void coreApiClient.workbench.deleteBackup(String(backup.name ?? 'backup.zip'))}>{locale.workbench.deleteBackup}</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Show>
              </Card>
            </Show>

            <Show when={panel() === 'sync'}>
              <Card title={locale.workbench.panels.sync}>
                <pre class="overflow-auto whitespace-pre-wrap text-xs text-slate-600">{safeJsonStringify(lanSyncStatus() ?? { available: false })}</pre>
              </Card>
            </Show>

            <Show when={panel() === 'extensions'}>
              <Card title={locale.workbench.panels.extensions}>
                <Show when={!extensionsQuery.isPending} fallback={<LoadingBlock />}>
                  <div class="space-y-3">
                    {(extensionsQuery.data ?? []).map((extension) => (
                      <div class="tt-card-surface rounded-[1.4rem] px-4 py-4">
                        <div class="font-medium text-slate-900">{String(extension.display_name ?? extension.name ?? locale.workbench.extensionFallbackName)}</div>
                        <div class="mt-1 text-xs text-slate-500">{locale.workbench.versionLabel}: {String(extension.version ?? locale.common.unknown)}</div>
                      </div>
                    ))}
                  </div>
                </Show>
              </Card>
            </Show>

            <Show when={panel() === 'stats'}>
              <Card title={locale.workbench.panels.stats}>
                <pre class="overflow-auto whitespace-pre-wrap text-xs text-slate-600">{safeJsonStringify(statsQuery.data ?? {})}</pre>
              </Card>
            </Show>

            <Show when={panel() === 'migration'}>
              <Card title={locale.workbench.panels.migration} subtitle={locale.workbench.migrationSubtitle}>
                <MigrationToolTabs tool={migrationTool()} onChange={openMigrationTool} />
              </Card>
              <Show
                when={migrationTool() === 'assets'}
                fallback={
                  <Card title={locale.workbench.pendingFeatures}>
                    <div class="grid gap-3 md:grid-cols-2">
                      <button type="button" class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-left text-sm text-slate-600 transition hover:bg-white" onClick={() => openMigrationTool('assets')}>
                        <div class="font-medium text-slate-900">{locale.assets.title}</div>
                        <div class="mt-2">{locale.workbench.migrationAssetsHint}</div>
                      </button>
                      {[locale.workbench.migrationQuickReplies, locale.workbench.migrationPromptPacks, locale.workbench.migrationImportWizards].map((item) => (
                        <div class="tt-card-surface rounded-[1.4rem] px-4 py-4 text-sm text-slate-600">{item}</div>
                      ))}
                    </div>
                  </Card>
                }
              >
                <AssetManagerWorkspace
                  panel={assetPanel()}
                  selected={assetSelected()}
                  onNavigate={(next) => setSearchParams({
                    panel: 'migration',
                    tool: 'assets',
                    assetPanel: next.panel,
                    assetSelected: next.selected || undefined,
                  })}
                />
              </Show>
            </Show>
          </div>
        </Show>
      </DesktopWorkspaceBoard>

      <WorkbenchModal open={modalOpen()} onClose={() => setModalOpen(false)} title={selectedPanel()?.title ?? locale.workbench.title} size="lg">
        <Show when={selectedPanel()} fallback={<EmptyState title={locale.workbench.emptyWorkspace} description={locale.workbench.emptyWorkspaceHint} />}>
          <pre class="overflow-auto whitespace-pre-wrap text-xs text-slate-600">{safeJsonStringify(rawPayload())}</pre>
        </Show>
      </WorkbenchModal>
    </div>
  );
}
