import type { ChatMessage, ChatPayload, ChatProviderDraft, CharacterDetail, Group, GenerationRequest } from '@/types/domain';
import { getChatMessages } from '@/types/domain';

import {
  getActivePromptOrderEntries,
  type PromptEntry,
  type PromptManagerSanitizeResult,
} from '@/modules/presets/openai-prompt-manager';
import { asRecord } from '@/modules/presets/utils';

import { buildPresetRegexRuntime, resolveAssistantPromptText } from './preset-regex';

export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
};

export type OpenAiComposeOptions = {
  payload: ChatPayload;
  mode: 'reply' | 'continue' | 'regenerate';
  targetMessageIndex?: number;
  promptPayload: PromptManagerSanitizeResult;
  worldInfoBlock: string;
  oaiSettings: Record<string, unknown>;
  settings?: Record<string, unknown>;
  userName: string;
  assistantName: string;
  character?: CharacterDetail | null;
  group?: Group | null;
  presetDraft?: Record<string, unknown> | null;
  historyStartIndex?: number;
  totalMessages?: number;
};

const NAMES_BEHAVIOR = {
  NONE: -1,
  DEFAULT: 0,
  COMPLETION: 1,
  CONTENT: 2,
};

const PROMPT_CHAT_HISTORY_ID = 'chatHistory';
const PROMPT_DIALOGUE_EXAMPLES_ID = 'dialogueExamples';
const PROMPT_NOW_PLAYER_INPUT = 'now-player-input';
const INJECTION_POSITION = {
  RELATIVE: 0,
  ABSOLUTE: 1,
};
const DEFAULT_INJECTION_DEPTH = 4;
const DEFAULT_INJECTION_ORDER = 100;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
  }
  return Boolean(value);
}

function renderTemplate(template: string, params: Record<string, string>): string {
  if (!template) {
    return '';
  }
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const normalized = String(key ?? '').trim();
    return normalized in params ? params[normalized] : _match;
  });
}

function replaceAngleMacros(template: string, params: Record<string, string>): string {
  if (!template) {
    return '';
  }

  const replacements: Array<[RegExp, string]> = [
    [/<user>/gi, params.user ?? ''],
    [/<char>/gi, params.char ?? ''],
    [/<bot>/gi, params.char ?? ''],
    [/<group>/gi, params.group ?? ''],
    [/<charifnotgroup>/gi, params.charIfNotGroup ?? ''],
  ];

  let output = template;
  for (const [pattern, value] of replacements) {
    output = output.replace(pattern, value);
  }

  return output;
}

type PromptMacroContext = {
  params: Record<string, string>;
  variables: Record<string, string>;
  nowPlayerInput?: string;
};

function applyPromptMacros(input: string, context: PromptMacroContext): string {
  if (!input) {
    return '';
  }

  let output = input;

  output = output.replace(/{{\s*\/\/[\s\S]*?}}/g, '');
  output = output.replace(/{{\s*newline\s*}}/gi, '\n');
  output = output.replace(/{{\s*noop\s*}}/gi, '');

  output = output.replace(/{{\s*(addvar|setvar)::([\s\S]*?)::([\s\S]*?)}}/g, (_match, action, rawName, rawValue) => {
    const name = String(rawName ?? '').trim();
    if (!name) {
      return '';
    }
    const value = String(rawValue ?? '').replace(/^\r?\n+/, '');
    if (action === 'addvar') {
      context.variables[name] = `${context.variables[name] ?? ''}${value}`;
    } else {
      context.variables[name] = value;
    }
    return '';
  });

  output = output.replace(/{{\s*getvar::([\s\S]*?)}}/g, (_match, rawName) => {
    const name = String(rawName ?? '').trim();
    return name ? (context.variables[name] ?? '') : '';
  });

  output = renderTemplate(output, context.params);
  output = replaceAngleMacros(output, context.params);

  const nowPlayerInput = (context.nowPlayerInput ?? '').replace(/\r\n/g, '\n').replace(/\s+$/g, '');
  if (nowPlayerInput && /now-player-input/i.test(output)) {
    const replacement = `<now-player-input>\n${nowPlayerInput}</now-player-input>`;
    output = output.replace(/<now-player-input\s*\/>/gi, replacement);
    output = output.replace(/<now-player-input>[\s\S]*?<\/now-player-input>/gi, replacement);
  }

  output = output.replace(/(?:\r?\n)*{{\s*trim\s*}}(?:\r?\n)*/gi, '');

  return output;
}

