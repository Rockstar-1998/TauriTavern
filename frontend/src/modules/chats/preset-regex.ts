import {
  getChatMessages,
  type ChatMessage,
  type ChatMessageExtra,
  type ChatPayload,
  type CompiledPresetRegexScript,
  type PresetRegexScript,
  type PresetRegexSourceKind,
  type RegexAffectTarget,
  type RegexEphemeralityMode,
} from '@/types/domain';

import { buildMessageSourceContent } from './reasoning';

const AI_RESPONSE_PLACEMENT = 2;
const SUBSTITUTE_MODE_MACRO = 1;
const SUBSTITUTE_MODE_ESCAPED = 2;

type ProjectionReason = 'default' | 'edit';

type RegexScriptCarrier = {
  kind: PresetRegexSourceKind;
  entries: unknown[];
};

export type PresetRegexRuntimeContext = {
  userName: string;
  assistantName: string;
  groupName?: string | null;
  isGroup?: boolean;
};

export type PresetRegexRuntime = {
  presetHash: string;
  scripts: CompiledPresetRegexScript[];
};

export type AssistantRegexProjection = {
  canonicalText: string;
  displayText: string;
  promptText: string;
  presetHash: string | null;
  appliedRuleIds: string[];
};

export type ResolvedPresetRegexScripts = {
  scripts: PresetRegexScript[];
  sourceKinds: PresetRegexSourceKind[];
};

export type { PresetRegexSourceKind };

const runtimeCache = new Map<string, PresetRegexRuntime | null>();

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function asStringOrNumber(value: unknown, fallback: string | number = 0): string | number {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asString(entry)).filter((entry) => entry.length > 0);
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function normalizePresetRegexScript(value: unknown, sourceKind?: PresetRegexSourceKind): PresetRegexScript | null {
  const record = asRecord(value);
  const findRegex = asString(record.findRegex);
  if (!findRegex.trim()) {
    return null;
  }

  return {
    id: asString(record.id),
    scriptName: asString(record.scriptName),
    findRegex,
    replaceString: asString(record.replaceString),
    trimStrings: asStringArray(record.trimStrings),
    placement: asNumberArray(record.placement),
    disabled: asBoolean(record.disabled),
    markdownOnly: asBoolean(record.markdownOnly),
    promptOnly: asBoolean(record.promptOnly),
    runOnEdit: asBoolean(record.runOnEdit),
    substituteRegex: asStringOrNumber(record.substituteRegex, 0),
    minDepth: asNumberOrNull(record.minDepth),
    maxDepth: asNumberOrNull(record.maxDepth),
    source_kind: sourceKind,
  };
}

function readTopLevelRegexScripts(presetDraft: Record<string, unknown> | null): unknown[] {
  const draft = asRecord(presetDraft);
  return Array.isArray(draft.regex_scripts) ? draft.regex_scripts : [];
}

function readExtrasRegexScripts(presetDraft: Record<string, unknown> | null): unknown[] {
  const draft = asRecord(presetDraft);
  const extras = asRecord(draft.__extras);
  return Array.isArray(extras.regex_scripts) ? extras.regex_scripts : [];
}

function readSPresetSettingsRegexScripts(presetDraft: Record<string, unknown> | null): unknown[] {
  const draft = asRecord(presetDraft);
  const prompts = Array.isArray(draft.prompts)
    ? draft.prompts
    : Array.isArray(asRecord(draft.__extras).prompts)
      ? (asRecord(draft.__extras).prompts as unknown[])
      : [];

  for (const promptEntry of prompts) {
    const prompt = asRecord(promptEntry);
    if (asString(prompt.identifier) !== 'SPresetSettings') {
      continue;
    }

    const content = asString(prompt.content).trim();
    if (!content) {
      continue;
    }

    try {
      const parsed = asRecord(JSON.parse(content));
      const regexes = asRecord(parsed.RegexBinding).regexes;
      if (Array.isArray(regexes)) {
        return regexes;
      }
    } catch {
      continue;
    }
  }

  return [];
}

