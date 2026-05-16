import { createQuery, useQueryClient } from '@tanstack/solid-query';
import { useBeforeLeave, useNavigate, useSearchParams } from '@solidjs/router';
import { ChevronLeft } from 'lucide-solid';
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from 'solid-js';

import { DesktopContextPane } from '@/app/layout/desktop/DesktopContextPane';
import { DesktopWorkspaceBoard } from '@/app/layout/desktop/DesktopWorkspaceBoard';
import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { saveJsonExport } from '@/lib/api/export';
import { ApiError, getErrorMessage } from '@/lib/api/http';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Card, LoadingBlock } from '@/shared/components/ui';

import { getPresetCatalogAdapter, isOpenAISensitiveFieldKey, stripOpenAISensitiveFields, type PresetDraft } from './catalog-adapters';
import { PRESET_COPY, formatCreateTitle, formatRenameTitle, formatSaveAsTitle } from './copy';
import { buildPresetHref, coerceAdvancedFormattingApiId, normalizePresetApiId, type AdvancedFormattingCatalogId, type CompletionPresetCatalogId } from './helpers';
import { buildMasterExportPayload, defaultMasterSectionSelection, detectMasterImportSections, type MasterImportDetectionResult, type MasterSectionId } from './master-transfer';
import { sanitizePromptManagerPayload, type PromptManagerSanitizeResult } from './openai-prompt-manager';
import { advancedFormattingUtilitySections, completionPresetCatalogDefinitions, getPresetCatalogDefinition, getPresetSectionDefinition, type PresetCatalogId, type PresetSectionDefinition } from './registry';
import { asRecord, deepClone, fileStem, humanizeId, stableStringify } from './utils';
import { AdvancedFormattingHubModal } from './components/AdvancedFormattingHubModal';
import { PresetDirtyGuardModal } from './components/PresetDirtyGuardModal';
import { PresetMasterTransferModal } from './components/PresetMasterTransferModal';
import { PresetNameModal } from './components/PresetNameModal';
import { OpenAIPromptManagerModal } from './components/OpenAIPromptManagerModal';
import { PresetPane } from './components/PresetPane';
import { PresetSectionEditorModal } from './components/PresetSectionEditorModal';
import { PresetWorkspace } from './components/PresetWorkspace';

type PresetSearchParams = {
  apiId?: CompletionPresetCatalogId | string;
  selected?: string;
};

type PresetDialogState =
  | { open: false }
  | { open: true; kind: 'section'; section: string }
  | { open: true; kind: 'create' }
  | { open: true; kind: 'saveAs' }
  | { open: true; kind: 'rename' }
  | { open: true; kind: 'promptManager' }
  | { open: true; kind: 'advancedFormatting'; apiId?: AdvancedFormattingCatalogId; selectedName?: string }
  | { open: true; kind: 'masterImport' }
  | { open: true; kind: 'masterExport' }
  | { open: true; kind: 'startReplyWith' }
  | { open: true; kind: 'customStoppingStrings' }
  | { open: true; kind: 'tokenizer' }
  | { open: true; kind: 'markdownEscapes' }
  | { open: true; kind: 'bindModelTemplates' };

type PendingNavigation =
  | { kind: 'catalog'; apiId: PresetCatalogId }
  | { kind: 'preset'; name: string }
  | { kind: 'leave' }
  | null;

type PromptManagerState = {
  prompts: unknown;
  prompt_order: unknown;
  inherited: boolean;
  migrated: boolean;
  migratedMap: boolean;
  repaired: boolean;
  stats: PromptManagerSanitizeResult['stats'];
};

type ResolvedPresetSelection = {
  name: string;
  normalizedFrom?: string;
  normalizedReason?: 'strip_extension' | 'case_insensitive' | 'canonical' | 'loose';
};

const MASTER_SECTION_LABELS: Record<MasterSectionId, string> = {
  instruct: 'Instruct 模板',
  context: 'Context 模板',
  sysprompt: '系统提示',
  preset: '文本补全预设',
  reasoning: '推理模板',
  srw: '起始回复',
};

const MASTER_SECTION_TO_CATALOG: Record<Exclude<MasterSectionId, 'srw'>, PresetCatalogId> = {
  instruct: 'instruct',
  context: 'context',
  sysprompt: 'sysprompt',
  preset: 'textgenerationwebui',
  reasoning: 'reasoning',
};

function stripPresetSuffix(name: string): string {
  return String(name ?? '').replace(/\.json$/i, '').trim();
}