function formatWorldInfo(value: string, format: string): string {
  if (!value.trim()) {
    return '';
  }
  if (!format.trim()) {
    return value;
  }
  return format.replace(/{(\d+)}/g, (match, index) => (index === '0' ? value : match));
}

function mapPromptRole(role: unknown): OpenAiMessage['role'] {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (normalized === 'user') {
    return 'user';
  }
  if (normalized === 'assistant') {
    return 'assistant';
  }
  return 'system';
}

function buildTimelineMessages(payload: ChatPayload, mode: 'reply' | 'continue' | 'regenerate', targetMessageIndex?: number): ChatMessage[] {
  const messages = getChatMessages(payload);
  if (mode === 'regenerate' && typeof targetMessageIndex === 'number') {
    return messages.slice(0, targetMessageIndex);
  }
  if (mode === 'continue' && typeof targetMessageIndex === 'number') {
    return messages.slice(0, targetMessageIndex + 1);
  }
  return messages;
}

function buildChatHistoryMessages(messages: ChatMessage[], options: {
  namesBehavior: number;
  userName: string;
  isGroup: boolean;
  historyStartIndex: number;
  totalMessages: number;
  presetDraft: Record<string, unknown> | null;
  assistantName: string;
  groupName: string;
}): OpenAiMessage[] {
  const regexRuntime = buildPresetRegexRuntime(options.presetDraft, {
    userName: options.userName,
    assistantName: options.assistantName,
    groupName: options.groupName,
    isGroup: options.isGroup,
  });
  const output: OpenAiMessage[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const role: OpenAiMessage['role'] = message.is_system ? 'system' : message.is_user ? 'user' : 'assistant';
    let content = role === 'assistant'
      ? resolveAssistantPromptText({
          message,
          localMessageIndex: index,
          startIndex: options.historyStartIndex,
          totalMessages: options.totalMessages,
          runtime: regexRuntime,
        })
      : asString(message.mes);
    const name = asString(message.name);

    if (role !== 'system') {
      if (options.namesBehavior === NAMES_BEHAVIOR.DEFAULT && options.isGroup && name && name !== options.userName) {
        content = `${name}: ${content}`;
      } else if (options.namesBehavior === NAMES_BEHAVIOR.CONTENT && name) {
        content = `${name}: ${content}`;
      }
    }

    const entry: OpenAiMessage = { role, content };
    if (options.namesBehavior === NAMES_BEHAVIOR.COMPLETION && name) {
      entry.name = name;
    }
    output.push(entry);
  }
  return output;
}

function resolveInjectionDepth(prompt: PromptEntry): number {
  const value = Number(prompt.injection_depth);
  if (!Number.isFinite(value)) {
    return DEFAULT_INJECTION_DEPTH;
  }
  return Math.max(0, Math.floor(value));
}

function resolveInjectionOrder(prompt: PromptEntry): number {
  const value = Number(prompt.injection_order);
  if (!Number.isFinite(value)) {
    return DEFAULT_INJECTION_ORDER;
  }
  return value;
}

function normalizeGenerationType(mode: OpenAiComposeOptions['mode']): string {
  if (mode === 'continue') {
    return 'continue';
  }
  if (mode === 'regenerate') {
    return 'swipe';
  }
  return 'normal';
}

function isPromptTriggered(prompt: PromptEntry, generationType: string): boolean {
  if (!Array.isArray(prompt.injection_trigger) || prompt.injection_trigger.length === 0) {
    return true;
  }
  const normalized = prompt.injection_trigger.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) {
    return true;
  }
  return normalized.includes(generationType);
}

