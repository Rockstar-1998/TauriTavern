import { useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { ChevronLeft } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';

import { Button, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import { ApiProfileEditorModal } from '../components/ApiProfileEditorModal';
import { ApiProfilesSettingsWorkspace } from '../components/ApiProfilesSettingsWorkspace';
import { AppearanceSettingsDetail } from '../components/AppearanceSettingsDetail';
import { SecretsSettingsDetail } from '../components/SecretsSettingsDetail';
import { SettingsSecondaryRail } from '../components/SettingsSecondaryRail';
import { SnapshotsSettingsWorkspace } from '../components/SnapshotsSettingsWorkspace';
import { SystemSettingsDetail } from '../components/SystemSettingsDetail';
import { createSettingsController } from '../controller';
import type { SettingsPanelId } from '../registry';

function buildMobileSettingsHref(panel: SettingsPanelId, section: string, selected?: string): string {
  const params = new URLSearchParams();
  params.set('section', section);
  if (selected) {
    params.set('selected', selected);
  }

  return `/settings/${panel}?${params.toString()}`;
}

export default function SettingsDetailMobilePage(): JSX.Element {
  const params = useParams();
  const [searchParams] = useSearchParams<{ section?: string; selected?: string }>();
  const navigate = useNavigate();
  const controller = createSettingsController({
    panel: () => params.panelId,
    section: () => searchParams.section,
    selected: () => searchParams.selected,
    replaceRoute: (target) => navigate(buildMobileSettingsHref(target.panel, target.section, target.selected), { replace: true }),
    openRoute: (target) => navigate(buildMobileSettingsHref(target.panel, target.section, target.selected)),
    openPresetsCompat: () => navigate('/presets?apiId=openai', { replace: true }),
  });

  function renderSecondaryRail(): JSX.Element {
    const panel = controller.activePanel();

    if (panel === 'api-profiles') {
      return (
        <SettingsSecondaryRail
          title={locale.settings.apiProfilesTitle}
          subtitle={locale.settings.profileSummary}
          actions={<Button onClick={controller.openCreateApiProfile}>{locale.common.add}</Button>}
          items={controller.sectionRailItems()}
          empty={<div class="rounded-[1.2rem] border border-dashed px-4 py-6 text-sm text-slate-500">{locale.settings.apiProfileEmptyHint}</div>}
        />
      );
    }

    if (panel === 'snapshots') {
      return (
        <SettingsSecondaryRail
          title={locale.settings.snapshotLibrarySection}
          subtitle={locale.settings.snapshotSummary}
          actions={<Button onClick={() => void controller.createSnapshotMutation.mutateAsync()} disabled={controller.createSnapshotMutation.isPending}>{locale.settings.createSnapshot}</Button>}
          items={controller.sectionRailItems()}
          empty={<div class="rounded-[1.2rem] border border-dashed px-4 py-6 text-sm text-slate-500">{locale.settings.snapshotSummary}</div>}
        />
      );
    }

    return (
      <SettingsSecondaryRail
        title={controller.activePanelDefinition().title}
        subtitle={controller.activePanelDefinition().description}
        items={controller.sectionRailItems()}
      />
    );
  }

  function renderDetail(): JSX.Element {
    const panel = controller.activePanel();
    const section = controller.activeSection();

    if (panel === 'system') {
      return (
        <SystemSettingsDetail
          section={section as 'general' | 'raw-json'}
          loading={controller.settingsQuery.isPending}
          userName={controller.generalName()}
          worldCount={controller.settingsQuery.data?.world_names?.length ?? 0}
          themeCount={controller.settingsQuery.data?.themes?.length ?? 0}
          apiProfileCount={controller.apiProfiles().length}
          onUserNameChange={controller.setGeneralName}
          onSaveGeneral={() => void controller.saveGeneralSettingsMutation.mutateAsync()}
          savingGeneral={controller.saveGeneralSettingsMutation.isPending}
          settingsText={controller.settingsText()}
          onSettingsTextChange={controller.setSettingsText}
          onReloadJson={() => void controller.settingsQuery.refetch()}
          onSaveJson={() => void controller.saveSettingsMutation.mutateAsync()}
          savingJson={controller.saveSettingsMutation.isPending}
        />
      );
    }

    if (panel === 'secrets') {
      return (
        <SecretsSettingsDetail
          section={section as 'write' | 'state'}
          secretKey={controller.secretKey()}
          secretLabel={controller.secretLabel()}
          secretValue={controller.secretValue()}
          onSecretKeyChange={controller.setSecretKey}
          onSecretLabelChange={controller.setSecretLabel}
          onSecretValueChange={controller.setSecretValue}
          onSaveSecret={() => void controller.saveSecretMutation.mutateAsync()}
          savingSecret={controller.saveSecretMutation.isPending}
          secretStatePayload={controller.secretStateQuery.data}
          secretsViewUnavailable={controller.secretsViewUnavailable}
        />
      );
    }

    if (panel === 'api-profiles') {
      if (controller.settingsQuery.isPending) {
        return <LoadingBlock />;
      }

      return (
        <ApiProfilesSettingsWorkspace
          profile={controller.selectedApiProfile()}
          onCreate={controller.openCreateApiProfile}
          onEdit={controller.openEditApiProfile}
          onDelete={(profile) => void controller.deleteApiProfile(profile)}
        />
      );
    }

    if (panel === 'snapshots') {
      if (controller.snapshotsQuery.isPending) {
        return <LoadingBlock />;
      }

      return (
        <SnapshotsSettingsWorkspace
          snapshot={controller.selectedSnapshot()}
          onCreate={() => void controller.createSnapshotMutation.mutateAsync()}
          onLoad={(name) => void controller.loadSnapshotMutation.mutateAsync(name)}
          onRestore={(name) => void controller.restoreSnapshotMutation.mutateAsync(name)}
          creating={controller.createSnapshotMutation.isPending}
          loading={controller.loadSnapshotMutation.isPending}
          restoring={controller.restoreSnapshotMutation.isPending}
        />
      );
    }

    return (
      <AppearanceSettingsDetail
        section={section as 'desktop-theme' | 'window-material' | 'renderers'}
        rendererSettings={controller.rendererSettings()}
        renderers={controller.renderersQuery.data ?? []}
        loadingRenderers={controller.renderersQuery.isPending}
        savingRendererSettings={controller.saveRendererSettingsMutation.isPending}
        onSaveRendererSettings={(nextSettings) => void controller.saveRendererSettingsMutation.mutateAsync(nextSettings)}
        onImportRenderer={(file) => void controller.importRendererPackage(file)}
        onDeleteRenderer={(renderer) => void controller.deleteRendererPackage(renderer)}
      />
    );
  }

  return (
    <div class="flex h-full flex-col bg-slate-50">
      <header class="flex h-14 shrink-0 items-center border-b bg-white px-2">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          class="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>
        <div class="ml-1 flex-1 truncate font-semibold text-slate-900">{controller.activePanelDefinition().title}</div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto p-4 pb-20">
        <Show when={params.panelId !== 'presets'} fallback={<LoadingBlock />}>
          <div class="space-y-4">
            {renderSecondaryRail()}
            {renderDetail()}
          </div>
        </Show>
      </main>

      <ApiProfileEditorModal
        open={controller.apiProfileEditorOpen()}
        onClose={() => controller.setApiProfileEditorOpen(false)}
        title={controller.editingApiProfileId() ? locale.settings.editApiProfile : locale.settings.createApiProfile}
        name={controller.apiProfileName()}
        draft={controller.apiProfileDraft()}
        modelOptions={controller.apiProfileModelOptions()}
        statusPayload={controller.apiProfileStatusPayload()}
        loadingModels={controller.loadingApiProfileModels()}
        saving={controller.savingApiProfile()}
        onNameChange={controller.setApiProfileName}
        onSourceChange={controller.updateApiProfileSource}
        onModelChange={controller.updateApiProfileModel}
        onFieldChange={controller.updateApiProfileField}
        onRefreshModels={() => void controller.refreshApiProfileModels()}
        onSave={() => void controller.saveApiProfile()}
      />
    </div>
  );
}
