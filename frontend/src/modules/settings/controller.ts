import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, type Accessor } from 'solid-js';

import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { getErrorMessage } from '@/lib/api/http';
import { nativeBridge } from '@/lib/native/bridge';
import { readProviderSettings, setProviderModel, setProviderSource, toPersistedProviderSettings } from '@/modules/chats/provider-settings';
import { readUiRendererSettings, writeUiRendererSettings } from '@/modules/chats/renderer-settings';
import { locale } from '@/shared/i18n';
import { safeJsonStringify } from '@/shared/utils/format';
import type { ApiProfile, AppSettings, ChatProviderDraft, RendererManifest } from '@/types/domain';

import {
  DEFAULT_SETTINGS_PANEL_ID,
  SETTINGS_PANEL_REGISTRY,
  getDefaultSection,
  getPanelDefinition,
  getSectionDefinition,
  isValidPanel,
  isValidSection,
  type SettingsPanelId,
} from './registry';

export type SettingsRouteState = {
  panel?: string;
  section?: string;
  selected?: string;
};

export type SettingsNavigationTarget = {
  panel: SettingsPanelId;
  section: string;
  selected?: string;
};

export type SettingsControllerInput = {
  panel: Accessor<string | undefined>;
  section: Accessor<string | undefined>;
  selected: Accessor<string | undefined>;
  replaceRoute: (target: SettingsNavigationTarget) => void;
  openRoute: (target: SettingsNavigationTarget) => void;
  openPresetsCompat: () => void;
};

function extractModels(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) {
    return [];
  }

  const candidates = payload.data;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return '';
      }

      const record = item as Record<string, unknown>;
      return String(record.id ?? record.name ?? '').trim();
    })
    .filter(Boolean);
}

export function buildSettingsUrl(panel: SettingsPanelId, section: string, selected?: string): string {
  const params = new URLSearchParams();
  params.set('panel', panel);
  params.set('section', section);
  if (selected) {
    params.set('selected', selected);
  }

  return `/settings?${params.toString()}`;
}