function resolveRegexScriptCarriers(presetDraft: Record<string, unknown> | null): RegexScriptCarrier[] {
  return [
    { kind: 'top-level', entries: readTopLevelRegexScripts(presetDraft) },
    { kind: 'extras', entries: readExtrasRegexScripts(presetDraft) },
    { kind: 'spresetsettings', entries: readSPresetSettingsRegexScripts(presetDraft) },
  ];
}

function cloneNormalizedRegexScript(script: PresetRegexScript): Record<string, unknown> {
  const { source_kind, ...rest } = script;
  return {
    ...rest,
    trimStrings: [...(script.trimStrings ?? [])],
    placement: [...(script.placement ?? [])],
  };
}

function buildRegexScriptDedupKey(script: PresetRegexScript): string {
  return JSON.stringify([
    script.id,
    script.findRegex,
    script.replaceString,
    script.placement ?? [],
    Boolean(script.markdownOnly),
    Boolean(script.promptOnly),
    Boolean(script.runOnEdit),
  ]);
}

export function resolvePresetRegexScriptsDetailed(presetDraft: Record<string, unknown> | null): ResolvedPresetRegexScripts {
  const carriers = resolveRegexScriptCarriers(presetDraft).filter((carrier) => carrier.entries.length > 0);
  const seen = new Set<string>();
  const scripts: PresetRegexScript[] = [];

  carriers.forEach((carrier) => {
    carrier.entries.forEach((entry) => {
      const normalized = normalizePresetRegexScript(entry, carrier.kind);
      if (!normalized) {
        return;
      }

      const dedupeKey = buildRegexScriptDedupKey(normalized);
      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      scripts.push(normalized);
    });
  });

  return {
    scripts,
    sourceKinds: carriers.map((carrier) => carrier.kind),
  };
}

export function resolvePresetRegexScripts(presetDraft: Record<string, unknown> | null): PresetRegexScript[] {
  return resolvePresetRegexScriptsDetailed(presetDraft).scripts;
}

