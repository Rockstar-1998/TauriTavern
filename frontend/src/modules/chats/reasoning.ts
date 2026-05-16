import type { ChatMessage, ChatMessageExtra } from '@/types/domain';

const THINKING_BLOCK_PATTERN = /<thinking>([\s\S]*?)<\/thinking>/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeExtra(extra: ChatMessage['extra'] | null | undefined): ChatMessageExtra {
  const record = asRecord(extra);
  return {
    ...record,
    reasoning: typeof record.reasoning === 'string' ? record.reasoning : undefined,
    reasoning_duration: typeof record.reasoning_duration === 'number' ? record.reasoning_duration : undefined,
    reasoning_display_text: typeof record.reasoning_display_text === 'string' ? record.reasoning_display_text : undefined,
    display_text: typeof record.display_text === 'string' ? record.display_text : undefined,
    source_response_text: typeof record.source_response_text === 'string' ? record.source_response_text : undefined,
    regex_display_text: typeof record.regex_display_text === 'string' ? record.regex_display_text : undefined,
    regex_prompt_text: typeof record.regex_prompt_text === 'string' ? record.regex_prompt_text : undefined,
    regex_preset_hash: typeof record.regex_preset_hash === 'string' ? record.regex_preset_hash : undefined,
    regex_applied_rule_ids: Array.isArray(record.regex_applied_rule_ids)
      ? record.regex_applied_rule_ids.map((entry) => String(entry ?? '')).filter(Boolean)
      : undefined,
  };
}

export function splitThinkingContent(source: string): { content: string; reasoning: string | null } {
  const text = String(source ?? '');
  const match = text.match(THINKING_BLOCK_PATTERN);
  if (!match) {
    return { content: text, reasoning: null };
  }

  const reasoning = String(match[1] ?? '').trim();
  const content = text.replace(match[0], '').trim();
  return {
    content,
    reasoning: reasoning || null,
  };
}

export function buildMessageRawContent(message: ChatMessage): string {
  return String(message.mes ?? '');
}

export function composeAssistantSourceContent(content: string, reasoning?: string | null): string {
  const normalizedContent = String(content ?? '');
  const normalizedReasoning = String(reasoning ?? '').trim();
  return normalizedReasoning ? `<thinking>${normalizedReasoning}</thinking>\n${normalizedContent}` : normalizedContent;
}

export function buildMessageSourceContent(message: ChatMessage): string {
  const extra = normalizeExtra(message.extra);
  if (typeof extra.source_response_text === 'string') {
    return extra.source_response_text;
  }

  const content = buildMessageRawContent(message);
  if (message.is_user || message.is_system) {
    return content;
  }
  if (THINKING_BLOCK_PATTERN.test(content)) {
    return content;
  }

  const reasoning = typeof extra.reasoning === 'string' ? extra.reasoning.trim() : '';
  return composeAssistantSourceContent(content, reasoning);
}

export function resolveMessageRenderContent(message: ChatMessage): {
  content: string;
  rawContent: string;
  sourceContent: string;
  reasoning: string | null;
  reasoningDisplayText: string | null;
  extra: ChatMessageExtra;
} {
  const extra = normalizeExtra(message.extra);
  const rawContent = buildMessageRawContent(message);
  const sourceContent = buildMessageSourceContent(message);
  const renderSource = typeof extra.display_text === 'string'
    ? extra.display_text
    : typeof extra.regex_display_text === 'string'
      ? extra.regex_display_text
      : rawContent;
  const fallback = splitThinkingContent(renderSource);
  const reasoning = typeof extra.reasoning === 'string' && extra.reasoning.trim()
    ? extra.reasoning.trim()
    : fallback.reasoning;

  return {
    content: reasoning ? fallback.content : renderSource,
    rawContent,
    sourceContent,
    reasoning,
    reasoningDisplayText: extra.reasoning_display_text?.trim() || null,
    extra,
  };
}

export function updateMessageReasoning(message: ChatMessage, reasoning: string, displayText?: string | null): ChatMessage {
  const nextReasoning = String(reasoning ?? '');
  const extra = normalizeExtra(message.extra);

  return {
    ...message,
    extra: {
      ...extra,
      reasoning: nextReasoning,
      reasoning_display_text: displayText ?? extra.reasoning_display_text,
    },
  };
}

export function updateMessageVisibleContent(message: ChatMessage, content: string): ChatMessage {
  return {
    ...message,
    mes: String(content ?? ''),
  };
}

export function mergeAssistantResponseParts(message: ChatMessage, parts: { contentDelta?: string; reasoningDelta?: string }): ChatMessage {
  let nextMessage = message;
  if (parts.contentDelta) {
    nextMessage = updateMessageVisibleContent(nextMessage, `${nextMessage.mes ?? ''}${parts.contentDelta}`);
  }
  if (parts.reasoningDelta) {
    const resolved = resolveMessageRenderContent(nextMessage);
    nextMessage = updateMessageReasoning(nextMessage, `${resolved.reasoning ?? ''}${parts.reasoningDelta}`);
  }
  return nextMessage;
}
