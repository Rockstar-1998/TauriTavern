import { createEffect, createMemo, createSignal, For, Show, type JSX } from 'solid-js';

import { useToasts } from '@/app/providers';
import { saveJsonExport } from '@/lib/api/export';
import { getErrorMessage } from '@/lib/api/http';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Card, Field, Input, Tag, TextArea } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';
import {
  applyActivePromptOrder,
  exportPromptBundle,
  getActivePromptOrderEntries,
  getDefaultPromptManagerPayload,
  getSystemPromptDefaults,
  isPromptDeletionAllowed,
  isPromptEditAllowed,
  isPromptToggleAllowed,
  mergePromptImport,
  reorderPromptOrderEntries,
  repairPromptManagerPayload,
  validatePromptManagerPayload,
  type PromptEntry,
  type PromptOrderEntry,
  type PromptOrderList,
} from '../openai-prompt-manager';
import { deepClone } from '../utils';

const PROMPT_DISPLAY_NAMES: Record<string, string> = {
  main: '主提示词',
  nsfw: '辅助提示词',
  jailbreak: '后置指令',
  enhanceDefinitions: '增强定义',
  dialogueExamples: '对话示例',
  chatHistory: '聊天历史',
  worldInfoBefore: '世界书（前）',
  worldInfoAfter: '世界书（后）',
  charDescription: '角色描述',
  charPersonality: '角色性格',
  scenario: '场景',
  personaDescription: '人设描述',
};

const PROMPT_ISSUE_LABELS: Record<string, string> = {
  missing_prompts: PRESET_COPY.promptManagerIssueMissingPrompts,
  missing_order: PRESET_COPY.promptManagerIssueMissingOrder,
  missing_active_order: PRESET_COPY.promptManagerIssueMissingActiveOrder,
  invalid_prompt: PRESET_COPY.promptManagerIssueInvalidPrompt,
  duplicate_prompt: PRESET_COPY.promptManagerIssueDuplicatePrompt,
  invalid_order_entry: PRESET_COPY.promptManagerIssueInvalidOrderEntry,
  order_missing_prompt: PRESET_COPY.promptManagerIssueOrderMissingPrompt,
  prompt_missing_order: PRESET_COPY.promptManagerIssuePromptMissingOrder,
  invalid_import: PRESET_COPY.promptManagerImportFailed,
};

const SYSTEM_PROMPT_SEQUENCE = ['main', 'nsfw', 'jailbreak', 'enhanceDefinitions'];

function getDisplayName(prompt: PromptEntry): string {
  return PROMPT_DISPLAY_NAMES[prompt.identifier] ?? prompt.name ?? prompt.identifier;
}

function clonePrompt(prompt: PromptEntry): PromptEntry {
  return deepClone(prompt);
}

function createNewPrompt(): PromptEntry {
  const identifier = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `prompt_${Date.now()}`;
  return {
    identifier,
    name: '',
    role: 'system',
    content: '',
    system_prompt: false,
    marker: false,
    injection_trigger: [],
  };
}