function canonicalPresetName(name: string): string {
  const unsafe = '/\\:*?"<>|';
  return Array.from(String(name ?? ''))
    .map((char) => {
      if (unsafe.includes(char)) {
        return '_';
      }
      if (char === '-' || char === '_' || char === '.' || char === ' ') {
        return char;
      }
      if (/\p{L}|\p{N}/u.test(char)) {
        return char;
      }
      return '_';
    })
    .join('')
    .trim();
}

function normalizePresetNameForMatch(name: string): string {
  const trimmed = stripPresetSuffix(String(name ?? '').trim());
  return canonicalPresetName(trimmed)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]+/g, '');
}

function findCaseInsensitiveMatch(name: string, candidates: string[]): string | null {
  const target = name.toLowerCase();
  const matches = candidates.filter((candidate) => candidate.toLowerCase() === target);
  return matches.length === 1 ? matches[0] : null;
}

function findCanonicalMatch(name: string, candidates: string[]): string | null {
  const canonical = canonicalPresetName(name).toLowerCase();
  if (!canonical) {
    return null;
  }
  const matches = candidates.filter((candidate) => canonicalPresetName(candidate).toLowerCase() === canonical);
  return matches.length === 1 ? matches[0] : null;
}

function findLooseMatch(name: string, candidates: string[]): string | null {
  const normalized = normalizePresetNameForMatch(name);
  if (!normalized) {
    return null;
  }
  const matches = candidates.filter((candidate) => normalizePresetNameForMatch(candidate) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function resolvePresetSelection(name: string, candidates: string[]): ResolvedPresetSelection | null {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (candidates.length === 0) {
    return { name: trimmed };
  }
  if (candidates.includes(trimmed)) {
    return { name: trimmed };
  }
  const stripped = stripPresetSuffix(trimmed);
  if (stripped && candidates.includes(stripped)) {
    return { name: stripped, normalizedFrom: trimmed, normalizedReason: 'strip_extension' };
  }
  const caseMatch = findCaseInsensitiveMatch(stripped || trimmed, candidates);
  if (caseMatch) {
    return { name: caseMatch, normalizedFrom: trimmed, normalizedReason: 'case_insensitive' };
  }
  const canonicalMatch = findCanonicalMatch(trimmed, candidates);
  if (canonicalMatch) {
    return { name: canonicalMatch, normalizedFrom: trimmed, normalizedReason: 'canonical' };
  }
  const looseMatch = findLooseMatch(trimmed, candidates);
  if (looseMatch) {
    return { name: looseMatch, normalizedFrom: trimmed, normalizedReason: 'loose' };
  }
  return null;
}

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

export default function PresetsPage(props: { layout?: 'desktop' | 'mobile' }): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToasts();
  const [searchParams] = useSearchParams<PresetSearchParams>();

  const [search, setSearch] = createSignal('');
  const [dialogState, setDialogState] = createSignal<PresetDialogState>({ open: false });
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
  const [leaveRetry, setLeaveRetry] = createSignal<(() => void) | null>(null);
  const [handledLegacyAdvancedKey, setHandledLegacyAdvancedKey] = createSignal('');
  const [handledUnsupportedApiId, setHandledUnsupportedApiId] = createSignal('');
  const [promptManagerNoticeKey, setPromptManagerNoticeKey] = createSignal('');
  const [promptManagerSyncKey, setPromptManagerSyncKey] = createSignal('');

  let importInput: HTMLInputElement | undefined;
  let masterImportInput: HTMLInputElement | undefined;
  let saveTimer: number | undefined;
  let queuedSettings: Record<string, unknown> | null = null;
  let loadRequestVersion = 0;

  const apiId = createMemo(() => normalizePresetApiId(searchParams.apiId));
  const legacyAdvancedApiId = createMemo(() => coerceAdvancedFormattingApiId(searchParams.apiId));
  const selectedName = createMemo(() => String(searchParams.selected ?? '').trim());
  const catalog = createMemo(() => getPresetCatalogDefinition(apiId()));
  const adapter = createMemo(() => getPresetCatalogAdapter(apiId()));

  const settingsQuery = createQuery(() => ({
    queryKey: ['settings'],
    queryFn: () => coreApiClient.getSettings(),
    refetchOnWindowFocus: false,
  }));

  const presetNamesQuery = createQuery(() => ({
    queryKey: ['presets', apiId()],
    queryFn: () => coreApiClient.presets.list(apiId()),
    refetchOnWindowFocus: false,
  }));

  const presetNames = createMemo(() => presetNamesQuery.data ?? []);
  const resolvedSelection = createMemo(() => resolvePresetSelection(selectedName(), presetNames()));
  const resolvedSelectionName = createMemo(() => resolvedSelection()?.name ?? selectedName());
  const filteredNames = createMemo(() => {
    const keyword = search().trim().toLowerCase();
    if (!keyword) {
      return presetNames();
    }
    return presetNames().filter((name) => name.toLowerCase().includes(keyword));
  });
  const hasSelection = createMemo(() => Boolean(resolvedSelection()));
  const dirty = createMemo(() => stableStringify(presetDraft()) !== stableStringify(savedSnapshot()));

  const utilitySectionMap = Object.fromEntries(advancedFormattingUtilitySections.map((section) => [section.id, section])) as Record<string, PresetSectionDefinition>;
  const dialogKind = createMemo(() => {
    const dialog = dialogState();
    return dialog.open ? dialog.kind : null;
  });
  const advancedFormattingDialog = createMemo(() => {
    const dialog = dialogState();
    return dialog.open && dialog.kind === 'advancedFormatting' ? dialog : null;
  });

  const activeSection = createMemo(() => {
    const dialog = dialogState();
    if (!dialog.open || dialog.kind !== 'section') {
      return null;
    }
    return getPresetSectionDefinition(apiId(), dialog.section) ?? null;
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

  const promptManagerState = createMemo<PromptManagerState>(() => {
    if (apiId() !== 'openai') {
      return {
        prompts: undefined,
        prompt_order: undefined,
        inherited: false,
        migrated: false,
        migratedMap: false,
        repaired: false,
        stats: { renamed: 0, generated: 0, removedOrder: 0, addedOrder: 0 },
      };
    }
    const oaiSettings = asRecord(currentSettingsSource().oai_settings);
    const fallbackPrompts = presetDraft().prompts;
    const fallbackOrder = presetDraft().prompt_order;
    const normalization = sanitizePromptManagerPayload({
      prompts: oaiSettings.prompts ?? fallbackPrompts,
      promptOrder: oaiSettings.prompt_order ?? fallbackOrder,
      fallbackPrompts,
      fallbackOrder,
      appendMissingOrder: false,
    });
    return {
      prompts: normalization.prompts,
      prompt_order: normalization.prompt_order,
      inherited: normalization.inherited,
      migrated: normalization.migrated,
      migratedMap: normalization.migratedMap,
      repaired: normalization.repaired,
      stats: normalization.stats,
    };
  });

  const promptManagerValues = createMemo(() => ({
    prompts: promptManagerState().prompts,
    prompt_order: promptManagerState().prompt_order,
  }));

  const combinedValues = createMemo(() => {
    const base = { ...presetDraft(), ...companionDraft() };
    if (apiId() !== 'openai') {
      return base;
    }
    return { ...base, ...promptManagerValues() };
  });

  function closeDialog(): void {
    setDialogState({ open: false });
  }

  function invalidateCatalogLists(catalogIds: PresetCatalogId[]): Promise<unknown[]> {
    return Promise.all(catalogIds.map((catalogId) => queryClient.invalidateQueries({ queryKey: ['presets', catalogId] })));
  }

  function normalizeOpenAIPromptManager(draft: PresetDraft): {
    draft: PresetDraft;
    inherited: boolean;
    migrated: boolean;
    migratedMap: boolean;
    repaired: boolean;
    stats: PromptManagerSanitizeResult['stats'];
  } {
    if (apiId() !== 'openai') {
      return {
        draft,
        inherited: false,
        migrated: false,
        migratedMap: false,
        repaired: false,
        stats: { renamed: 0, generated: 0, removedOrder: 0, addedOrder: 0 },
      };
    }
    const oaiSettings = asRecord(currentSettingsSource().oai_settings);
    const normalization = sanitizePromptManagerPayload({
      prompts: draft.prompts,
      promptOrder: draft.prompt_order,
      fallbackPrompts: oaiSettings.prompts,
      fallbackOrder: oaiSettings.prompt_order,
      appendMissingOrder: false,
    });
    return {
      draft: { ...draft, prompts: normalization.prompts, prompt_order: normalization.prompt_order },
      inherited: normalization.inherited,
      migrated: normalization.migrated,
      migratedMap: normalization.migratedMap,
      repaired: normalization.repaired,
      stats: normalization.stats,
    };
  }

  function notifyPromptManagerNormalization(result: {
    inherited: boolean;
    migrated: boolean;
    migratedMap: boolean;
    repaired: boolean;
    stats: PromptManagerSanitizeResult['stats'];
  }): void {
    if (!result.inherited && !result.migrated && !result.migratedMap && !result.repaired) {
      return;
    }
    const noticeKey = `${apiId()}::${resolvedSelectionName()}::${stableStringify({
      inherited: result.inherited,
      migrated: result.migrated,
      migratedMap: result.migratedMap,
      repaired: result.repaired,
      stats: result.stats,
    })}`;
    if (promptManagerNoticeKey() === noticeKey) {
      return;
    }
    setPromptManagerNoticeKey(noticeKey);
    if (result.inherited) {
      toast.push({ title: PRESET_COPY.promptManagerInherited, tone: 'default' });
    }
    if (result.migratedMap) {
      toast.push({ title: PRESET_COPY.promptManagerMigratedMap, tone: 'default' });
    } else if (result.migrated) {
      toast.push({ title: PRESET_COPY.promptManagerMigrated, tone: 'default' });
    }
    const repairCount = result.stats.renamed + result.stats.generated + result.stats.addedOrder + result.stats.removedOrder;
    if (result.repaired && repairCount > 0) {
      const detail = PRESET_COPY.promptManagerAutoRepairedDetail
        .replace('{renamed}', String(result.stats.renamed + result.stats.generated))
        .replace('{addedOrder}', String(result.stats.addedOrder))
        .replace('{removedOrder}', String(result.stats.removedOrder));
      toast.push({ title: PRESET_COPY.promptManagerAutoRepaired, description: detail, tone: 'default' });
    }
  }

  function buildSettingsPayload(
    nextPreset = presetDraft(),
    nextCompanion = companionDraft(),
    activeName = resolvedSelectionName(),
  ): Record<string, unknown> {
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
      navigate(buildPresetHref(target.apiId));
      return;
    }
    if (target.kind === 'preset') {
      navigate(buildPresetHref(apiId(), target.name));
      return;
    }
    if (target.kind === 'leave') {
      const retry = leaveRetry();
      setLeaveRetry(null);
      retry?.();
    }
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

  function updatePromptManager(nextPrompts: unknown, nextPromptOrder: unknown): void {
    const nextPreset = { ...presetDraft(), prompts: nextPrompts, prompt_order: nextPromptOrder };
    setPresetDraft(nextPreset);
    scheduleSettingsSave(buildSettingsPayload(nextPreset, companionDraft()));
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
      const targetName = resolvedSelectionName();
      const draftToSave = deepClone(presetDraft());
      const response = await coreApiClient.presets.save(apiId(), targetName, adapter().serializePreset(draftToSave));
      setSavedSnapshot(deepClone(draftToSave));
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      if (response.name !== selectedName()) {
        navigate(buildPresetHref(apiId(), response.name), { replace: true });
      }
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
      const draft = adapter().createDefaultDraft();
      const response = await coreApiClient.presets.save(apiId(), name, adapter().serializePreset(draft));
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      toast.push({ title: PRESET_COPY.createSucceeded, tone: 'success' });
      closeDialog();
      navigate(buildPresetHref(apiId(), response.name), { replace: true });
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
      const draft = deepClone(presetDraft());
      const response = await coreApiClient.presets.save(apiId(), name, adapter().serializePreset(draft));
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      toast.push({ title: PRESET_COPY.saveAsSucceeded, tone: 'success' });
      closeDialog();
      navigate(buildPresetHref(apiId(), response.name));
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
      const targetName = resolvedSelectionName();
      const draft = deepClone(presetDraft());
      const response = await coreApiClient.presets.save(apiId(), name, adapter().serializePreset(draft));
      await coreApiClient.presets.delete(apiId(), targetName);
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      toast.push({ title: PRESET_COPY.renameSucceeded, tone: 'success' });
      closeDialog();
      navigate(buildPresetHref(apiId(), response.name), { replace: true });
    } catch (error) {
      toast.push({ title: PRESET_COPY.rename, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function restoreCurrentPreset(): Promise<void> {
    if (!hasSelection() || !catalog().supportsRestore) {
      return;
    }
    try {
      const targetName = resolvedSelectionName();
      const restored = await coreApiClient.presets.restore(apiId(), targetName);
      if (!restored.isDefault || Object.keys(restored.preset ?? {}).length === 0) {
        toast.push({ title: PRESET_COPY.restore, description: PRESET_COPY.loadFailed, tone: 'danger' });
        return;
      }
      const normalized = adapter().normalizeRestoredPreset(restored.preset);
      if (adapter().definition.kind === 'advanced-formatting') {
        normalized.name = targetName;
      }
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
    const targetName = resolvedSelectionName();
    if (!window.confirm(`${PRESET_COPY.deleteConfirm}\n${targetName}`)) {
      return;
    }
    try {
      await coreApiClient.presets.delete(apiId(), targetName);
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      const nextNames = await coreApiClient.presets.list(apiId());
      toast.push({ title: PRESET_COPY.deleteSucceeded, tone: 'success' });
      navigate(buildPresetHref(apiId(), nextNames[0]), { replace: true });
    } catch (error) {
      toast.push({ title: PRESET_COPY.delete, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function exportCurrentPreset(): Promise<void> {
    if (!hasSelection()) {
      return;
    }
    try {
      const targetName = resolvedSelectionName();
      let payload = adapter().serializePreset(presetDraft());
      if (apiId() === 'openai') {
        const hasSensitive = Object.keys(payload).some((key) => isOpenAISensitiveFieldKey(key));
        if (hasSensitive && !window.confirm(PRESET_COPY.exportSensitiveOpenAI)) {
          payload = stripOpenAISensitiveFields(payload);
        }
      }
      void saveJsonExport(payload, `${targetName}.json`);
      toast.push({ title: PRESET_COPY.exportSucceeded, tone: 'success' });
    } catch (error) {
      toast.push({ title: PRESET_COPY.export, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function importPresetFile(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      let payload = parsed;
      if (apiId() === 'openai') {
        const hasSensitive = Object.keys(parsed).some((key) => isOpenAISensitiveFieldKey(key));
        if (hasSensitive && !window.confirm(PRESET_COPY.importSensitiveOpenAI)) {
          payload = stripOpenAISensitiveFields(parsed);
        }
      }
      let normalized = adapter().normalizeRestoredPreset(payload);
      const promptNormalization = normalizeOpenAIPromptManager(normalized);
      normalized = promptNormalization.draft;
      const name = fileStem(file.name) || `${catalog().label} Imported`;
      const response = await coreApiClient.presets.save(apiId(), name, adapter().serializePreset(normalized));
      await commitSettings(buildSettingsPayload(normalized, companionDraft(), response.name));
      await queryClient.invalidateQueries({ queryKey: ['presets', apiId()] });
      toast.push({ title: PRESET_COPY.importSucceeded, tone: 'success' });
      notifyPromptManagerNormalization(promptNormalization);
      navigate(buildPresetHref(apiId(), response.name), { replace: true });
    } catch (error) {
      toast.push({ title: PRESET_COPY.import, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  async function loadSelectedPreset(): Promise<void> {
    if (!hasSelection()) {
      return;
    }

    const requestId = ++loadRequestVersion;
    setSelectionLoading(true);
    try {
      const resolved = resolvedSelection();
      if (resolved?.normalizedFrom && resolved.name !== selectedName()) {
        toast.push({ title: `预设名称已校正为 ${resolved.name}`, tone: 'warning' });
        navigate(buildPresetHref(apiId(), resolved.name), { replace: true });
        return;
      }
      const targetName = resolved?.name ?? selectedName();
      const restored = await coreApiClient.presets.get(apiId(), targetName);
      if (!restored) {
        throw new Error('preset_not_found');
      }
      if (requestId !== loadRequestVersion) {
        return;
      }
      let normalized = adapter().normalizeRestoredPreset(restored);
      const promptNormalization = normalizeOpenAIPromptManager(normalized);
      normalized = promptNormalization.draft;
      if (adapter().definition.kind === 'advanced-formatting') {
        normalized.name = targetName;
      }
      const companion = adapter().readWorkspaceCompanion(currentSettingsSource());
      const nextSettings = adapter().writeActiveName(
        adapter().writeWorkspaceCompanion(adapter().applyPresetDraftToSettings(currentSettingsSource(), normalized), companion),
        targetName,
      );
      await commitSettings(nextSettings);
      if (requestId !== loadRequestVersion) {
        return;
      }
      setPresetDraft(normalized);
      setSavedSnapshot(deepClone(normalized));
      setCompanionDraft(companion);
      notifyPromptManagerNormalization(promptNormalization);
      setLoadedSelectionKey(`${apiId()}::${targetName}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        const resolved = resolvePresetSelection(selectedName(), presetNames());
        if (resolved?.name && resolved.name !== selectedName()) {
          toast.push({ title: `预设名称已校正为 ${resolved.name}`, tone: 'warning' });
          navigate(buildPresetHref(apiId(), resolved.name), { replace: true });
          return;
        }
      }
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
      const selection = Object.fromEntries((Object.keys(defaults) as MasterSectionId[]).map((sectionId) => [sectionId, detection.sections.includes(sectionId) && defaults[sectionId]])) as Record<MasterSectionId, boolean>;
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
    const selectedSections = (Object.keys(masterSelection()) as MasterSectionId[]).filter((sectionId) => masterSelection()[sectionId] && availableSections.includes(sectionId));
    if (selectedSections.length === 0) {
      toast.push({ title: PRESET_COPY.noMasterSelection, tone: 'danger' });
      return;
    }

    try {
      let nextSettings = deepClone(currentSettingsSource());
      const touchedCatalogs = new Set<PresetCatalogId>();
      let navigateName = '';
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

        const catalogId = MASTER_SECTION_TO_CATALOG[sectionId];
        const catalogAdapter = getPresetCatalogAdapter(catalogId);
        let normalized = catalogAdapter.normalizeRestoredPreset(payload);
        const name = typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : fileStem(detection.fileName) || `${catalogId}-imported`;
        if (catalogId === 'instruct') {
          normalized = await migrateLegacyInstructSystemPrompt(name, normalized);
        }
        if (catalogAdapter.definition.kind === 'advanced-formatting') {
          normalized.name = name;
        }
        await coreApiClient.presets.save(catalogId, name, catalogAdapter.serializePreset(normalized));
        touchedCatalogs.add(catalogId);
        if (catalogId === apiId()) {
          navigateName = name;
        }
      }
      await commitSettings(nextSettings);
      await invalidateCatalogLists([...touchedCatalogs]);
      closeDialog();
      toast.push({ title: PRESET_COPY.masterImportSucceeded, tone: 'success' });
      if (navigateName) {
        navigate(buildPresetHref(apiId(), navigateName), { replace: true });
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
        const catalogId = MASTER_SECTION_TO_CATALOG[sectionId];
        if (catalogId === apiId() && hasSelection()) {
          snapshot[sectionId] = adapter().serializePreset({ ...presetDraft(), ...(adapter().definition.kind === 'advanced-formatting' ? { name: selectedName() } : {}) });
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
      closeDialog();
    } catch (error) {
      toast.push({ title: PRESET_COPY.masterExport, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  useBeforeLeave((event) => {
    if (!dirty() || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    setPendingNavigation({ kind: 'leave' });
    setLeaveRetry(() => () => event.retry(true));
    setDirtyGuardOpen(true);
  });

  createEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty()) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    onCleanup(() => window.removeEventListener('beforeunload', handler));
  });

  createEffect(() => {
    if (settingsQuery.data && !settingsInitialized()) {
      setSettingsDraft(deepClone(asRecord(settingsQuery.data)));
      setSettingsInitialized(true);
    }
  });

  createEffect(() => {
    const advancedApiId = legacyAdvancedApiId();
    if (!advancedApiId) {
      setHandledLegacyAdvancedKey('');
      return;
    }

    const nextKey = `${advancedApiId}::${selectedName()}`;
    if (handledLegacyAdvancedKey() === nextKey) {
      return;
    }

    setHandledLegacyAdvancedKey(nextKey);
    setDialogState({ open: true, kind: 'advancedFormatting', apiId: advancedApiId, selectedName: selectedName() || undefined });
    navigate(buildPresetHref('openai'), { replace: true });
  });

  createEffect(() => {
    if (legacyAdvancedApiId()) {
      return;
    }
    const rawApiId = String(searchParams.apiId ?? '').trim().toLowerCase();
    if (rawApiId && rawApiId !== 'openai' && handledUnsupportedApiId() !== rawApiId) {
      setHandledUnsupportedApiId(rawApiId);
      toast.push({ title: PRESET_COPY.unsupportedCompletion, tone: 'default' });
    }
    if ((searchParams.apiId ?? '') !== apiId()) {
      navigate(buildPresetHref(apiId(), selectedName() || undefined), { replace: true });
    }
  });

  createEffect(() => {
    if (presetNamesQuery.isPending) {
      return;
    }
    if (presetNames().length === 0) {
      if (selectedName()) {
        navigate(buildPresetHref(apiId()), { replace: true });
      }
      return;
    }
    if (!hasSelection() && props.layout !== 'mobile') {
      navigate(buildPresetHref(apiId(), presetNames()[0]), { replace: true });
    }
  });

  createEffect(() => {
    if (presetNamesQuery.isPending) {
      return;
    }
    const resolved = resolvedSelection();
    if (!resolved || !resolved.normalizedFrom || resolved.name === selectedName()) {
      return;
    }
    toast.push({ title: `预设名称已校正为 ${resolved.name}`, tone: 'warning' });
    navigate(buildPresetHref(apiId(), resolved.name), { replace: true });
  });

  createEffect(() => {
    if (presetNamesQuery.isPending) {
      return;
    }
    if (!hasSelection() || !settingsInitialized()) {
      return;
    }
    const key = `${apiId()}::${resolvedSelectionName()}`;
    if (loadedSelectionKey() === key) {
      return;
    }
    void loadSelectedPreset();
  });

  createEffect(() => {
    if (apiId() !== 'openai' || !settingsInitialized()) {
      return;
    }
    const state = promptManagerState();
    if (!state.inherited && !state.migrated && !state.migratedMap && !state.repaired) {
      return;
    }
    const oaiSettings = asRecord(currentSettingsSource().oai_settings);
    const currentKey = stableStringify({
      prompts: oaiSettings.prompts,
      prompt_order: oaiSettings.prompt_order,
    });
    const nextKey = stableStringify({
      prompts: state.prompts,
      prompt_order: state.prompt_order,
    });
    const syncKey = `${apiId()}::${resolvedSelectionName()}::${nextKey}`;
    if (currentKey === nextKey || promptManagerSyncKey() === syncKey) {
      return;
    }
    const presetKey = stableStringify({
      prompts: presetDraft().prompts,
      prompt_order: presetDraft().prompt_order,
    });
    if (presetKey === nextKey) {
      setPromptManagerSyncKey(syncKey);
      return;
    }
    const nextPreset = { ...presetDraft(), prompts: state.prompts, prompt_order: state.prompt_order };
    setPresetDraft(nextPreset);
    scheduleSettingsSave(buildSettingsPayload(nextPreset, companionDraft()));
    setPromptManagerSyncKey(syncKey);
    notifyPromptManagerNormalization(state);
  });

  createEffect((previousApiId?: PresetCatalogId) => {
    const currentApiId = apiId();
    if (previousApiId && previousApiId !== currentApiId) {
      setLoadedSelectionKey('');
      setSearch('');
    }
    return currentApiId;
  });

  function sectionTitle(section: PresetSectionDefinition | null): string {
    if (!section) {
      return '';
    }
    return section.label && !section.label.includes('?') ? section.label : humanizeId(section.id);
  }

  const masterSectionOptions = (Object.keys(MASTER_SECTION_LABELS) as MasterSectionId[]).map((sectionId) => ({ id: sectionId, label: MASTER_SECTION_LABELS[sectionId] }));
  const isMobile = () => props.layout === 'mobile';

  const paneContent = (
    <PresetPane
      title={PRESET_COPY.title}
      subtitle={PRESET_COPY.subtitle}
      railTitle={PRESET_COPY.completionEngines}
      railMetaLabel={PRESET_COPY.completionFormatLabel}
      definitions={completionPresetCatalogDefinitions}
      activeCatalog={catalog()}
      activeId={apiId()}
      search={search()}
      names={filteredNames()}
      selectedName={selectedName()}
      actions={
        <div class={isMobile() ? "flex flex-col gap-2 mt-2" : "flex flex-wrap gap-2"}>
          <Button variant="secondary" onClick={() => importInput?.click()}>{PRESET_COPY.import}</Button>
          <Button variant="ghost" onClick={() => setDialogState({ open: true, kind: 'advancedFormatting' })}>{PRESET_COPY.openAdvancedFormatting}</Button>
        </div>
      }
      onSearchChange={setSearch}
      onCatalogChange={(nextApiId) => queueNavigation({ kind: 'catalog', apiId: nextApiId })}
      onSelect={(name) => queueNavigation({ kind: 'preset', name })}
    />
  );

  const workspaceContent = (
    <Show when={settingsQuery.data && !selectionLoading()} fallback={<LoadingBlock />}>
      <PresetWorkspace
        catalog={catalog()}
        selectedName={selectedName()}
        hasSelection={hasSelection()}
        loading={selectionLoading()}
        dirty={dirty()}
        saveState={saveState()}
        values={combinedValues()}
        bindPresetToConnection={Boolean(companionDraft().bind_preset_to_connection ?? combinedValues().bind_preset_to_connection)}
        onToggleConnectionBinding={(value) => setFieldValue('bind_preset_to_connection', value)}
        onUpdateCurrent={() => void updateCurrentPreset()}
        onSaveAs={() => setDialogState({ open: true, kind: 'saveAs' })}
        onRename={() => setDialogState({ open: true, kind: 'rename' })}
        onRestore={() => void restoreCurrentPreset()}
        onExport={() => void exportCurrentPreset()}
        onDelete={() => void deleteCurrentPreset()}
        onCreate={() => setDialogState({ open: true, kind: 'create' })}
        onOpenSection={(sectionId) => {
          const section = getPresetSectionDefinition(apiId(), sectionId);
          if (section?.editor === 'prompt-manager') {
            setDialogState({ open: true, kind: 'promptManager' });
            return;
          }
          setDialogState({ open: true, kind: 'section', section: sectionId });
        }}
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
  );

  return (
    <div class={isMobile() ? "flex h-full flex-col bg-slate-50 relative z-10" : "flex h-full min-h-0 gap-4 overflow-hidden"}>
      <Show when={!isMobile()} fallback={
        <Show when={!hasSelection()} fallback={
          <div class="flex h-full flex-col bg-slate-50">
            <header class="flex h-12 shrink-0 items-center justify-between border-b bg-white px-2">
              <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full active:bg-slate-100" aria-label="Back" onClick={() => navigate(buildPresetHref(apiId()))}>
                <ChevronLeft size={24} />
              </button>
              <div class="flex-1 truncate text-center font-semibold tracking-tight text-slate-800">{resolvedSelectionName()}</div>
              <div class="w-10"></div>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto bg-white p-4">
              {workspaceContent}
            </div>
          </div>
        }>
          <div class="flex h-full flex-col bg-white">
            <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div class="flex items-center justify-between mb-2">
                <h1 class="text-2xl font-bold">{PRESET_COPY.title}</h1>
              </div>
              {paneContent}
            </div>
          </div>
        </Show>
      }>
        <DesktopContextPane
          floatingActionLabel={hasSelection() ? PRESET_COPY.saveAs : PRESET_COPY.createNew}
          onFloatingAction={() => setDialogState({ open: true, kind: hasSelection() ? 'saveAs' : 'create' })}
        >
          {paneContent}
          <input
            ref={importInput}
            type="file"
            class="hidden"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void importPresetFile(file);
              }
              event.currentTarget.value = '';
            }}
          />
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
        </DesktopContextPane>
        <DesktopWorkspaceBoard>
          {workspaceContent}
        </DesktopWorkspaceBoard>
      </Show>

      <PresetSectionEditorModal
        open={Boolean(activeSection())}
        title={sectionTitle(activeSection())}
        section={activeSection() ?? catalog().sections[0]}
        values={combinedValues()}
        onClose={closeDialog}
        onFieldChange={setFieldValue}
      />

      <OpenAIPromptManagerModal
        open={dialogKind() === 'promptManager'}
        prompts={promptManagerValues().prompts}
        promptOrder={promptManagerValues().prompt_order}
        onClose={closeDialog}
        onChange={(nextPrompts, nextPromptOrder) => updatePromptManager(nextPrompts, nextPromptOrder)}
      />

      <PresetSectionEditorModal
        open={Boolean(activeUtilitySection())}
        title={sectionTitle(activeUtilitySection())}
        section={activeUtilitySection() ?? advancedFormattingUtilitySections[0]}
        values={combinedValues()}
        onClose={closeDialog}
        onFieldChange={setFieldValue}
      />

      <PresetNameModal
        open={dialogKind() === 'create'}
        title={formatCreateTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.createConfirm}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeDialog}
        onConfirm={(name) => void createNamedPreset(name)}
      />

      <PresetNameModal
        open={dialogKind() === 'saveAs'}
        title={formatSaveAsTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.saveAsConfirm}
        initialValue={selectedName()}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeDialog}
        onConfirm={(name) => void saveAsNamedPreset(name)}
      />

      <PresetNameModal
        open={dialogKind() === 'rename'}
        title={formatRenameTitle(catalog().noun)}
        confirmLabel={PRESET_COPY.renameConfirm}
        initialValue={selectedName()}
        label={PRESET_COPY.createNameLabel}
        placeholder={PRESET_COPY.createNamePlaceholder}
        onClose={closeDialog}
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
        onClose={closeDialog}
        onConfirm={() => void executeMasterImport()}
      />

      <PresetMasterTransferModal
        open={dialogKind() === 'masterExport'}
        title={PRESET_COPY.masterExport}
        confirmLabel={PRESET_COPY.export}
        sections={masterSectionOptions}
        selected={masterSelection()}
        onToggle={(sectionId, checked) => setMasterSelection((current) => ({ ...current, [sectionId]: checked }))}
        onClose={closeDialog}
        onConfirm={() => void executeMasterExport()}
      />

      <WorkbenchModal
        open={dialogKind() === 'bindModelTemplates'}
        onClose={closeDialog}
        title={PRESET_COPY.bindModelTemplates}
        size="md"
        footer={
          <div class="flex justify-end gap-3">
            <Button variant="ghost" onClick={closeDialog}>{PRESET_COPY.cancel}</Button>
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

      <AdvancedFormattingHubModal
        open={Boolean(advancedFormattingDialog())}
        initialApiId={advancedFormattingDialog()?.apiId}
        initialSelectedName={advancedFormattingDialog()?.selectedName}
        onClose={closeDialog}
      />

      <PresetDirtyGuardModal
        open={dirtyGuardOpen()}
        onCancel={() => {
          setDirtyGuardOpen(false);
          setPendingNavigation(null);
          setLeaveRetry(null);
        }}
        onDiscard={() => void handleDiscardAndContinue()}
        onSave={() => void handleSaveAndContinue()}
      />
    </div>
  );
}
