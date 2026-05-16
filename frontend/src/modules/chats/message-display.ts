import type { ChatMessage, ChatMessageExtra, MessageRenderBlock, MessageRenderPreviewKind } from '@/types/domain';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizePreviewKind(value: unknown): MessageRenderPreviewKind | undefined {
  return value === 'html' || value === 'css' || value === 'svg' || value === 'javascript'
    ? value
    : undefined;
}

function normalizeRenderBlocks(value: unknown): MessageRenderBlock[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const blocks = value
    .map((entry) => {
      const record = asRecord(entry);
      const kind = record.kind === 'code' ? 'code' : record.kind === 'text' ? 'text' : null;
      if (!kind) {
        return null;
      }

      return {
        ...record,
        kind,
        content: typeof record.content === 'string' ? record.content : '',
        language: typeof record.language === 'string' ? record.language : '',
        interactive: record.interactive === true,
        preview_kind: normalizePreviewKind(record.preview_kind),
        preview_hash: typeof record.preview_hash === 'string' ? record.preview_hash : '',
      } as MessageRenderBlock;
    })
    .filter((block): block is MessageRenderBlock => block !== null);

  return blocks.length > 0 ? blocks : undefined;
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
    render_blocks: normalizeRenderBlocks(record.render_blocks),
    render_has_interactive_code: record.render_has_interactive_code === true,
  };
}

const THINKING_BLOCK_PATTERN = /<thinking>([\s\S]*?)<\/thinking>/i;

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

  const content = String(message.mes ?? '');
  if (message.is_user || message.is_system) {
    return content;
  }
  if (THINKING_BLOCK_PATTERN.test(content)) {
    return content;
  }

  const reasoning = typeof extra.reasoning === 'string' ? extra.reasoning.trim() : '';
  return reasoning ? composeAssistantSourceContent(content, reasoning) : content;
}

export function resolveMessageRenderContent(message: ChatMessage): {
  content: string;
  rawContent: string;
  sourceContent: string;
  reasoning: string | null;
  reasoningDisplayText: string | null;
  renderBlocks: MessageRenderBlock[] | null;
  renderHasInteractiveCode: boolean;
  extra: ChatMessageExtra;
} {
  const extra = normalizeExtra(message.extra);
  const rawContent = String(message.mes ?? '');
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
  const content = reasoning ? fallback.content : renderSource;
  const renderBlocks = Array.isArray(extra.render_blocks) && extra.render_blocks.length > 0
    ? extra.render_blocks
    : null;
  const renderHasInteractiveCode = extra.render_has_interactive_code === true
    || Boolean(renderBlocks?.some((block) => block.kind === 'code' && block.interactive));

  return {
    content,
    rawContent,
    sourceContent,
    reasoning,
    reasoningDisplayText: extra.reasoning_display_text?.trim() || null,
    renderBlocks,
    renderHasInteractiveCode,
    extra,
  };
}