export function materializePresetRegexScripts(presetDraft: Record<string, unknown> | null): Record<string, unknown> {
  const draft = asRecord(presetDraft);
  const resolved = resolvePresetRegexScriptsDetailed(draft);
  if (resolved.scripts.length === 0) {
    return { ...draft };
  }

  return {
    ...draft,
    regex_scripts: resolved.scripts.map((script) => cloneNormalizedRegexScript(script)),
  };
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildPresetHash(scripts: PresetRegexScript[], context: PresetRegexRuntimeContext): string {
  const payload = JSON.stringify({
    scripts: scripts.map((script) => ({
      id: script.id,
      scriptName: script.scriptName,
      findRegex: script.findRegex,
      replaceString: script.replaceString,
      trimStrings: script.trimStrings,
      placement: script.placement,
      disabled: script.disabled,
      markdownOnly: script.markdownOnly,
      promptOnly: script.promptOnly,
      runOnEdit: script.runOnEdit,
      substituteRegex: script.substituteRegex,
      minDepth: script.minDepth,
      maxDepth: script.maxDepth,
    })),
    context: {
      userName: asString(context.userName),
      assistantName: asString(context.assistantName),
      groupName: asString(context.groupName),
      isGroup: Boolean(context.isGroup),
    },
  });
  return fnv1aHex(payload);
}

function escapeRegExpFragment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function macroMap(context: PresetRegexRuntimeContext, escapeValues = false): Record<string, string> {
  const groupName = asString(context.groupName);
  const assistantName = asString(context.assistantName);
  const userName = asString(context.userName);
  const charIfNotGroup = context.isGroup ? '' : assistantName;
  const value = (text: string) => (escapeValues ? escapeRegExpFragment(text) : text);

  return {
    user: value(userName),
    username: value(userName),
    char: value(assistantName),
    bot: value(assistantName),
    assistant: value(assistantName),
    character: value(assistantName),
    group: value(groupName),
    charifnotgroup: value(charIfNotGroup),
  };
}

function substituteMacros(source: string, context: PresetRegexRuntimeContext, escapeValues = false): string {
  if (!source) {
    return '';
  }

  const replacements = macroMap(context, escapeValues);
  let output = source.replace(/{{\s*([^}]+)\s*}}/g, (match, key) => {
    const normalized = asString(key).trim().toLowerCase();
    return normalized in replacements ? replacements[normalized] : match;
  });

  const angleReplacements: Array<[RegExp, string]> = [
    [/<user>/gi, replacements.user ?? ''],
    [/<char>/gi, replacements.char ?? ''],
    [/<bot>/gi, replacements.bot ?? ''],
    [/<group>/gi, replacements.group ?? ''],
    [/<charifnotgroup>/gi, replacements.charifnotgroup ?? ''],
  ];

  for (const [pattern, replacement] of angleReplacements) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

function parseRegexExpression(expression: string): { source: string; flags: string } {
  const trimmed = asString(expression).trim();
  const literalMatch = trimmed.match(/^\/([\s\S]*)\/([a-z]*)$/i);
  if (literalMatch) {
    return {
      source: literalMatch[1] ?? '',
      flags: literalMatch[2] ?? '',
    };
  }
  return {
    source: trimmed,
    flags: '',
  };
}

function compileMatcher(
  expression: string,
  substituteRegex: unknown,
  context: PresetRegexRuntimeContext,
): RegExp | null {
  const { source, flags } = parseRegexExpression(expression);
  if (!source) {
    return null;
  }

  const mode = Number(substituteRegex);
  const substitutedSource = mode === SUBSTITUTE_MODE_MACRO
    ? substituteMacros(source, context, false)
    : mode === SUBSTITUTE_MODE_ESCAPED
      ? substituteMacros(source, context, true)
      : source;

  try {
    return new RegExp(substitutedSource, flags);
  } catch {
    return null;
  }
}

function resolveEphemerality(script: PresetRegexScript): RegexEphemeralityMode {
  if (script.promptOnly && script.markdownOnly) {
    return 'display-and-prompt';
  }
  if (script.promptOnly) {
    return 'prompt-only';
  }
  if (script.markdownOnly) {
    return 'display-only';
  }
  return 'persistent';
}

function resolveAffectTargets(ephemerality: RegexEphemeralityMode): RegexAffectTarget[] {
  switch (ephemerality) {
    case 'display-only':
      return ['display'];
    case 'prompt-only':
      return ['prompt'];
    case 'display-and-prompt':
      return ['display', 'prompt'];
    default:
      return ['canonical', 'display', 'prompt'];
  }
}

function buildRuntimeCacheKey(presetHash: string, context: PresetRegexRuntimeContext): string {
  return [
    presetHash,
    asString(context.userName),
    asString(context.assistantName),
    asString(context.groupName),
    context.isGroup ? 'group' : 'single',
  ].join('|');
}

export function buildPresetRegexRuntime(
  presetDraft: Record<string, unknown> | null,
  context: PresetRegexRuntimeContext,
): PresetRegexRuntime | null {
  const scripts = resolvePresetRegexScriptsDetailed(presetDraft).scripts;
  if (scripts.length === 0) {
    return null;
  }

  const presetHash = buildPresetHash(scripts, context);
  const cacheKey = buildRuntimeCacheKey(presetHash, context);
  const cached = runtimeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const compiledScripts = scripts
    .filter((script) => !script.disabled)
    .filter((script) => script.placement.length === 0 || script.placement.includes(AI_RESPONSE_PLACEMENT))
    .map((script) => {
      const ephemerality = resolveEphemerality(script);
      const matcher = compileMatcher(script.findRegex, script.substituteRegex, context);
      if (!matcher) {
        return null;
      }

      return {
        ...script,
        affectTargets: resolveAffectTargets(ephemerality),
        ephemerality,
        presetHash,
        matcher,
      } as CompiledPresetRegexScript & { matcher: RegExp };
    })
    .filter((script): script is (CompiledPresetRegexScript & { matcher: RegExp }) => script !== null);

  const runtime = compiledScripts.length > 0
    ? {
        presetHash,
        scripts: compiledScripts,
      }
    : null;

  runtimeCache.set(cacheKey, runtime);
  return runtime;
}

function normalizeMessageExtra(extra: ChatMessage['extra'] | null | undefined): ChatMessageExtra {
  const record = asRecord(extra);
  return {
    ...record,
    reasoning: typeof record.reasoning === 'string' ? record.reasoning : undefined,
    reasoning_duration: typeof record.reasoning_duration === 'number' ? record.reasoning_duration : undefined,
    reasoning_display_text: typeof record.reasoning_display_text === 'string' ? record.reasoning_display_text : undefined,
    source_response_text: typeof record.source_response_text === 'string' ? record.source_response_text : undefined,
    regex_display_text: typeof record.regex_display_text === 'string' ? record.regex_display_text : undefined,
    regex_prompt_text: typeof record.regex_prompt_text === 'string' ? record.regex_prompt_text : undefined,
    regex_preset_hash: typeof record.regex_preset_hash === 'string' ? record.regex_preset_hash : undefined,
    regex_applied_rule_ids: Array.isArray(record.regex_applied_rule_ids)
      ? record.regex_applied_rule_ids.map((entry) => asString(entry)).filter(Boolean)
      : undefined,
  };
}

function trimBoundaryString(source: string, trimValue: string): string {
  if (!trimValue) {
    return source;
  }

  let output = source;
  while (output.startsWith(trimValue)) {
    output = output.slice(trimValue.length);
  }
  while (output.endsWith(trimValue)) {
    output = output.slice(0, output.length - trimValue.length);
  }
  return output;
}

function applyTrimStrings(source: string, trimStrings: string[]): string {
  return trimStrings.reduce((output, trimValue) => trimBoundaryString(output, trimValue), source);
}

export function resolveRegexDepth(totalMessages: number, startIndex: number, localMessageIndex: number): number {
  const fullIndex = Math.max(0, startIndex + localMessageIndex);
  return Math.max(0, totalMessages - fullIndex - 1);
}

function matchesDepth(script: PresetRegexScript, depth: number): boolean {
  if (script.minDepth !== null && depth < script.minDepth) {
    return false;
  }
  if (script.maxDepth !== null && depth > script.maxDepth) {
    return false;
  }
  return true;
}

function selectApplicableScripts(
  runtime: PresetRegexRuntime | null,
  depth: number,
  reason: ProjectionReason,
): Array<CompiledPresetRegexScript & { matcher: RegExp }> {
  if (!runtime) {
    return [];
  }

  return runtime.scripts
    .filter((script) => (reason === 'edit' ? script.runOnEdit : true))
    .filter((script) => matchesDepth(script, depth)) as Array<CompiledPresetRegexScript & { matcher: RegExp }>;
}

function applyScriptsForTarget(
  source: string,
  scripts: Array<CompiledPresetRegexScript & { matcher: RegExp }>,
  target: RegexAffectTarget,
): { text: string; appliedRuleIds: string[] } {
  let output = source;
  const appliedRuleIds: string[] = [];

  for (const script of scripts) {
    if (!script.affectTargets.includes(target)) {
      continue;
    }

    const replaced = applyTrimStrings(output.replace(script.matcher, script.replaceString), script.trimStrings ?? []);
    if (replaced === output) {
      continue;
    }

    output = replaced;
    appliedRuleIds.push(script.id);
  }

  return {
    text: output,
    appliedRuleIds,
  };
}

export function buildAssistantRegexProjection(input: {
  message: ChatMessage;
  localMessageIndex: number;
  startIndex: number;
  totalMessages: number;
  runtime: PresetRegexRuntime | null;
  reason?: ProjectionReason;
  sourceTextOverride?: string | null;
}): AssistantRegexProjection {
  const extra = normalizeMessageExtra(input.message.extra);
  const canonicalBase = asString(input.message.mes);
  const source = input.sourceTextOverride !== undefined
    ? asString(input.sourceTextOverride)
    : extra.source_response_text ?? buildMessageSourceContent(input.message);
  const reason = input.reason ?? 'default';

  if (!input.runtime) {
    return {
      canonicalText: canonicalBase,
      displayText: canonicalBase,
      promptText: canonicalBase,
      presetHash: null,
      appliedRuleIds: [],
    };
  }

  if (input.sourceTextOverride === undefined && reason === 'default' && extra.regex_preset_hash === input.runtime.presetHash) {
    return {
      canonicalText: source,
      displayText: extra.regex_display_text ?? canonicalBase,
      promptText: extra.regex_prompt_text ?? source,
      presetHash: input.runtime.presetHash,
      appliedRuleIds: extra.regex_applied_rule_ids ?? [],
    };
  }

  const depth = resolveRegexDepth(input.totalMessages, input.startIndex, input.localMessageIndex);
  const applicableScripts = selectApplicableScripts(input.runtime, depth, reason);
  if (applicableScripts.length === 0) {
    return {
      canonicalText: source,
      displayText: canonicalBase,
      promptText: source,
      presetHash: input.runtime.presetHash,
      appliedRuleIds: [],
    };
  }

  const canonical = applyScriptsForTarget(source, applicableScripts, 'canonical');
  const display = applyScriptsForTarget(source, applicableScripts, 'display');
  const prompt = applyScriptsForTarget(source, applicableScripts, 'prompt');

  return {
    canonicalText: canonical.text,
    displayText: display.text,
    promptText: prompt.text,
    presetHash: input.runtime.presetHash,
    appliedRuleIds: Array.from(new Set([...canonical.appliedRuleIds, ...display.appliedRuleIds, ...prompt.appliedRuleIds])),
  };
}

export function resolveAssistantPromptText(input: {
  message: ChatMessage;
  localMessageIndex: number;
  startIndex: number;
  totalMessages: number;
  runtime: PresetRegexRuntime | null;
}): string {
  return buildAssistantRegexProjection({
    ...input,
    reason: 'default',
  }).promptText;
}

function clearRegexCache(extra: ChatMessageExtra): ChatMessageExtra {
  const {
    regex_display_text: _display,
    regex_prompt_text: _prompt,
    regex_preset_hash: _hash,
    regex_applied_rule_ids: _ruleIds,
    ...rest
  } = extra;
  return rest;
}

function arraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftValue = left ?? [];
  const rightValue = right ?? [];
  if (leftValue.length !== rightValue.length) {
    return false;
  }
  return leftValue.every((entry, index) => entry === rightValue[index]);
}