function applyAbsolutePromptInjections(options: {
  history: OpenAiMessage[];
  prompts: PromptEntry[];
  macroContext: PromptMacroContext;
  generationType: string;
}): OpenAiMessage[] {
  if (!options.prompts.length) {
    return options.history;
  }

  const injectionPrompts = options.prompts
    .filter((prompt) => prompt.injection_position === INJECTION_POSITION.ABSOLUTE)
    .filter((prompt) => isPromptTriggered(prompt, options.generationType));

  if (injectionPrompts.length === 0) {
    return options.history;
  }

  const reversed = [...options.history].reverse();
  const depths = injectionPrompts.map((prompt) => resolveInjectionDepth(prompt));
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  let inserted = 0;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const depthPrompts = injectionPrompts.filter((prompt) => resolveInjectionDepth(prompt) === depth);
    if (depthPrompts.length === 0) {
      continue;
    }

    const orderGroups = new Map<number, PromptEntry[]>();
    for (const prompt of depthPrompts) {
      const order = resolveInjectionOrder(prompt);
      const group = orderGroups.get(order);
      if (group) {
        group.push(prompt);
      } else {
        orderGroups.set(order, [prompt]);
      }
    }

    const orders = Array.from(orderGroups.keys()).sort((left, right) => right - left);
    const injectedMessages: OpenAiMessage[] = [];
    for (const order of orders) {
      const group = orderGroups.get(order) ?? [];
      const roles: OpenAiMessage['role'][] = ['system', 'user', 'assistant'];
      for (const role of roles) {
        const contents = group
          .filter((prompt) => mapPromptRole(prompt.role) === role)
          .map((prompt) => applyPromptMacros(asString(prompt.content), options.macroContext))
          .map((content) => content.trim())
          .filter(Boolean);
        if (!contents.length) {
          continue;
        }
        injectedMessages.push({ role, content: contents.join('\n') });
      }
    }

    if (injectedMessages.length) {
      const insertIndex = Math.min(depth + inserted, reversed.length);
      reversed.splice(insertIndex, 0, ...injectedMessages);
      inserted += injectedMessages.length;
    }
  }

  return reversed.reverse();
}

function parseExampleMessages(example: string, options: { userName: string; assistantName: string; isGroup: boolean }): OpenAiMessage[] {
  const normalized = example.replace(/\r/g, '');
  const lines = normalized.split('\n');
  if (lines.length === 0) {
    return [];
  }

  const userPrefix = `${options.userName}:`;
  const assistantPrefix = `${options.assistantName}:`;

  let currentRole: OpenAiMessage['role'] | null = null;
  let currentName = '';
  let buffer: string[] = [];
  const output: OpenAiMessage[] = [];

  const flush = () => {
    if (!currentRole || buffer.length === 0) {
      buffer = [];
      return;
    }
    const content = buffer.join('\n').trim();
    if (!content) {
      buffer = [];
      return;
    }
    output.push({ role: 'system', content, name: currentName || undefined });
    buffer = [];
  };

  lines.forEach((line, index) => {
    if (index === 0 && line.toLowerCase().includes('example')) {
      return;
    }
    if (line.startsWith(userPrefix)) {
      flush();
      currentRole = 'user';
      currentName = 'example_user';
      buffer.push(line.slice(userPrefix.length).trim());
      return;
    }
    if (line.startsWith(assistantPrefix)) {
      flush();
      currentRole = 'assistant';
      currentName = 'example_assistant';
      buffer.push(line.slice(assistantPrefix.length).trim());
      return;
    }
    buffer.push(line);
  });
  flush();

  return output;
}

function buildDialogueExamples(exampleText: string, options: { userName: string; assistantName: string; isGroup: boolean; newExamplePrompt: string }): OpenAiMessage[] {
  if (!exampleText.trim()) {
    return [];
  }
  const output: OpenAiMessage[] = [];
  const blocks = exampleText.split(/<START>/i).map((block) => block.trim()).filter(Boolean);
  const sources = blocks.length > 0 ? blocks : [exampleText];
  for (const block of sources) {
    const messages = parseExampleMessages(block, options);
    if (messages.length === 0) {
      continue;
    }
    if (options.newExamplePrompt.trim()) {
      output.push({ role: 'system', content: options.newExamplePrompt });
    }
    output.push(...messages);
  }
  return output;
}

