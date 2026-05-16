import { useNavigate, useSearchParams } from '@solidjs/router';
import { Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { ContextToolbar } from '@/app/layout/desktop/ContextToolbar';
import { Button, LoadingBlock } from '@/shared/components/ui';
import { locale } from '@/shared/i18n';

import { ApiProfileEditorModal } from './components/ApiProfileEditorModal';
import { ApiProfilesSettingsWorkspace } from './components/ApiProfilesSettingsWorkspace';
import { AppearanceSettingsDetail } from './components/AppearanceSettingsDetail';
import { SecretsSettingsDetail } from './components/SecretsSettingsDetail';
import { SettingsPanelListItem } from './components/SettingsPanelListItem';
import { SettingsSecondaryRail } from './components/SettingsSecondaryRail';
import { SettingsSplitWorkspace } from './components/SettingsSplitWorkspace';
import { SnapshotsSettingsWorkspace } from './components/SnapshotsSettingsWorkspace';
import { SystemSettingsDetail } from './components/SystemSettingsDetail';
import { buildSettingsUrl, createSettingsController } from './controller';

export default function SettingsPage(): JSX.Element {
  let pageRef: HTMLDivElement | undefined;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams<{ panel?: string; section?: string; selected?: string }>();
  const controller = createSettingsController({
    panel: () => searchParams.panel,
    section: () => searchParams.section,
    selected: () => searchParams.selected,
    replaceRoute: (target) => navigate(buildSettingsUrl(target.panel, target.section, target.selected), { replace: true }),
    openRoute: (target) => navigate(buildSettingsUrl(target.panel, target.section, target.selected)),
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

  useMotionMount(() => pageRef, 'page');

  return (
    <div ref={pageRef} class="flex h-full min-h-0 gap-4 overflow-hidden">
      <DesktopContextPane>
        <ContextToolbar title={locale.settings.title} subtitle={locale.settings.subtitle} />
        <div class="mt-6 space-y-3">
          {controller.panelListItems().map((item) => (
            <SettingsPanelListItem
              title={item.title}
              description={item.description}
              icon={item.icon}
              active={item.active}
              onClick={item.onClick}
            />
          ))}
        </div>
      </DesktopContextPane>

      <DesktopWorkspaceBoard showLeadingMenu={false} scrollMode="contained">
        <Show when={searchParams.panel !== 'presets'} fallback={<LoadingBlock />}>
          <SettingsSplitWorkspace
            title={controller.activePanelDefinition().title}
            description={controller.activeSectionDefinition().description}
            secondaryRail={renderSecondaryRail()}
            detail={renderDetail()}
          />
        </Show>
      </DesktopWorkspaceBoard>

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