function updateCurrentSwipeContent(message: ChatMessage, content: string): ChatMessage {
  if (!Array.isArray(message.swipes) || message.swipes.length === 0) {
    return {
      ...message,
      mes: content,
    };
  }

  const swipes = [...message.swipes];
  const swipeId = Number.isInteger(message.swipe_id) ? Math.max(0, Math.min(Number(message.swipe_id), swipes.length - 1)) : 0;
  swipes[swipeId] = content;
  return {
    ...message,
    swipe_id: swipeId,
    swipes,
    mes: content,
  };
}

function syncMessageExtraToCurrentSwipe(message: ChatMessage, extra: ChatMessageExtra): ChatMessage {
  if (!Array.isArray(message.swipes) || message.swipes.length === 0) {
    return {
      ...message,
      extra: { ...extra },
    };
  }

  const swipeInfo = Array.isArray(message.swipe_info) ? [...message.swipe_info] : [];
  while (swipeInfo.length < message.swipes.length) {
    swipeInfo.push({});
  }

  const swipeId = Number.isInteger(message.swipe_id) ? Math.max(0, Math.min(Number(message.swipe_id), message.swipes.length - 1)) : 0;
  const currentSwipeInfo = asRecord(swipeInfo[swipeId]);
  swipeInfo[swipeId] = {
    ...currentSwipeInfo,
    extra: { ...extra },
  };

  return {
    ...message,
    extra: { ...extra },
    swipe_info: swipeInfo,
  };
}