function resolvePersonaDescription(settings: Record<string, unknown>): string {
  const powerUser = asRecord(settings.power_user);
  const direct = asString(powerUser.persona_description || settings.persona_description);
  return direct.trim();
}

function resolveGroupNames(group: Group | null | undefined): string[] {
  if (!group) {
    return [];
  }
  return Array.isArray(group.members) ? group.members.map((name) => String(name ?? '').trim()).filter(Boolean) : [];
}

export function composeOpenAiMessages(options: OpenAiComposeOptions): OpenAiMessage[] {
  const oaiSettings = asRecord(options.oaiSettings);
  const settingsSource = asRecord(options.settings);
  const powerUser = asRecord(settingsSource.power_user);
  const namesBehavior = asNumber(oaiSettings.names_behavior) ?? NAMES_BEHAVIOR.DEFAULT;

  const timelineMessages = buildTimelineMessages(options.payload, options.mode, options.targetMessageIndex);
  const promptEntries = Array.isArray(options.promptPayload.prompts) ? (options.promptPayload.prompts as PromptEntry[]) : [];
  const usesNowPlayerInput = promptEntries.some((prompt) => new RegExp(PROMPT_NOW_PLAYER_INPUT, 'i').test(asString(prompt.content)));
  const lastUserIndex = [...timelineMessages].reverse().findIndex((message) => message.is_user && !message.is_system);
  const resolvedLastUserIndex = lastUserIndex >= 0 ? timelineMessages.length - 1 - lastUserIndex : -1;
  const lastUserMessage = resolvedLastUserIndex >= 0 ? asString(timelineMessages[resolvedLastUserIndex]?.mes) : '';
  const historySourceMessages = timelineMessages;
  const totalMessages = Math.max(options.totalMessages ?? historySourceMessages.length, historySourceMessages.length);
  const historyStartIndex = Math.max(0, options.historyStartIndex ?? Math.max(0, totalMessages - historySourceMessages.length));

  const chatHistoryMessages = buildChatHistoryMessages(historySourceMessages, {
    namesBehavior,
    userName: options.userName,
    isGroup: Boolean(options.group),
    historyStartIndex,
    totalMessages,
    presetDraft: options.presetDraft ?? null,
    assistantName: options.assistantName,
    groupName: asString(options.group?.name),
  });

  const lastHistory = chatHistoryMessages.length ? chatHistoryMessages[chatHistoryMessages.length - 1] : null;
  if (lastHistory?.role === 'assistant' && asString(oaiSettings.send_if_empty).trim()) {
    chatHistoryMessages.push({ role: 'user', content: asString(oaiSettings.send_if_empty) });
  }

  const worldInfoFormatted = formatWorldInfo(asString(options.worldInfoBlock), asString(oaiSettings.wi_format));
  const personaDescription = resolvePersonaDescription(settingsSource);
  const groupNames = resolveGroupNames(options.group);
  const groupLabel = groupNames.join(', ');
  const formatParams = {
    char: options.assistantName,
    user: options.userName,
    scenario: asString(options.character?.scenario),
    personality: asString(options.character?.personality),
    description: asString(options.character?.description),
    persona: personaDescription,
    group: groupLabel,
    charIfNotGroup: groupLabel ? '' : options.assistantName,
    wiBefore: worldInfoFormatted,
    wiAfter: worldInfoFormatted,
  };

  const scenarioText = formatParams.scenario && asString(oaiSettings.scenario_format).trim()
    ? renderTemplate(asString(oaiSettings.scenario_format), formatParams)
    : formatParams.scenario;
  const personalityText = formatParams.personality && asString(oaiSettings.personality_format).trim()
    ? renderTemplate(asString(oaiSettings.personality_format), formatParams)
    : formatParams.personality;

  const promptMap = new Map(promptEntries.map((prompt) => [prompt.identifier, prompt]));
  const orderEntries = getActivePromptOrderEntries(options.promptPayload.prompt_order);
  const enabledOrder = orderEntries.filter((entry) => entry.enabled);
  const enabledIdentifiers = new Set(enabledOrder.map((entry) => entry.identifier));
  const generationType = normalizeGenerationType(options.mode);
  const orderIds = new Set(enabledOrder.map((entry) => entry.identifier));
  const worldInfoBeforeEnabled = orderIds.has('worldInfoBefore');

  const newExamplePrompt = renderTemplate(asString(oaiSettings.new_example_chat_prompt), formatParams);
  const dialogueExamples = options.character?.mes_example
    ? buildDialogueExamples(String(options.character.mes_example), {
      userName: options.userName,
      assistantName: options.assistantName,
      isGroup: Boolean(options.group),
      newExamplePrompt,
    })
    : [];

  const dynamicPromptContent: Record<string, string> = {
    worldInfoBefore: worldInfoFormatted,
    worldInfoAfter: worldInfoBeforeEnabled ? '' : worldInfoFormatted,
    charDescription: formatParams.description,
    charPersonality: personalityText,
    scenario: scenarioText,
    personaDescription,
    groupNudge: options.group ? renderTemplate(asString(oaiSettings.group_nudge_prompt), formatParams) : '',
    impersonate: renderTemplate(asString(oaiSettings.impersonation_prompt), formatParams),
  };

  const continueNudge = options.mode === 'continue'
    ? renderTemplate(asString(oaiSettings.continue_nudge_prompt), {
      ...formatParams,
      lastChatMessage: asString(lastHistory?.content),
    })
    : '';

  if (continueNudge.trim()) {
    dynamicPromptContent.continueNudge = continueNudge;
  }

  const sysprompt = asBoolean(oaiSettings.use_sysprompt)
    ? asString(asRecord(powerUser.sysprompt).content).trim()
    : '';

  const messages: OpenAiMessage[] = [];
  const promptVariables: Record<string, string> = {};
  const macroContext: PromptMacroContext = {
    params: formatParams,
    variables: promptVariables,
    nowPlayerInput: usesNowPlayerInput ? lastUserMessage : '',
  };
  const injectionCandidates = promptEntries.filter((prompt) => enabledIdentifiers.has(prompt.identifier));
  let injectedChatHistory: OpenAiMessage[] | null = null;
  const resolveInjectedChatHistory = () => {
    if (!injectedChatHistory) {
      injectedChatHistory = applyAbsolutePromptInjections({
        history: chatHistoryMessages,
        prompts: injectionCandidates,
        macroContext,
        generationType,
      });
    }
    return injectedChatHistory;
  };

  if (sysprompt) {
    const rendered = applyPromptMacros(sysprompt, macroContext);
    if (rendered.trim()) {
      messages.push({ role: 'system', content: rendered });
    }
  }

  for (const entry of enabledOrder) {
    const prompt = promptMap.get(entry.identifier);
    if (prompt?.injection_position === INJECTION_POSITION.ABSOLUTE) {
      continue;
    }
    if (entry.identifier === PROMPT_CHAT_HISTORY_ID) {
      messages.push(...resolveInjectedChatHistory());
      continue;
    }
    if (entry.identifier === PROMPT_DIALOGUE_EXAMPLES_ID) {
      messages.push(...dialogueExamples);
      continue;
    }

    const override = dynamicPromptContent[entry.identifier];
    const content = override !== undefined
      ? override
      : prompt
        ? asString(prompt.content)
        : '';

    if (!content.trim()) {
      continue;
    }

    const role = prompt ? mapPromptRole(prompt.role) : 'system';
    const rendered = applyPromptMacros(content, macroContext);
    if (!rendered.trim()) {
      continue;
    }
    messages.push({ role, content: rendered });
  }

  if (!orderIds.has(PROMPT_CHAT_HISTORY_ID)) {
    messages.push(...resolveInjectedChatHistory());
  }

  if (dynamicPromptContent.groupNudge?.trim() && !orderIds.has('groupNudge')) {
    const rendered = applyPromptMacros(dynamicPromptContent.groupNudge, macroContext);
    if (rendered.trim()) {
      messages.push({ role: 'system', content: rendered });
    }
  }

  if (dynamicPromptContent.continueNudge?.trim() && !orderIds.has('continueNudge')) {
    const rendered = applyPromptMacros(dynamicPromptContent.continueNudge, macroContext);
    if (rendered.trim()) {
      messages.push({ role: 'system', content: rendered });
    }
  }

  let finalized = messages;
  if (asBoolean(oaiSettings.squash_system_messages)) {
    const squashed: OpenAiMessage[] = [];
    for (const message of messages) {
      const last = squashed[squashed.length - 1];
      if (last && last.role === 'system' && message.role === 'system') {
        last.content = `${last.content}\n${message.content}`.trim();
        continue;
      }
      squashed.push({ ...message });
    }
    finalized = squashed;
  }

  const userPromptBias = asString(powerUser.user_prompt_bias).trim();
  if (userPromptBias) {
    const rendered = applyPromptMacros(userPromptBias, macroContext).trimEnd();
    if (rendered.trim()) {
      finalized = [...finalized, { role: 'assistant', content: rendered }];
    }
  }

  return finalized.filter((message) => message.content.trim());
}

