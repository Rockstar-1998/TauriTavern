import { createQuery, useQueryClient } from '@tanstack/solid-query';
import { Download, Upload } from 'lucide-solid';
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from 'solid-js';

import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { saveJsonExport } from '@/lib/api/export';
import { getErrorMessage } from '@/lib/api/http';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Card, LoadingBlock } from '@/shared/components/ui';

import { getPresetCatalogAdapter, type PresetDraft } from '../catalog-adapters';
import { PRESET_COPY, formatCreateTitle, formatRenameTitle, formatSaveAsTitle } from '../copy';
import type { AdvancedFormattingCatalogId } from '../helpers';
import { buildMasterExportPayload, defaultMasterSectionSelection, detectMasterImportSections, type MasterImportDetectionResult, type MasterSectionId } from '../master-transfer';
import { advancedFormattingCatalogDefinitions, advancedFormattingUtilitySections, getPresetCatalogDefinition, getPresetSectionDefinition, type PresetSectionDefinition } from '../registry';
import { asRecord, deepClone, fileStem, humanizeId, stableStringify } from '../utils';
import { PresetDirtyGuardModal } from './PresetDirtyGuardModal';
import { PresetMasterTransferModal } from './PresetMasterTransferModal';
import { PresetNameModal } from './PresetNameModal';
import { PresetPane } from './PresetPane';
import { PresetSectionEditorModal } from './PresetSectionEditorModal';
import { PresetWorkspace } from './PresetWorkspace';

type AdvancedDialogState =
  | { open: false }
  | { open: true; kind: 'section'; section: string }
  | { open: true; kind: 'create' }
  | { open: true; kind: 'saveAs' }
  | { open: true; kind: 'rename' }
  | { open: true; kind: 'masterImport' }
  | { open: true; kind: 'masterExport' }
  | { open: true; kind: 'startReplyWith' }
  | { open: true; kind: 'customStoppingStrings' }
  | { open: true; kind: 'tokenizer' }
  | { open: true; kind: 'markdownEscapes' }
  | { open: true; kind: 'bindModelTemplates' };

type PendingNavigation =
  | { kind: 'catalog'; apiId: AdvancedFormattingCatalogId }
  | { kind: 'preset'; name: string }
  | null;

const MASTER_SECTION_LABELS: Record<MasterSectionId, string> = {
  instruct: 'Instruct 模板',
  context: 'Context 模板',
  sysprompt: '系统提示',
  preset: '文本补全预设',
  reasoning: '推理模板',
  srw: '起始回复',
};

const MASTER_SECTION_TO_CATALOG = {
  instruct: 'instruct',
  context: 'context',
  sysprompt: 'sysprompt',
  preset: 'textgenerationwebui',
  reasoning: 'reasoning',
} as const;

const OPENAI_MODEL_KEY_BY_SOURCE: Record<string, string> = {
  openai: 'openai_model',
  openrouter: 'openrouter_model',
  claude: 'claude_model',
  makersuite: 'google_model',
  google: 'google_model',
  vertexai: 'vertexai_model',
  custom: 'custom_model',
  ai21: 'ai21_model',
  mistralai: 'mistralai_model',
  cohere: 'cohere_model',
  perplexity: 'perplexity_model',
  groq: 'groq_model',
  chutes: 'chutes_model',
  siliconflow: 'siliconflow_model',
  electronhub: 'electronhub_model',
  nanogpt: 'nanogpt_model',
  deepseek: 'deepseek_model',
  aimlapi: 'aimlapi_model',
  xai: 'xai_model',
  pollinations: 'pollinations_model',
  moonshot: 'moonshot_model',
  fireworks: 'fireworks_model',
  zai: 'zai_model',
  azure_openai: 'azure_openai_model',
};

function ActionIconButton(props: { label: string; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      class="inline-flex h-11 w-11 items-center justify-center rounded-[1.2rem] bg-slate-100 text-slate-700 transition hover:bg-slate-200"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
    >
      {props.children}
    </button>
  );
}