export function createSettingsController(input: SettingsControllerInput) {
  const toast = useToasts();
  const queryClient = useQueryClient();
  const [settingsText, setSettingsText] = createSignal('{}');
  const [generalName, setGeneralName] = createSignal('You');
  const [secretKey, setSecretKey] = createSignal('OPENAI');
  const [secretValue, setSecretValue] = createSignal('');
  const [secretLabel, setSecretLabel] = createSignal('');
  const [apiProfileEditorOpen, setApiProfileEditorOpen] = createSignal(false);
  const [editingApiProfileId, setEditingApiProfileId] = createSignal<string | null>(null);
  const [apiProfileName, setApiProfileName] = createSignal('');
  const [apiProfileDraft, setApiProfileDraft] = createSignal<ChatProviderDraft>(readProviderSettings(undefined));
  const [apiProfileModelOptions, setApiProfileModelOptions] = createSignal<string[]>([]);
  const [apiProfileStatusPayload, setApiProfileStatusPayload] = createSignal<Record<string, unknown>>({});
  const [loadingApiProfileModels, setLoadingApiProfileModels] = createSignal(false);
  const [savingApiProfile, setSavingApiProfile] = createSignal(false);
  const [settingsLoadErrorShown, setSettingsLoadErrorShown] = createSignal(false);
  const secretsViewUnavailable = locale.settings.secretsViewUnavailable;

  const settingsQuery = createQuery(() => ({ queryKey: ['settings'], queryFn: () => coreApiClient.getSettings() }));
  const snapshotsQuery = createQuery(() => ({ queryKey: ['snapshots'], queryFn: () => coreApiClient.settings.listSnapshots() }));
  const secretStateQuery = createQuery(() => ({ queryKey: ['secret-state'], queryFn: () => coreApiClient.secrets.readState(), retry: false }));
  const renderersQuery = createQuery(() => ({
    queryKey: ['renderer-packages'],
    queryFn: () => nativeBridge.chatTransport.listRendererPackages(),
    staleTime: 60_000,
  }));

  const apiProfiles = createMemo(() => settingsQuery.data?.api_profiles ?? []);
  const rendererSettings = createMemo(() => readUiRendererSettings(settingsQuery.data));
  const currentSelected = createMemo(() => {
    const value = input.selected()?.trim();
    return value ? value : undefined;
  });

  const activePanel = createMemo<SettingsPanelId>(() => {
    const panel = input.panel();
    if (panel === 'presets') {
      return DEFAULT_SETTINGS_PANEL_ID;
    }

    return isValidPanel(panel) ? panel : DEFAULT_SETTINGS_PANEL_ID;
  });

  const activeSection = createMemo(() => {
    const panel = activePanel();
    return isValidSection(panel, input.section()) ? input.section()! : getDefaultSection(panel);
  });

  const selectedApiProfile = createMemo(() => apiProfiles().find((profile) => profile.id === currentSelected()) ?? null);
  const selectedSnapshot = createMemo(() => (snapshotsQuery.data ?? []).find((snapshot) => snapshot.name === currentSelected()) ?? null);
  const activePanelDefinition = createMemo(() => getPanelDefinition(activePanel()));
  const activeSectionDefinition = createMemo(() => getSectionDefinition(activePanel(), activeSection()));

  createEffect(() => {
    if (settingsQuery.data) {
      setSettingsText(safeJsonStringify(settingsQuery.data));
      setGeneralName(String(settingsQuery.data.name1 ?? 'You'));
    }
  });

  createEffect(() => {
    if (settingsQuery.error && !settingsLoadErrorShown()) {
      setSettingsLoadErrorShown(true);
      toast.push({
        title: locale.settings.loadFailed,
        description: getErrorMessage(settingsQuery.error),
        tone: 'danger',
      });
      return;
    }

    if (!settingsQuery.error && settingsLoadErrorShown() && settingsQuery.isSuccess) {
      setSettingsLoadErrorShown(false);
    }
  });

  createEffect(() => {
    const routePanel = input.panel();

    if (routePanel === 'presets') {
      input.openPresetsCompat();
      return;
    }

    const panel: SettingsPanelId = isValidPanel(routePanel) ? routePanel : DEFAULT_SETTINGS_PANEL_ID;
    const section = isValidSection(panel, input.section()) ? input.section()! : getDefaultSection(panel);

    let selected = currentSelected();
    if (panel === 'api-profiles') {
      if (settingsQuery.isPending) {
        return;
      }

      const ids = apiProfiles().map((profile) => profile.id);
      if (ids.length > 0) {
        if (!selected || !ids.includes(selected)) {
          selected = ids[0];
        }
      } else {
        selected = undefined;
      }
    } else if (panel === 'snapshots') {
      if (snapshotsQuery.isPending) {
        return;
      }

      const names = (snapshotsQuery.data ?? []).map((snapshot) => snapshot.name);
      if (names.length > 0) {
        if (!selected || !names.includes(selected)) {
          selected = names[0];
        }
      } else {
        selected = undefined;
      }
    } else {
      selected = undefined;
    }

    if (routePanel !== panel || input.section() !== section || currentSelected() !== selected) {
      input.replaceRoute({ panel, section, selected });
    }
  });

  const saveSettingsMutation = createMutation(() => ({
    mutationFn: async () => coreApiClient.settings.save(JSON.parse(settingsText()) as Record<string, unknown>),
    onSuccess: async () => {
      toast.push({ title: locale.settings.saveSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const saveGeneralSettingsMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!settingsQuery.data) {
        throw new Error('missing settings payload');
      }

      return coreApiClient.settings.save({
        ...settingsQuery.data,
        name1: generalName().trim() || 'You',
      } as Record<string, unknown>);
    },
    onSuccess: async () => {
      toast.push({ title: locale.settings.saveSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const saveRendererSettingsMutation = createMutation(() => ({
    mutationFn: async (nextRendererSettings: ReturnType<typeof rendererSettings>) => {
      if (!settingsQuery.data) {
        throw new Error('missing settings payload');
      }

      return coreApiClient.settings.save(writeUiRendererSettings(settingsQuery.data, nextRendererSettings) as Record<string, unknown>);
    },
    onSuccess: async () => {
      toast.push({ title: locale.settings.saveSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const createSnapshotMutation = createMutation(() => ({
    mutationFn: () => coreApiClient.settings.makeSnapshot(),
    onSuccess: async () => {
      toast.push({ title: locale.settings.snapshotCreated, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const saveSecretMutation = createMutation(() => ({
    mutationFn: () => coreApiClient.secrets.write(secretKey(), secretValue(), secretLabel() || null),
    onSuccess: async () => {
      toast.push({ title: locale.settings.secretSaved, tone: 'success' });
      setSecretValue('');
      await queryClient.invalidateQueries({ queryKey: ['secret-state'] });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.secretSaveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const restoreSnapshotMutation = createMutation(() => ({
    mutationFn: (name: string) => coreApiClient.settings.restoreSnapshot(name),
    onSuccess: async () => {
      toast.push({ title: locale.settings.saveSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await settingsQuery.refetch();
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const loadSnapshotMutation = createMutation(() => ({
    mutationFn: (name: string) => coreApiClient.settings.loadSnapshot(name),
    onSuccess: (payload) => {
      setSettingsText(safeJsonStringify(payload));
      input.openRoute({ panel: 'system', section: 'raw-json' });
    },
    onError: (error: unknown) => toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' }),
  }));

  async function importRendererPackage(file: File): Promise<void> {
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await nativeBridge.chatTransport.importRendererPackage(file.name, data);
      toast.push({ title: 'Renderer imported', tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['renderer-packages'] });
    } catch (error) {
      toast.push({ title: 'Renderer import failed', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function deleteRendererPackage(renderer: RendererManifest): Promise<void> {
    if (!window.confirm(`Delete renderer ${renderer.name}?`)) {
      return;
    }

    try {
      const deleted = await nativeBridge.chatTransport.deleteRendererPackage(renderer.id);
      if (!deleted) {
        throw new Error('Renderer package was not removed');
      }

      const nextSettings = rendererSettings().default_renderer_id === renderer.id
        ? { ...rendererSettings(), default_renderer_id: null }
        : rendererSettings();
      await saveRendererSettingsMutation.mutateAsync(nextSettings);
      await queryClient.invalidateQueries({ queryKey: ['renderer-packages'] });
      toast.push({ title: 'Renderer deleted', tone: 'success' });
    } catch (error) {
      toast.push({ title: 'Renderer delete failed', description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function createApiProfileId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `api-profile-${Date.now()}`;
  }

  function resetApiProfileEditor(profile?: ApiProfile | null): void {
    setEditingApiProfileId(profile?.id ?? null);
    setApiProfileName(profile?.name ?? '');
    setApiProfileDraft(readProviderSettings({ oai_settings: profile?.settings ?? {} } as AppSettings));
    setApiProfileModelOptions([]);
    setApiProfileStatusPayload({});
  }

  async function refreshApiProfileModels(draft = apiProfileDraft()): Promise<void> {
    setLoadingApiProfileModels(true);
    try {
      const payload = await coreApiClient.generation.listModels(draft.chat_completion_source, {
        reverse_proxy: draft.reverse_proxy,
        proxy_password: draft.proxy_password,
        custom_url: draft.custom_url,
        custom_include_headers: draft.custom_include_headers,
        bypass_status_check: draft.bypass_status_check,
      });
      setApiProfileStatusPayload(payload);
      setApiProfileModelOptions(extractModels(payload));
    } catch (error) {
      const message = getErrorMessage(error);
      setApiProfileStatusPayload({ error: message });
      setApiProfileModelOptions([]);
      toast.push({ title: locale.chats.modelLoadFailed, description: message, tone: 'danger' });
    } finally {
      setLoadingApiProfileModels(false);
    }
  }

  function openCreateApiProfile(): void {
    resetApiProfileEditor(null);
    setApiProfileEditorOpen(true);
  }

  function openEditApiProfile(profile: ApiProfile): void {
    resetApiProfileEditor(profile);
    setApiProfileEditorOpen(true);
  }

  async function saveApiProfile(): Promise<void> {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    setSavingApiProfile(true);
    try {
      const id = editingApiProfileId() ?? createApiProfileId();
      const nextProfile: ApiProfile = {
        id,
        name: apiProfileName().trim(),
        settings: toPersistedProviderSettings(apiProfileDraft(), editingApiProfileId()
          ? apiProfiles().find((profile) => profile.id === id)?.settings
          : undefined),
        updated_at: new Date().toISOString(),
      };
      const nextProfiles = [...apiProfiles().filter((profile) => profile.id !== id), nextProfile].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      await coreApiClient.settings.save({ ...settings, api_profiles: nextProfiles } as Record<string, unknown>);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      setApiProfileEditorOpen(false);
      input.openRoute({ panel: 'api-profiles', section: 'profiles', selected: id });
      toast.push({ title: locale.settings.apiProfileSaved, tone: 'success' });
    } catch (error) {
      toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' });
    } finally {
      setSavingApiProfile(false);
    }
  }

  async function deleteApiProfile(profile: ApiProfile): Promise<void> {
    if (!window.confirm(`${locale.settings.deleteApiProfile}: ${profile.name}?`)) {
      return;
    }

    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    try {
      await coreApiClient.settings.save({ ...settings, api_profiles: apiProfiles().filter((item) => item.id !== profile.id) } as Record<string, unknown>);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      if (currentSelected() === profile.id) {
        input.openRoute({ panel: 'api-profiles', section: 'profiles' });
      }
      toast.push({ title: locale.settings.apiProfileDeleted, tone: 'success' });
    } catch (error) {
      toast.push({ title: locale.settings.saveFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function openPanel(panel: SettingsPanelId): void {
    input.openRoute({ panel, section: getDefaultSection(panel) });
  }

  function openSection(section: string): void {
    input.openRoute({ panel: activePanel(), section, selected: currentSelected() });
  }

  function openSelectedEntity(selected: string): void {
    input.openRoute({ panel: activePanel(), section: activeSection(), selected });
  }

  function updateApiProfileSource(source: ChatProviderDraft['chat_completion_source']): void {
    setApiProfileDraft((current) => setProviderSource(current, source));
  }

  function updateApiProfileModel(model: string): void {
    setApiProfileDraft((current) => setProviderModel(current, model));
  }

  function updateApiProfileField(field: keyof ChatProviderDraft, value: ChatProviderDraft[keyof ChatProviderDraft]): void {
    setApiProfileDraft((current) => ({ ...current, [field]: value }));
  }

  const panelListItems = createMemo(() => SETTINGS_PANEL_REGISTRY.map((panel) => ({
    ...panel,
    active: activePanel() === panel.id,
    onClick: () => openPanel(panel.id),
  })));

  const sectionRailItems = createMemo(() => {
    const panel = activePanel();

    if (panel === 'system' || panel === 'secrets' || panel === 'appearance') {
      return getPanelDefinition(panel).sections.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        active: activeSection() === section.id,
        onClick: () => openSection(section.id),
      }));
    }

    if (panel === 'api-profiles') {
      return apiProfiles().map((profile) => ({
        id: profile.id,
        title: profile.name,
        description: profile.settings.chat_completion_source || 'openai',
        meta: profile.updated_at,
        active: currentSelected() === profile.id,
        onClick: () => openSelectedEntity(profile.id),
      }));
    }

    return (snapshotsQuery.data ?? []).map((snapshot) => ({
      id: snapshot.name,
      title: snapshot.name,
      description: locale.settings.snapshotSummary,
      meta: String(snapshot.created_at ?? ''),
      active: currentSelected() === snapshot.name,
      onClick: () => openSelectedEntity(snapshot.name),
    }));
  });

  return {
    settingsQuery,
    snapshotsQuery,
    secretStateQuery,
    activePanel,
    activeSection,
    currentSelected,
    activePanelDefinition,
    activeSectionDefinition,
    panelListItems,
    sectionRailItems,
    selectedApiProfile,
    selectedSnapshot,
    settingsText,
    setSettingsText,
    generalName,
    setGeneralName,
    secretKey,
    setSecretKey,
    secretValue,
    setSecretValue,
    secretLabel,
    setSecretLabel,
    apiProfiles,
    renderersQuery,
    rendererSettings,
    saveSettingsMutation,
    saveGeneralSettingsMutation,
    saveRendererSettingsMutation,
    createSnapshotMutation,
    saveSecretMutation,
    restoreSnapshotMutation,
    loadSnapshotMutation,
    openPanel,
    openSection,
    openSelectedEntity,
    updateApiProfileSource,
    updateApiProfileModel,
    updateApiProfileField,
    openCreateApiProfile,
    openEditApiProfile,
    deleteApiProfile,
    secretsViewUnavailable,
    apiProfileEditorOpen,
    setApiProfileEditorOpen,
    editingApiProfileId,
    apiProfileName,
    setApiProfileName,
    apiProfileDraft,
    setApiProfileDraft,
    apiProfileModelOptions,
    apiProfileStatusPayload,
    loadingApiProfileModels,
    savingApiProfile,
    refreshApiProfileModels,
    saveApiProfile,
    importRendererPackage,
    deleteRendererPackage,
  };
}