function normalizeUndefinedString(value: unknown): string {
  const raw = asString(value).trim();
  if (!raw) {
    return '[Undefined]';
  }
  const quoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
  if (quoted) {
    const unquoted = raw.slice(1, -1).trim();
    return unquoted || '[Undefined]';
  }
  return raw;
}

export function buildOpenAiRequestOptions(options: {
  provider: ChatProviderDraft;
  oaiSettings: Record<string, unknown>;
  generationType?: string;
  userName: string;
  assistantName: string;
  groupNames: string[];
}): GenerationRequest {
  const oaiSettings = asRecord(options.oaiSettings);

  const readNumber = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = asNumber(oaiSettings[key]);
      if (value != null) {
        return value;
      }
    }
    return undefined;
  };

  const reverseProxy = asString(options.provider.reverse_proxy).trim();
  const customUrl = asString(options.provider.custom_url).trim();
  const proxyPassword = asString(options.provider.proxy_password).trim();
  const customEndpoint = reverseProxy || customUrl;
  const chatSource = customEndpoint
    ? 'custom'
    : String(options.provider.chat_completion_source ?? '').trim() || 'openai';
  const reasoningEffort = asString(oaiSettings.reasoning_effort).trim();
  const verbosity = asString(oaiSettings.verbosity).trim();
  const requestImageResolution = asString(oaiSettings.request_image_resolution).trim();
  const requestImageAspectRatio = asString(oaiSettings.request_image_aspect_ratio).trim();
  const generationType = asString(options.generationType).trim() || 'normal';

  const request: Record<string, unknown> = {
    type: generationType,
    chat_completion_source: chatSource,
    model: options.provider.model,
    custom_url: options.provider.custom_url,
    custom_include_headers: options.provider.custom_include_headers,
    custom_include_body: options.provider.custom_include_body,
    custom_exclude_body: options.provider.custom_exclude_body,
    temperature: readNumber('temp_openai', 'temperature'),
    frequency_penalty: readNumber('freq_pen_openai', 'frequency_penalty'),
    presence_penalty: readNumber('pres_pen_openai', 'presence_penalty'),
    top_p: readNumber('top_p', 'top_p_openai'),
    top_k: readNumber('top_k', 'top_k_openai'),
    enable_web_search: asBoolean(oaiSettings.enable_web_search),
    request_images: asBoolean(oaiSettings.request_images),
    include_reasoning: asBoolean(oaiSettings.show_thoughts),
    user_name: options.userName,
    char_name: options.assistantName,
    group_names: options.groupNames,
  };

  if (!customUrl && reverseProxy) {
    request.reverse_proxy = options.provider.reverse_proxy;
  }

  if (proxyPassword) {
    request.proxy_password = options.provider.proxy_password;
  }

  if (options.provider.bypass_status_check === true) {
    request.bypass_status_check = true;
  }

  if (customUrl && !reverseProxy && proxyPassword) {
    request.reverse_proxy = options.provider.custom_url;
  }

  const maxTokens = readNumber('openai_max_tokens', 'max_tokens');
  if (maxTokens != null) {
    request.max_tokens = maxTokens;
  }

  if (oaiSettings.stream_openai !== undefined && oaiSettings.stream_openai !== null && oaiSettings.stream_openai !== '') {
    request.stream = asBoolean(oaiSettings.stream_openai);
  }

  if (reasoningEffort) {
    request.reasoning_effort = reasoningEffort;
  }
  request.verbosity = normalizeUndefinedString(verbosity);
  request.request_image_resolution = requestImageResolution;
  request.request_image_aspect_ratio = requestImageAspectRatio;

  const seed = readNumber('seed');
  if (seed != null && seed >= 0) {
    request.seed = seed;
  }

  const n = readNumber('n');
  if (n != null && n > 1) {
    request.n = n;
  }

  const postProcessing = asString(oaiSettings.custom_prompt_post_processing);
  request.custom_prompt_post_processing = postProcessing;

  const logitBias = (oaiSettings as Record<string, unknown>).logit_bias;
  if (logitBias && typeof logitBias === 'object' && Object.keys(logitBias as Record<string, unknown>).length > 0) {
    request.logit_bias = logitBias;
  } else {
    request.logit_bias = normalizeUndefinedString(logitBias);
  }

  return request as GenerationRequest;
}