export function AdvancedFormattingHubModal(props: {
  open: boolean;
  initialApiId?: AdvancedFormattingCatalogId;
  initialSelectedName?: string;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToasts();

  const [search, setSearch] = createSignal('');
  const [activeApiId, setActiveApiId] = createSignal<AdvancedFormattingCatalogId>(props.initialApiId ?? 'context');
  const [selectedName, setSelectedName] = createSignal(props.initialSelectedName ?? '');
  const [dialogState, setDialogState] = createSignal<AdvancedDialogState>({ open: false });
  const [dirtyGuardOpen, setDirtyGuardOpen] = createSignal(false);
  const [pendingNavigation, setPendingNavigation] = createSignal<PendingNavigation>(null);
  const [settingsDraft, setSettingsDraft] = createSignal<Record<string, unknown>>({});
  const [presetDraft, setPresetDraft] = createSignal<PresetDraft>({});
  const [savedSnapshot, setSavedSnapshot] = createSignal<PresetDraft>({});
  const [companionDraft, setCompanionDraft] = createSignal<Record<string, unknown>>({});
  const [loadedSelectionKey, setLoadedSelectionKey] = createSignal('');
  const [selectionLoading, setSelectionLoading] = createSignal(false);
  const [settingsInitialized, setSettingsInitialized] = createSignal(false);
  const [saveState, setSaveState] = createSignal<'synced' | 'saving' | 'error'>('synced');
  const [masterImportDetection, setMasterImportDetection] = createSignal<MasterImportDetectionResult | null>(null);
  const [masterSelection, setMasterSelection] = createSignal<Record<MasterSectionId, boolean>>(defaultMasterSectionSelection());
  const [hasOpenedOnce, setHasOpenedOnce] = createSignal(false);

  let masterImportInput: HTMLInputElement | undefined;
  let saveTimer: number | undefined;
  let queuedSettings: Record<string, unknown> | null = null;
  let loadRequestVersion = 0;

  const catalog = createMemo(() => getPresetCatalogDefinition(activeApiId()));
  const adapter = createMemo(() => getPresetCatalogAdapter(activeApiId()));
  const combinedValues = createMemo(() => ({ ...presetDraft(), ...companionDraft() }));
  const settingsQuery = createQuery(() => ({
    queryKey: ['settings'],
    queryFn: () => coreApiClient.getSettings(),
    refetchOnWindowFocus: false,
  }));
  const presetNamesQuery = createQuery(() => ({
    queryKey: ['presets', activeApiId()],
    queryFn: () => coreApiClient.presets.list(activeApiId()),
    refetchOnWindowFocus: false,
    enabled: props.open,
  }));
  const presetNames = createMemo(() => presetNamesQuery.data ?? []);
  const filteredNames = createMemo(() => {
    const keyword = search().trim().toLowerCase();
    if (!keyword) {
      return presetNames();
    }
    return presetNames().filter((name) => name.toLowerCase().includes(keyword));
  });
  const hasSelection = createMemo(() => !!selectedName() && presetNames().includes(selectedName()));
  const dirty = createMemo(() => stableStringify(presetDraft()) !== stableStringify(savedSnapshot()));
  const utilitySectionMap = Object.fromEntries(advancedFormattingUtilitySections.map((section) => [section.id, section])) as Record<string, PresetSectionDefinition>;
  const dialogKind = createMemo(() => {
    const dialog = dialogState();
    return dialog.open ? dialog.kind : null;
  });
  const activeSection = createMemo(() => {
    const dialog = dialogState();
    if (!dialog.open || dialog.kind !== 'section') {
      return null;
    }
    return getPresetSectionDefinition(activeApiId(), dialog.section) ?? null;
  });
  const activeUtilitySection = createMemo(() => {
    const dialog = dialogState();
    if (!dialog.open) {
      return null;
    }
    switch (dialog.kind) {
      case 'startReplyWith':
        return utilitySectionMap['start-reply-with'];
      case 'customStoppingStrings':
        return utilitySectionMap['custom-stopping-strings'];
      case 'tokenizer':
        return utilitySectionMap.tokenizer;
      case 'markdownEscapes':
        return utilitySectionMap['markdown-escapes'];
      default:
        return null;
    }
  });
  const currentSettingsSource = createMemo(() => {
    const local = settingsDraft();
    if (Object.keys(local).length > 0) {
      return local;
    }
    return asRecord(settingsQuery.data);
  });
  const masterSectionOptions = (Object.keys(MASTER_SECTION_LABELS) as MasterSectionId[]).map((sectionId) => ({ id: sectionId, label: MASTER_SECTION_LABELS[sectionId] }));

  function closeLocalDialog(): void {
    setDialogState({ open: false });
  }

  function sectionTitle(section: PresetSectionDefinition | null): string {
    if (!section) {
      return '';
    }
    return section.label && !section.label.includes('?') ? section.label : humanizeId(section.id);
  }

  function buildSettingsPayload(nextPreset = presetDraft(), nextCompanion = companionDraft(), activeName = selectedName()): Record<string, unknown> {
    let next = deepClone(currentSettingsSource());
    next = adapter().applyPresetDraftToSettings(next, nextPreset);
    next = adapter().writeWorkspaceCompanion(next, nextCompanion);
    if (activeName) {
      next = adapter().writeActiveName(next, activeName);
    }
    return next;
  }

  async function commitSettings(payload?: Record<string, unknown>): Promise<void> {
    const nextPayload = payload ?? queuedSettings ?? currentSettingsSource();
    queuedSettings = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    setSaveState('saving');
    await coreApiClient.settings.save(nextPayload);
    setSettingsDraft(deepClone(nextPayload));
    setSaveState('synced');
  }

  function scheduleSettingsSave(payload: Record<string, unknown>): void {
    queuedSettings = deepClone(payload);
    setSettingsDraft(deepClone(payload));
    setSaveState('saving');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      const nextPayload = queuedSettings;
      if (!nextPayload) {
        return;
      }
      void commitSettings(nextPayload).catch((error) => {
        setSaveState('error');
        toast.push({ title: PRESET_COPY.saveSettingsFailed, description: getErrorMessage(error), tone: 'danger' });
      });
    }, 250);
  }

  async function flushPendingSettings(): Promise<void> {
    if (queuedSettings) {
      await commitSettings(queuedSettings);
    }
  }

  async function restoreLiveFromSavedSnapshot(): Promise<void> {
    const snapshot = deepClone(savedSnapshot());
    setPresetDraft(snapshot);
    const payload = buildSettingsPayload(snapshot, companionDraft());
    await commitSettings(payload);
  }

  function queueNavigation(target: PendingNavigation): void {
    if (!dirty()) {
      void continueNavigation(target);
      return;
    }
    setPendingNavigation(target);
    setDirtyGuardOpen(true);
  }

  async function continueNavigation(target: PendingNavigation): Promise<void> {
    setPendingNavigation(null);
    setDirtyGuardOpen(false);
    if (!target) {
      return;
    }
    if (target.kind === 'catalog') {
      setSearch('');
      setLoadedSelectionKey('');
      setSelectedName('');
      setActiveApiId(target.apiId);
      return;
    }
    setSelectedName(target.name);
  }

  async function handleSaveAndContinue(): Promise<void> {
    const success = await updateCurrentPreset(false);
    if (success) {
      await continueNavigation(pendingNavigation());
    }
  }

  async function handleDiscardAndContinue(): Promise<void> {
    await restoreLiveFromSavedSnapshot();
    await continueNavigation(pendingNavigation());
  }

  function setFieldValue(fieldId: string, value: unknown): void {
    const field = [...catalog().sections.flatMap((section) => section.fields), ...advancedFormattingUtilitySections.flatMap((section) => section.fields)].find((item) => item.id === fieldId);
    if (!field) {
      return;
    }
    if ((field.scope ?? 'preset') === 'preset') {
      const nextPreset = { ...presetDraft(), [fieldId]: value };
      setPresetDraft(nextPreset);
      scheduleSettingsSave(buildSettingsPayload(nextPreset, companionDraft()));
      return;
    }
    const nextCompanion = { ...companionDraft(), [fieldId]: value };
    setCompanionDraft(nextCompanion);
    scheduleSettingsSave(buildSettingsPayload(presetDraft(), nextCompanion));
  }

  async function migrateLegacyInstructSystemPrompt(name: string, draft: PresetDraft): Promise<PresetDraft> {
    const prompt = String(draft.system_prompt ?? '').trim();
    if (!prompt) {
      return draft;
    }
    const syspromptName = `[Migrated] ${name}`;
    await coreApiClient.presets.save('sysprompt', syspromptName, { name: syspromptName, content: prompt, post_history: '' });
    const nextDraft = deepClone(draft);
    nextDraft.system_prompt = '';
    const extras = asRecord(nextDraft.__extras);
    delete extras.system_prompt;
    nextDraft.__extras = extras;
    toast.push({ title: PRESET_COPY.migrateSystemPrompt, tone: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['presets', 'sysprompt'] });
    return nextDraft;
  }

  async function updateCurrentPreset(notify = true): Promise<boolean> {
    if (!hasSelection()) {
      toast.push({ title: PRESET_COPY.choosePresetFirst, tone: 'danger' });
      return false;
    }
    try {
      await flushPendingSettings();
      let draftToSave = deepClone(presetDraft());
      if (activeApiId() === 'instruct') {
        draftToSave = await migrateLegacyInstructSystemPrompt(selectedName(), draftToSave);
        setPresetDraft(draftToSave);
      }
      draftToSave.name = selectedName();
      const response = await coreApiClient.presets.save(activeApiId(), selectedName(), adapter().serializePreset(draftToSave));
      const canonicalName = response.name;
      setSelectedName(canonicalName);
      setSavedSnapshot(deepClone({ ...draftToSave, name: canonicalName }));
      await queryClient.invalidateQueries({ queryKey: ['presets', activeApiId()] });
      if (notify) {
        toast.push({ title: PRESET_COPY.updateSucceeded, tone: 'success' });
      }
      return true;
    } catch (error) {
      toast.push({ title: PRESET_COPY.updateCurrent, description: getErrorMessage(error), tone: 'danger' });
      return false;
    }
  }

  async function createNamedPreset(name: string): Promise<void> {
    if (!name) {
      return;
    }
    try {
      const draft = { ...adapter().createDefaultDraft(), name };
      const response = await coreApiClient.presets.save(activeApiId(), name, adapter().serializePreset(draft));
      await queryClient.invalidateQueries({ queryKey: ['presets', activeApiId()] });
      toast.push({ title: PRESET_COPY.createSucceeded, tone: 'success' });
      closeLocalDialog();
      setSelectedName(response.name);
    } catch (error) {
      toast.push({ title: PRESET_COPY.createNew, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function saveAsNamedPreset(name: string): Promise<void> {
    if (!name) {
      return;
    }
    try {
      await flushPendingSettings();
      let draft = deepClone(presetDraft());
      if (activeApiId() === 'instruct') {
        draft = await migrateLegacyInstructSystemPrompt(name, draft);
      }
      draft.name = name;
      const response = await coreApiClient.presets.save(activeApiId(), name, adapter().serializePreset(draft));
      await queryClient.invalidateQueries({ queryKey: ['presets', activeApiId()] });
      toast.push({ title: PRESET_COPY.saveAsSucceeded, tone: 'success' });
      closeLocalDialog();
      setSelectedName(response.name);
    } catch (error) {
      toast.push({ title: PRESET_COPY.saveAs, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function renameCurrentPreset(name: string): Promise<void> {
    if (!name || !hasSelection()) {
      return;
    }
    try {
      await flushPendingSettings();
      let draft = deepClone(presetDraft());
      if (activeApiId() === 'instruct') {
        draft = await migrateLegacyInstructSystemPrompt(name, draft);
      }
      draft.name = name;
      const response = await coreApiClient.presets.save(activeApiId(), name, adapter().serializePreset(draft));
      await coreApiClient.presets.delete(activeApiId(), selectedName());
      await queryClient.invalidateQueries({ queryKey: ['presets', activeApiId()] });
      toast.push({ title: PRESET_COPY.renameSucceeded, tone: 'success' });
      closeLocalDialog();
      setSelectedName(response.name);
    } catch (error) {
      toast.push({ title: PRESET_COPY.rename, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function restoreCurrentPreset(): Promise<void> {
    if (!hasSelection() || !catalog().supportsRestore) {
      return;
    }
    try {
      const restored = await coreApiClient.presets.restore(activeApiId(), selectedName());
      if (!restored.isDefault || Object.keys(restored.preset ?? {}).length === 0) {
        toast.push({ title: PRESET_COPY.restore, description: PRESET_COPY.loadFailed, tone: 'danger' });
        return;
      }
      const normalized = adapter().normalizeRestoredPreset(restored.preset);
      normalized.name = selectedName();
      setPresetDraft(normalized);
      setSavedSnapshot(deepClone(normalized));
      const nextSettings = buildSettingsPayload(normalized, companionDraft());
      await commitSettings(nextSettings);
      toast.push({ title: PRESET_COPY.restoreSucceeded, tone: 'success' });
    } catch (error) {
      toast.push({ title: PRESET_COPY.restore, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function deleteCurrentPreset(): Promise<void> {
    if (!hasSelection()) {
      return;
    }
    if (!window.confirm(`${PRESET_COPY.deleteConfirm}\n${selectedName()}`)) {
      return;
    }
    try {
      await coreApiClient.presets.delete(activeApiId(), selectedName());
      await queryClient.invalidateQueries({ queryKey: ['presets', activeApiId()] });
      const nextNames = await coreApiClient.presets.list(activeApiId());
      toast.push({ title: PRESET_COPY.deleteSucceeded, tone: 'success' });
      setSelectedName(nextNames[0] ?? '');
    } catch (error) {
      toast.push({ title: PRESET_COPY.delete, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function loadSelectedPreset(): Promise<void> {
    if (!hasSelection()) {
      return;
    }
    const requestId = ++loadRequestVersion;
    setSelectionLoading(true);
    try {
      const restored = await coreApiClient.presets.get(activeApiId(), selectedName());
      if (!restored) {
        throw new Error('preset_not_found');
      }
      if (requestId !== loadRequestVersion) {
        return;
      }
      const normalized = adapter().normalizeRestoredPreset(restored);
      normalized.name = selectedName();
      const nextSettings = buildSettingsPayload(normalized, companionDraft(), selectedName());
      await commitSettings(nextSettings);
      const companion = adapter().readWorkspaceCompanion(nextSettings);
      if (requestId !== loadRequestVersion) {
        return;
      }
      setPresetDraft(normalized);
      setSavedSnapshot(deepClone(normalized));
      setCompanionDraft(companion);
      setLoadedSelectionKey(`${activeApiId()}::${selectedName()}`);
    } catch (error) {
      toast.push({ title: PRESET_COPY.loadFailed, description: getErrorMessage(error), tone: 'danger' });
    } finally {
      setSelectionLoading(false);
    }
  }

  function getCurrentModelBindingKey(): string {
    const oaiSettings = asRecord(currentSettingsSource().oai_settings);
    const source = String(oaiSettings.chat_completion_source ?? 'openai');
    const modelKey = OPENAI_MODEL_KEY_BY_SOURCE[source] ?? 'openai_model';
    const model = String(oaiSettings[modelKey] ?? '').trim();
    if (model) {
      return model;
    }
    return String(asRecord(currentSettingsSource().power_user).chat_template_hash ?? '').trim();
  }

  const currentBindingValue = createMemo(() => {
    const key = getCurrentModelBindingKey();
    if (!key) {
      return null;
    }
    return asRecord(asRecord(currentSettingsSource().power_user).model_templates_mappings)[key] ?? null;
  });

  async function bindCurrentModelTemplates(): Promise<void> {
    const key = getCurrentModelBindingKey();
    if (!key) {
      return;
    }
    const mappings = deepClone(asRecord(companionDraft().model_templates_mappings ?? asRecord(asRecord(currentSettingsSource().power_user).model_templates_mappings)));
    mappings[key] = {
      context: getPresetCatalogAdapter('context').readActiveName(currentSettingsSource()) ?? '',
      instruct: getPresetCatalogAdapter('instruct').readActiveName(currentSettingsSource()) ?? '',
    };
    const nextCompanion = { ...companionDraft(), model_templates_mappings: mappings };
    setCompanionDraft(nextCompanion);
    await commitSettings(buildSettingsPayload(presetDraft(), nextCompanion));
  }

  async function clearCurrentModelBinding(): Promise<void> {
    const key = getCurrentModelBindingKey();
    if (!key) {
      return;
    }
    const mappings = deepClone(asRecord(companionDraft().model_templates_mappings ?? asRecord(asRecord(currentSettingsSource().power_user).model_templates_mappings)));
    delete mappings[key];
    const nextCompanion = { ...companionDraft(), model_templates_mappings: mappings };
    setCompanionDraft(nextCompanion);
    await commitSettings(buildSettingsPayload(presetDraft(), nextCompanion));
  }

  async function openMasterImportFromFile(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const detection = detectMasterImportSections(parsed, file.name);
      if (detection.kind === 'invalid') {
        toast.push({ title: PRESET_COPY.noMasterSections, tone: 'danger' });
        return;
      }
      const defaults = defaultMasterSectionSelection();
      const selection = Object.fromEntries(
        (Object.keys(defaults) as MasterSectionId[]).map((sectionId) => [sectionId, detection.sections.includes(sectionId) && defaults[sectionId]]),
      ) as Record<MasterSectionId, boolean>;
      setMasterImportDetection(detection);
      setMasterSelection(selection);
      setDialogState({ open: true, kind: 'masterImport' });
    } catch {
      toast.push({ title: PRESET_COPY.importFileError, tone: 'danger' });
    }
  }

  async function executeMasterImport(): Promise<void> {
    const detection = masterImportDetection();
    if (!detection) {
      return;
    }
    const availableSections = detection.sections as MasterSectionId[];
    const selectedSections = (Object.keys(masterSelection()) as MasterSectionId[]).filter(
      (sectionId) => masterSelection()[sectionId] && availableSections.includes(sectionId),
    );
    if (selectedSections.length === 0) {
      toast.push({ title: PRESET_COPY.noMasterSelection, tone: 'danger' });
      return;
    }

    try {
      let nextSettings = deepClone(currentSettingsSource());
      const touchedCatalogs = new Set<string>();
      let nextCatalogSelection: { apiId: AdvancedFormattingCatalogId; name: string } | null = null;
      for (const sectionId of selectedSections) {
        const payload = (detection.payloadBySection as Partial<Record<MasterSectionId, Record<string, unknown>>>)[sectionId];
        if (!payload) {
          continue;
        }
        if (sectionId === 'srw') {
          const powerUser = asRecord(nextSettings.power_user);
          nextSettings.power_user = {
            ...powerUser,
            user_prompt_bias: payload.value ?? '',
            show_user_prompt_bias: Boolean(payload.show),
          };
          continue;
        }

        const catalogId = MASTER_SECTION_TO_CATALOG[sectionId as Exclude<MasterSectionId, 'srw'>];
        const catalogAdapter = getPresetCatalogAdapter(catalogId);
        let normalized = catalogAdapter.normalizeRestoredPreset(payload);
        const requestedName = typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : fileStem(detection.fileName) || `${catalogId}-imported`;
        if (catalogId === 'instruct') {
          normalized = await migrateLegacyInstructSystemPrompt(requestedName, normalized);
        }
        if (catalogAdapter.definition.kind === 'advanced-formatting') {
          normalized.name = requestedName;
        }
        const response = await coreApiClient.presets.save(catalogId, requestedName, catalogAdapter.serializePreset(normalized));
        touchedCatalogs.add(catalogId);
        if (catalogAdapter.definition.kind === 'advanced-formatting') {
          nextCatalogSelection = { apiId: catalogId as AdvancedFormattingCatalogId, name: response.name };
        }
      }

      await commitSettings(nextSettings);
      await Promise.all([...touchedCatalogs].map((catalogId) => queryClient.invalidateQueries({ queryKey: ['presets', catalogId] })));
      closeLocalDialog();
      toast.push({ title: PRESET_COPY.masterImportSucceeded, tone: 'success' });
      if (nextCatalogSelection) {
        setActiveApiId(nextCatalogSelection.apiId);
        setSelectedName(nextCatalogSelection.name);
      }
    } catch (error) {
      toast.push({ title: PRESET_COPY.masterImport, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function executeMasterExport(): Promise<void> {
    const selectedSections = (Object.keys(masterSelection()) as MasterSectionId[]).filter((sectionId) => masterSelection()[sectionId]);
    if (selectedSections.length === 0) {
      toast.push({ title: PRESET_COPY.noMasterSelection, tone: 'danger' });
      return;
    }
    try {
      const snapshot: Partial<Record<MasterSectionId, Record<string, unknown>>> = {};
      for (const sectionId of selectedSections) {
        if (sectionId === 'srw') {
          const powerUser = asRecord(currentSettingsSource().power_user);
          snapshot.srw = {
            value: powerUser.user_prompt_bias ?? '',
            show: Boolean(powerUser.show_user_prompt_bias),
          };
          continue;
        }
        const catalogId = MASTER_SECTION_TO_CATALOG[sectionId as Exclude<MasterSectionId, 'srw'>];
        if (catalogId === activeApiId() && hasSelection()) {
          snapshot[sectionId] = adapter().serializePreset({ ...presetDraft(), name: selectedName() });
          continue;
        }

        const sectionAdapter = getPresetCatalogAdapter(catalogId);
        const activeName = sectionAdapter.readActiveName(currentSettingsSource());
        if (!activeName) {
          continue;
        }
        const payload = await coreApiClient.presets.get(catalogId, activeName);
        if (!payload) {
          throw new Error('preset_not_found');
        }
        const normalized = sectionAdapter.normalizeRestoredPreset(payload);
        if (sectionAdapter.definition.kind === 'advanced-formatting') {
          normalized.name = activeName;
        }
        snapshot[sectionId] = sectionAdapter.serializePreset(normalized);
      }
      const exportPayload = buildMasterExportPayload(selectedSections, snapshot);
      const exportDate = new Date().toISOString().slice(0, 10);
      void saveJsonExport(exportPayload, `ST-formatting-${exportDate}.json`);
      toast.push({ title: PRESET_COPY.masterExportSucceeded, tone: 'success' });
      closeLocalDialog();
    } catch (error) {
      toast.push({ title: PRESET_COPY.masterExport, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  createEffect(() => {
    if (settingsQuery.data && !settingsInitialized()) {
      setSettingsDraft(deepClone(asRecord(settingsQuery.data)));
      setSettingsInitialized(true);
    }
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }
    if (!hasOpenedOnce() || props.initialApiId || props.initialSelectedName) {
      setHasOpenedOnce(true);
      setSearch('');
      setLoadedSelectionKey('');
      setActiveApiId(props.initialApiId ?? activeApiId());
      if (props.initialSelectedName !== undefined) {
        setSelectedName(props.initialSelectedName);
      }
    }
  });

  createEffect(() => {
    if (!props.open || presetNamesQuery.isPending) {
      return;
    }
    if (presetNames().length === 0) {
      if (selectedName()) {
        setSelectedName('');
      }
      return;
    }
    if (!hasSelection()) {
      setSelectedName(presetNames()[0]);
    }
  });

  createEffect(() => {
    if (!props.open || !hasSelection() || !settingsInitialized()) {
      return;
    }
    const key = `${activeApiId()}::${selectedName()}`;
    if (loadedSelectionKey() === key) {
      return;
    }
    void loadSelectedPreset();
  });

  createEffect((previousApiId?: AdvancedFormattingCatalogId) => {
    const currentApiId = activeApiId();
    if (previousApiId && previousApiId !== currentApiId) {
      setLoadedSelectionKey('');
      setSearch('');
    }
    return currentApiId;
  });

  onCleanup(() => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
  });

  return (
    <>
      <WorkbenchModal open={props.open} onClose={props.onClose} title={PRESET_COPY.advancedFormattingTitle} size="xl">
        <div class="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
          <div class="min-w-0">
            <PresetPane
              title={PRESET_COPY.advancedFormattingTitle}
              subtitle={PRESET_COPY.advancedFormattingSubtitle}
              railTitle={PRESET_COPY.advancedTemplateTypes}
              railMetaLabel={PRESET_COPY.advancedTemplateLabel}
              definitions={advancedFormattingCatalogDefinitions}
              activeCatalog={catalog()}
              activeId={activeApiId()}
              search={search()}
              names={filteredNames()}
              selectedName={selectedName()}
              actions={
                <>
                  <ActionIconButton label={PRESET_COPY.masterImport} onClick={() => masterImportInput?.click()}><Upload size={18} /></ActionIconButton>
                  <ActionIconButton label={PRESET_COPY.masterExport} onClick={() => {
                    setMasterSelection(defaultMasterSectionSelection());
                    setDialogState({ open: true, kind: 'masterExport' });
                  }}><Download size={18} /></ActionIconButton>
                </>
              }
              onSearchChange={setSearch}
              onCatalogChange={(apiId) => queueNavigation({ kind: 'catalog', apiId: apiId as AdvancedFormattingCatalogId })}
              onSelect={(name) => queueNavigation({ kind: 'preset', name })}
            />
          </div>

          <div class="min-w-0">
            <Show when={settingsQuery.data && !selectionLoading()} fallback={<LoadingBlock />}>
              <PresetWorkspace
                catalog={catalog()}
                selectedName={selectedName()}
                hasSelection={hasSelection()}
                loading={selectionLoading()}
                dirty={dirty()}
                saveState={saveState()}
                values={combinedValues()}
                bindPresetToConnection={false}
                onToggleConnectionBinding={() => undefined}
                onUpdateCurrent={() => void updateCurrentPreset()}
                onSaveAs={() => setDialogState({ open: true, kind: 'saveAs' })}
                onRename={() => setDialogState({ open: true, kind: 'rename' })}
                onRestore={() => void restoreCurrentPreset()}
                onExport={() => undefined}
                onDelete={() => void deleteCurrentPreset()}
                onCreate={() => setDialogState({ open: true, kind: 'create' })}
                onOpenSection={(sectionId) => setDialogState({ open: true, kind: 'section', section: sectionId })}
                onOpenUtility={(utilityId) => {
                  if (utilityId === 'masterImport') {
                    masterImportInput?.click();
                    return;
                  }
                  if (utilityId === 'masterExport') {
                    setMasterSelection(defaultMasterSectionSelection());
                    setDialogState({ open: true, kind: 'masterExport' });
                    return;
                  }
                  if (utilityId === 'start-reply-with') {
                    setDialogState({ open: true, kind: 'startReplyWith' });
                    return;
                  }
                  if (utilityId === 'custom-stopping-strings') {
                    setDialogState({ open: true, kind: 'customStoppingStrings' });
                    return;
                  }
                  if (utilityId === 'tokenizer') {
                    setDialogState({ open: true, kind: 'tokenizer' });
                    return;
                  }
                  if (utilityId === 'markdown-escapes') {
                    setDialogState({ open: true, kind: 'markdownEscapes' });
                    return;
                  }
                  if (utilityId === 'bind-model-templates') {
                    setDialogState({ open: true, kind: 'bindModelTemplates' });
                  }
                }}
              />
            </Show>
          </div>
        </div>
        <input
          ref={masterImportInput}
          type="file"
          class="hidden"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void openMasterImportFromFile(file);
            }
            event.currentTarget.value = '';
          }}
        />
      </WorkbenchModal>

      <PresetSectionEditorModal
        open={Boolean(activeSection())}
        title={sectionTitle(activeSection())}
        section={activeSection() ?? catalog().sections[0]}
        values={combinedValues()}
        onClose={closeLocalDialog}
        onFieldChange={setFieldValue}
      />

      <PresetSectionEditorModal
        open={Boolean(activeUtilitySection())}
        title={sectionTitle(activeUtilitySection())}
        section={activeUtilitySection() ?? advancedFormattingUtilitySections[0]}
        values={combinedValues()}
        onClose={closeLocalDialog}
        onFieldChange={setFieldValue}
      />

      <PresetNameModal
        open={dialogKind() === 'create'}
        title={formatCreateTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.createConfirm}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeLocalDialog}
        onConfirm={(name) => void createNamedPreset(name)}
      />

      <PresetNameModal
        open={dialogKind() === 'saveAs'}
        title={formatSaveAsTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.saveAsConfirm}
        initialValue={selectedName()}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeLocalDialog}
        onConfirm={(name) => void saveAsNamedPreset(name)}
      />

      <PresetNameModal
        open={dialogKind() === 'rename'}
        title={formatRenameTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.renameConfirm}
        initialValue={selectedName()}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeLocalDialog}
        onConfirm={(name) => void renameCurrentPreset(name)}
      />

      <PresetMasterTransferModal
        open={dialogKind() === 'masterImport'}
        title={PRESET_COPY.masterImport}
        description={masterImportDetection() ? `文件：${masterImportDetection()!.fileName}` : undefined}
        confirmLabel={PRESET_COPY.import}
        sections={masterSectionOptions.filter((section) => Boolean(masterImportDetection() && (masterImportDetection()!.sections as MasterSectionId[]).includes(section.id)))}
        selected={masterSelection()}
        onToggle={(sectionId, checked) => setMasterSelection((current) => ({ ...current, [sectionId]: checked }))}
        onClose={closeLocalDialog}
        onConfirm={() => void executeMasterImport()}
      />

      <PresetMasterTransferModal
        open={dialogKind() === 'masterExport'}
        title={PRESET_COPY.masterExport}
        confirmLabel={PRESET_COPY.export}
        sections={masterSectionOptions}
        selected={masterSelection()}
        onToggle={(sectionId, checked) => setMasterSelection((current) => ({ ...current, [sectionId]: checked }))}
        onClose={closeLocalDialog}
        onConfirm={() => void executeMasterExport()}
      />

      <WorkbenchModal
        open={dialogKind() === 'bindModelTemplates'}
        onClose={closeLocalDialog}
        title={PRESET_COPY.bindModelTemplates}
        size="md"
        footer={
          <div class="flex justify-end gap-3">
            <Button variant="ghost" onClick={closeLocalDialog}>{PRESET_COPY.cancel}</Button>
            <Button variant="secondary" onClick={() => void clearCurrentModelBinding()}>{PRESET_COPY.clearCurrentBinding}</Button>
            <Button onClick={() => void bindCurrentModelTemplates()}>{PRESET_COPY.bindCurrentModel}</Button>
          </div>
        }
      >
        <div class="space-y-4">
          <Card title={PRESET_COPY.currentBinding}>
            <div class="space-y-2 text-sm text-slate-600">
              <div>{getCurrentModelBindingKey() || PRESET_COPY.noBinding}</div>
              <pre class="tt-muted-surface overflow-x-auto rounded-[1.2rem] px-4 py-3 text-xs text-slate-700">{JSON.stringify(currentBindingValue() ?? {}, null, 2)}</pre>
            </div>
          </Card>
        </div>
      </WorkbenchModal>

      <PresetDirtyGuardModal
        open={dirtyGuardOpen()}
        onCancel={() => {
          setDirtyGuardOpen(false);
          setPendingNavigation(null);
        }}
        onDiscard={() => void handleDiscardAndContinue()}
        onSave={() => void handleSaveAndContinue()}
      />
    </>
  );
}