export function applyRegexProjectionToMessage(input: {
  message: ChatMessage;
  localMessageIndex: number;
  startIndex: number;
  totalMessages: number;
  runtime: PresetRegexRuntime | null;
  persistCanonical?: boolean;
  reason?: ProjectionReason;
  sourceTextOverride?: string | null;
}): ChatMessage {
  const message = input.message;
  const extra = normalizeMessageExtra(message.extra);

  if (message.is_user || message.is_system) {
    if (!extra.regex_preset_hash && !extra.regex_display_text && !extra.regex_prompt_text && !extra.regex_applied_rule_ids) {
      return message;
    }
    return syncMessageExtraToCurrentSwipe(message, clearRegexCache(extra));
  }

  const projection = buildAssistantRegexProjection({
    message,
    localMessageIndex: input.localMessageIndex,
    startIndex: input.startIndex,
    totalMessages: input.totalMessages,
    runtime: input.runtime,
    reason: input.reason ?? 'default',
    sourceTextOverride: input.sourceTextOverride,
  });

  if (!projection.presetHash) {
    const clearedExtra = clearRegexCache(extra);
    if (
      clearedExtra.regex_preset_hash === extra.regex_preset_hash
      && clearedExtra.regex_display_text === extra.regex_display_text
      && clearedExtra.regex_prompt_text === extra.regex_prompt_text
      && arraysEqual(clearedExtra.regex_applied_rule_ids, extra.regex_applied_rule_ids)
    ) {
      return message;
    }
    return syncMessageExtraToCurrentSwipe(message, clearedExtra);
  }

  const persistCanonical = input.persistCanonical === true;
  const nextMessage = persistCanonical
    ? updateCurrentSwipeContent(message, projection.canonicalText)
    : message;
  const nextCanonicalBase = asString(nextMessage.mes);
  const nextExtra: ChatMessageExtra = {
    ...clearRegexCache(extra),
    regex_preset_hash: projection.presetHash,
  };

  if (projection.displayText !== nextCanonicalBase) {
    nextExtra.regex_display_text = projection.displayText;
  }
  if (projection.promptText !== nextCanonicalBase) {
    nextExtra.regex_prompt_text = projection.promptText;
  }
  if (projection.appliedRuleIds.length > 0) {
    nextExtra.regex_applied_rule_ids = projection.appliedRuleIds;
  }

  const currentCanonicalBase = asString(message.mes);
  if (
    nextCanonicalBase === currentCanonicalBase
    && nextExtra.regex_preset_hash === extra.regex_preset_hash
    && nextExtra.regex_display_text === extra.regex_display_text
    && nextExtra.regex_prompt_text === extra.regex_prompt_text
    && arraysEqual(nextExtra.regex_applied_rule_ids, extra.regex_applied_rule_ids)
  ) {
    return message;
  }

  return syncMessageExtraToCurrentSwipe(nextMessage, nextExtra);
}

export function applyRegexProjectionToPayloadWindow(input: {
  payload: ChatPayload;
  startIndex: number;
  totalMessages: number;
  runtime: PresetRegexRuntime | null;
  persistCanonical?: boolean;
  reason?: ProjectionReason;
}): ChatPayload {
  const payload = input.payload;
  if (payload.length === 0) {
    return payload;
  }

  const messages = getChatMessages(payload);
  let nextPayload: ChatPayload | null = null;

  messages.forEach((message, localMessageIndex) => {
    const nextMessage = applyRegexProjectionToMessage({
      message,
      localMessageIndex,
      startIndex: input.startIndex,
      totalMessages: input.totalMessages,
      runtime: input.runtime,
      persistCanonical: input.persistCanonical,
      reason: input.reason,
    });

    if (nextMessage === message) {
      return;
    }

    if (!nextPayload) {
      nextPayload = [...payload] as ChatPayload;
    }
    nextPayload[localMessageIndex + 1] = nextMessage;
  });

  return nextPayload ?? payload;
}