export type OpenAiRequestSanitizeResult = {
  request: GenerationRequest;
  removed: string[];
  streamAdjusted: boolean;
};

export function sanitizeOpenAiRequestOptions(request: GenerationRequest): OpenAiRequestSanitizeResult {
  const next: Record<string, unknown> = { ...request };
  const removed: string[] = [];
  let streamAdjusted = false;

  const source = String(next.chat_completion_source ?? '').trim().toLowerCase();
  const model = String(next.model ?? '').trim();
  const normalizedModel = model.toLowerCase();
  const reverseProxy = String(next.reverse_proxy ?? '').trim().toLowerCase();
  const customUrl = String(next.custom_url ?? '').trim().toLowerCase();

  const remove = (key: string) => {
    if (key in next) {
      delete next[key];
      removed.push(key);
    }
  };

  if ('n' in next) {
    const rawN = next.n;
    if (typeof rawN === 'string') {
      const parsed = Number(rawN);
      if (Number.isFinite(parsed) && parsed >= 1) {
        next.n = parsed;
      } else {
        remove('n');
      }
    } else if (typeof rawN !== 'number') {
      remove('n');
    }
  }

  const isMoonshotEndpoint = source === 'moonshot'
    || reverseProxy.includes('moonshot')
    || reverseProxy.includes('kimi')
    || customUrl.includes('moonshot')
    || customUrl.includes('kimi');
  const isMoonshotK2 = isMoonshotEndpoint && /kimi-k2\.5/i.test(model);
  if (isMoonshotK2) {
    remove('temperature');
    remove('top_p');
    remove('frequency_penalty');
    remove('presence_penalty');
  }

  const isOpenAiVision = ['openai', 'openrouter', 'custom'].includes(source)
    && normalizedModel.includes('gpt')
    && normalizedModel.includes('vision');
  if (isOpenAiVision) {
    remove('logit_bias');
    remove('stop');
    remove('logprobs');
    remove('top_logprobs');
  }
  if (['openai', 'openrouter', 'custom'].includes(source) && /gpt-4\.5/.test(normalizedModel)) {
    remove('logprobs');
    remove('top_logprobs');
  }

  const isOpenAiO1Family = (['openai', 'azure_openai', 'custom'].includes(source) && /^(o1|o3|o4)/i.test(normalizedModel))
    || (source === 'openrouter' && /^openai\/(o1|o3|o4)/i.test(normalizedModel));
  if (isOpenAiO1Family) {
    if (next.max_tokens != null) {
      next.max_completion_tokens = next.max_tokens;
      delete next.max_tokens;
      removed.push('max_tokens');
    }
    remove('temperature');
    remove('top_p');
    remove('frequency_penalty');
    remove('presence_penalty');
    remove('logit_bias');
    remove('stop');
    remove('logprobs');
    remove('top_logprobs');
    if (next.stream === true) {
      next.stream = false;
      streamAdjusted = true;
    }

    if (/^(openai\/)?o1/.test(normalizedModel)) {
      const messages = next.messages;
      if (Array.isArray(messages)) {
        next.messages = messages.map((message) => {
          if (!message || typeof message !== 'object' || Array.isArray(message)) {
            return message;
          }
          const record = message as Record<string, unknown>;
          if (record.role === 'system') {
            return { ...record, role: 'user' };
          }
          return { ...record };
        });
      }
      remove('n');
      remove('tools');
      remove('tool_choice');
    }
  }

  const isOpenAiGpt5 = ['openai', 'azure_openai', 'openrouter', 'custom'].includes(source) && /gpt-5/.test(normalizedModel);
  if (isOpenAiGpt5) {
    if (next.max_tokens != null) {
      next.max_completion_tokens = next.max_tokens;
      delete next.max_tokens;
      removed.push('max_tokens');
    }
    remove('logprobs');
    remove('top_logprobs');

    if (/gpt-5-chat-latest/.test(normalizedModel)) {
      remove('tools');
      remove('tool_choice');
    } else if (/gpt-5\.(1|2)/.test(normalizedModel) && !/chat-latest/.test(normalizedModel)) {
      remove('frequency_penalty');
      remove('presence_penalty');
      remove('logit_bias');
      remove('stop');
    } else {
      remove('temperature');
      remove('top_p');
      remove('frequency_penalty');
      remove('presence_penalty');
      remove('logit_bias');
      remove('stop');
    }
  }

  return { request: next as GenerationRequest, removed, streamAdjusted };
}