export function OpenAIPromptManagerModal(props: {
  open: boolean;
  prompts: unknown;
  promptOrder: unknown;
  onClose: () => void;
  onChange: (prompts: PromptEntry[], promptOrder: PromptOrderList[]) => void;
}): JSX.Element {
  const toast = useToasts();

  const [draft, setDraft] = createSignal<PromptEntry | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);

  let importInput: HTMLInputElement | undefined;

  const prompts = createMemo(() => (Array.isArray(props.prompts) ? (props.prompts as PromptEntry[]) : []));
  const promptOrderLists = createMemo(() => (Array.isArray(props.promptOrder) ? (props.promptOrder as PromptOrderList[]) : []));
  const validation = createMemo(() => validatePromptManagerPayload(props.prompts, props.promptOrder));
  const orderEntries = createMemo(() => getActivePromptOrderEntries(props.promptOrder));
  const promptMap = createMemo(() => new Map(prompts().map((prompt) => [prompt.identifier, prompt])));
  const isNewDraft = createMemo(() => {
    const current = draft();
    if (!current) {
      return false;
    }
    return !prompts().some((item) => item.identifier === current.identifier);
  });
  const orderedPrompts = createMemo(() => orderEntries().map((entry) => ({
    entry,
    prompt: promptMap().get(entry.identifier),
  })).filter((item) => item.prompt));

  createEffect(() => {
    if (!props.open) {
      setDraft(null);
      setDraggingId(null);
    }
  });

  function updatePromptData(nextPrompts: PromptEntry[], nextOrderEntries = orderEntries()): void {
    const nextOrders = applyActivePromptOrder(promptOrderLists(), nextOrderEntries);
    props.onChange(nextPrompts, nextOrders);
  }

  function handleTogglePrompt(entry: PromptOrderEntry, enabled: boolean): void {
    const nextOrder = orderEntries().map((item) => (item.identifier === entry.identifier ? { ...item, enabled } : item));
    updatePromptData(prompts(), nextOrder);
  }

  function handleDeletePrompt(prompt: PromptEntry): void {
    if (!window.confirm(PRESET_COPY.promptManagerDeleteConfirm)) {
      return;
    }
    const nextPrompts = prompts().filter((item) => item.identifier !== prompt.identifier);
    const nextOrder = orderEntries().filter((item) => item.identifier !== prompt.identifier);
    updatePromptData(nextPrompts, nextOrder);
  }

  function startEdit(prompt: PromptEntry): void {
    setDraft(clonePrompt(prompt));
  }

  function startCreate(): void {
    const next = createNewPrompt();
    setDraft(next);
  }

  function cancelEdit(): void {
    setDraft(null);
  }

  function commitEdit(): void {
    const nextDraft = draft();
    if (!nextDraft) {
      return;
    }
    if (!nextDraft.identifier.trim()) {
      toast.push({ title: PRESET_COPY.promptManagerInvalid, description: PRESET_COPY.promptManagerIssueInvalidPrompt, tone: 'danger' });
      return;
    }
    const existing = prompts().some((item) => item.identifier === nextDraft.identifier);
    const nextPrompts = existing
      ? prompts().map((item) => (item.identifier === nextDraft.identifier ? clonePrompt(nextDraft) : item))
      : [...prompts(), clonePrompt(nextDraft)];
    const nextOrder = existing
      ? orderEntries()
      : [...orderEntries(), { identifier: nextDraft.identifier, enabled: true }];
    updatePromptData(nextPrompts, nextOrder);
    cancelEdit();
  }

  function handleDragStart(identifier: string, event: DragEvent): void {
    setDraggingId(identifier);
    event.dataTransfer?.setData('text/plain', identifier);
    event.dataTransfer?.setDragImage(new Image(), 0, 0);
  }

  function handleDrop(targetId: string, event: DragEvent): void {
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData('text/plain') || draggingId();
    if (!sourceId) {
      return;
    }
    const nextOrder = reorderPromptOrderEntries(orderEntries(), sourceId, targetId);
    updatePromptData(prompts(), nextOrder);
    setDraggingId(null);
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = mergePromptImport(prompts(), promptOrderLists(), parsed);
      if (!result.ok) {
        toast.push({ title: PRESET_COPY.promptManagerImportFailed, tone: 'danger' });
        return;
      }
      props.onChange(result.prompts, result.prompt_order);
      toast.push({ title: PRESET_COPY.importSucceeded, tone: 'success' });
    } catch (error) {
      toast.push({ title: PRESET_COPY.promptManagerImportFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function handleExport(): void {
    try {
      const payload = exportPromptBundle(prompts(), promptOrderLists());
      const exportDate = new Date().toISOString().slice(0, 10);
      void saveJsonExport(payload, `ST-prompts-${exportDate}.json`);
      toast.push({ title: PRESET_COPY.exportSucceeded, tone: 'success' });
    } catch (error) {
      toast.push({ title: PRESET_COPY.promptManagerExportFailed, description: getErrorMessage(error), tone: 'danger' });
    }
  }

  function handleRepair(): void {
    const repaired = repairPromptManagerPayload(props.prompts, props.promptOrder);
    props.onChange(repaired.prompts, repaired.prompt_order);
    const identifierFixes = repaired.stats.generated + repaired.stats.renamed;
    const detail = PRESET_COPY.promptManagerRepairedDetail
      .replace('{renamed}', String(identifierFixes))
      .replace('{addedOrder}', String(repaired.stats.addedOrder))
      .replace('{removedOrder}', String(repaired.stats.removedOrder));
    toast.push({ title: PRESET_COPY.promptManagerRepaired, description: detail, tone: 'success' });
  }

  function handleReset(): void {
    const defaults = getDefaultPromptManagerPayload();
    props.onChange(defaults.prompts, defaults.prompt_order);
    toast.push({ title: PRESET_COPY.promptManagerResetDone, tone: 'success' });
  }

  function handleQuickEdit(identifier: string, content: string): void {
    const nextPrompts = prompts().map((item) => (item.identifier === identifier ? { ...item, content } : item));
    updatePromptData(nextPrompts, orderEntries());
  }

  const systemDefaults = createMemo(() => getSystemPromptDefaults());

  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title={PRESET_COPY.promptManager} size="xl">
      <Show
        when={validation().valid}
        fallback={(
          <div class="space-y-4">
            <Card title={PRESET_COPY.promptManagerInvalid} subtitle={PRESET_COPY.promptManagerInvalidBody}>
              <ul class="list-disc space-y-2 pl-5 text-sm text-rose-600">
                <For each={validation().issues}>
                  {(issue) => <li>{PROMPT_ISSUE_LABELS[issue] ?? issue}</li>}
                </For>
              </ul>
              <div class="mt-4 flex flex-wrap gap-3">
                <Button onClick={handleRepair} variant="secondary">{PRESET_COPY.promptManagerRepair}</Button>
                <Button onClick={handleReset}>{PRESET_COPY.promptManagerReset}</Button>
              </div>
            </Card>
          </div>
        )}
      >
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)]">
          <div class="space-y-4">
            <Card title={PRESET_COPY.promptManager} subtitle={PRESET_COPY.promptManagerDescription}>
              <div class="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => importInput?.click()}>{PRESET_COPY.promptManagerImport}</Button>
                <Button variant="secondary" onClick={handleExport}>{PRESET_COPY.promptManagerExport}</Button>
                <Button onClick={startCreate}>{PRESET_COPY.promptManagerNew}</Button>
              </div>
              <div class="mt-4 space-y-3">
                <For each={orderedPrompts()}>
                  {(item) => {
                    const prompt = item.prompt as PromptEntry;
                    const entry = item.entry;
                    const enabled = entry.enabled;
                    const toggleAllowed = isPromptToggleAllowed(prompt);
                    const editAllowed = isPromptEditAllowed(prompt);
                    const deleteAllowed = isPromptDeletionAllowed(prompt);
                    return (
                      <div
                        class={`tt-muted-surface rounded-[1.2rem] px-4 py-3 transition ${draggingId() === entry.identifier ? 'opacity-60' : ''}`.trim()}
                        draggable
                        onDragStart={(event) => handleDragStart(entry.identifier, event)}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(entry.identifier, event)}
                      >
                        <div class="flex flex-wrap items-center justify-between gap-3">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <div class="truncate text-sm font-semibold text-slate-900">{getDisplayName(prompt)}</div>
                              {prompt.system_prompt ? <Tag tone="success">{PRESET_COPY.promptManagerTagSystem}</Tag> : null}
                              {prompt.marker ? <Tag>{PRESET_COPY.promptManagerTagMarker}</Tag> : null}
                            </div>
                            <div class="mt-1 text-xs text-slate-500">{prompt.identifier}</div>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <label class="flex items-center gap-2 text-xs text-slate-600">
                              <span>{enabled ? PRESET_COPY.promptManagerEnabled : PRESET_COPY.promptManagerDisabled}</span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={!toggleAllowed}
                                onInput={(event) => handleTogglePrompt(entry, event.currentTarget.checked)}
                              />
                            </label>
                            <Button variant="ghost" disabled={!editAllowed} onClick={() => startEdit(prompt)}>{PRESET_COPY.promptManagerEdit}</Button>
                            <Button variant="ghost" disabled={!deleteAllowed} onClick={() => handleDeletePrompt(prompt)}>{PRESET_COPY.promptManagerDelete}</Button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Card>
          </div>

          <div class="space-y-4">
            <Card title={PRESET_COPY.promptManagerQuickEdit}>
              <div class="space-y-4">
                <For each={SYSTEM_PROMPT_SEQUENCE}>
                  {(identifier) => {
                    const prompt = promptMap().get(identifier);
                    const label = PROMPT_DISPLAY_NAMES[identifier] ?? identifier;
                    const defaultContent = systemDefaults()[identifier] ?? '';
                    return (
                      <Field label={label}>
                        <div class="space-y-2">
                          <TextArea
                            value={String(prompt?.content ?? '')}
                            rows={4}
                            onInput={(event) => handleQuickEdit(identifier, event.currentTarget.value)}
                          />
                          <div class="flex justify-end">
                            <Button variant="ghost" onClick={() => handleQuickEdit(identifier, defaultContent)}>{PRESET_COPY.promptManagerRestoreDefault}</Button>
                          </div>
                        </div>
                      </Field>
                    );
                  }}
                </For>
              </div>
            </Card>

            <Card title={PRESET_COPY.promptManagerEdit}>
              <Show
                when={draft()}
                fallback={<div class="text-sm text-slate-500">{PRESET_COPY.promptManagerEditHint}</div>}
              >
                {(draftPrompt) => (
                  <div class="space-y-4">
                    <Field label={PRESET_COPY.promptManagerFieldIdentifier}>
                      <Input value={draftPrompt().identifier} disabled />
                    </Field>
                    <Field label={PRESET_COPY.promptManagerFieldName}>
                      <Input
                        value={draftPrompt().name ?? ''}
                        onInput={(event) => setDraft((current) => current ? { ...current, name: event.currentTarget.value } : current)}
                      />
                    </Field>
                    <Field label={PRESET_COPY.promptManagerFieldRole}>
                      <Input
                        value={draftPrompt().role ?? ''}
                        onInput={(event) => setDraft((current) => current ? { ...current, role: event.currentTarget.value } : current)}
                      />
                    </Field>
                    <Field label={PRESET_COPY.promptManagerFieldContent}>
                      <TextArea
                        value={draftPrompt().content ?? ''}
                        rows={6}
                        onInput={(event) => setDraft((current) => current ? { ...current, content: event.currentTarget.value } : current)}
                      />
                    </Field>
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <span>{PRESET_COPY.promptManagerFieldSystem}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(draftPrompt().system_prompt)}
                          onInput={(event) => setDraft((current) => current ? { ...current, system_prompt: event.currentTarget.checked } : current)}
                        />
                      </label>
                      <label class="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <span>{PRESET_COPY.promptManagerFieldMarker}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(draftPrompt().marker)}
                          onInput={(event) => setDraft((current) => current ? { ...current, marker: event.currentTarget.checked } : current)}
                        />
                      </label>
                    </div>
                    <Field label={PRESET_COPY.promptManagerFieldPosition}>
                      <Input
                        value={String(draftPrompt().position ?? '')}
                        onInput={(event) => setDraft((current) => current ? { ...current, position: event.currentTarget.value } : current)}
                      />
                    </Field>
                    <div class="grid gap-3 md:grid-cols-2">
                      <Field label={PRESET_COPY.promptManagerFieldInjectionPosition}>
                        <Input
                          type="number"
                          value={String(draftPrompt().injection_position ?? '')}
                          onInput={(event) => {
                            const value = event.currentTarget.value;
                            setDraft((current) => current ? { ...current, injection_position: value === '' ? undefined : Number(value) } : current);
                          }}
                        />
                      </Field>
                      <Field label={PRESET_COPY.promptManagerFieldInjectionDepth}>
                        <Input
                          type="number"
                          value={String(draftPrompt().injection_depth ?? '')}
                          onInput={(event) => {
                            const value = event.currentTarget.value;
                            setDraft((current) => current ? { ...current, injection_depth: value === '' ? undefined : Number(value) } : current);
                          }}
                        />
                      </Field>
                    </div>
                    <Field label={PRESET_COPY.promptManagerFieldInjectionOrder}>
                      <Input
                        type="number"
                        value={String(draftPrompt().injection_order ?? '')}
                        onInput={(event) => {
                          const value = event.currentTarget.value;
                          setDraft((current) => current ? { ...current, injection_order: value === '' ? undefined : Number(value) } : current);
                        }}
                      />
                    </Field>
                    <div class="grid gap-3 md:grid-cols-2">
                      <label class="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <span>{PRESET_COPY.promptManagerFieldForbidOverrides}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(draftPrompt().forbid_overrides)}
                          onInput={(event) => setDraft((current) => current ? { ...current, forbid_overrides: event.currentTarget.checked } : current)}
                        />
                      </label>
                      <label class="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                        <span>{PRESET_COPY.promptManagerFieldExtension}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(draftPrompt().extension)}
                          onInput={(event) => setDraft((current) => current ? { ...current, extension: event.currentTarget.checked } : current)}
                        />
                      </label>
                    </div>
                    <Field label={PRESET_COPY.promptManagerFieldInjectionTrigger}>
                      <TextArea
                        value={(draftPrompt().injection_trigger ?? []).join('\n')}
                        rows={4}
                        onInput={(event) => {
                          const list = event.currentTarget.value
                            .split(/\r?\n/)
                            .map((item) => item.trim())
                            .filter(Boolean);
                          setDraft((current) => current ? { ...current, injection_trigger: list } : current);
                        }}
                      />
                    </Field>
                    <div class="flex justify-end gap-3">
                      <Button variant="ghost" onClick={cancelEdit}>{PRESET_COPY.cancel}</Button>
                      <Button onClick={commitEdit}>{isNewDraft() ? PRESET_COPY.createConfirm : PRESET_COPY.saveAsConfirm}</Button>
                    </div>
                  </div>
                )}
              </Show>
            </Card>
          </div>
        </div>
      </Show>

      <input
        ref={importInput}
        type="file"
        class="hidden"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleImport(file);
          }
          event.currentTarget.value = '';
        }}
      />
    </WorkbenchModal>
  );
}