export function extractLogitBiasEntries(oaiSettings: Record<string, unknown>): Array<{ text: string; value: number }> {
  const settings = asRecord(oaiSettings);
  const selected = asString(settings.bias_preset_selected);
  if (!selected) {
    return [];
  }
  const presets = asRecord(settings.bias_presets);
  const entries = presets[selected];
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map((entry) => {
      const record = asRecord(entry);
      const text = asString(record.text);
      const value = asNumber(record.value);
      if (!text || value == null) {
        return null;
      }
      return { text, value };
    })
    .filter(Boolean) as Array<{ text: string; value: number }>;
}

export type CustomStoppingStringsResult = {
  stop: string[];
  error?: string;
};

export function resolveCustomStoppingStrings(options: {
  settings?: Record<string, unknown>;
  userName: string;
  assistantName: string;
  groupNames: string[];
  limit?: number;
}): CustomStoppingStringsResult {
  const settingsSource = asRecord(options.settings);
  const powerUser = asRecord(settingsSource.power_user);
  const raw = powerUser.custom_stopping_strings;
  if (!raw) {
    return { stop: [] };
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return {
        stop: [],
        error: message ? `custom_stopping_strings JSON 解析失败：${message}` : 'custom_stopping_strings JSON 解析失败',
      };
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      stop: [],
      error: 'custom_stopping_strings 需为 JSON 数组',
    };
  }

  const macroEnabled = asBoolean(powerUser.custom_stopping_strings_macro);
  const groupLabel = options.groupNames.filter(Boolean).join(', ');
  const formatParams: Record<string, string> = {
    char: options.assistantName,
    user: options.userName,
    group: groupLabel,
    charIfNotGroup: groupLabel ? '' : options.assistantName,
  };
  const applyMacro = (value: string) => value.replace(/{{\s*([^}]+)\s*}}/g, (match, key) => {
    const normalized = String(key ?? '').trim();
    return normalized in formatParams ? formatParams[normalized] : match;
  });

  let stop = parsed
    .map((value) => (typeof value === 'string' ? value : String(value ?? '')))
    .map((value) => (macroEnabled ? applyMacro(value) : value))
    .map((value) => value.trim())
    .filter(Boolean);

  if (options.limit && options.limit > 0) {
    stop = stop.slice(0, options.limit);
  }

  return { stop };
}
