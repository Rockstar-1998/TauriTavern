import { resolveMessageRenderContent } from '../message-display';
import { resolveMultiplayerMessageMeta } from '../session-metadata';

import type { ChatMessage, RendererMessageVm, RendererTarget, RendererWorkspaceVm, TokenUsage } from '@/types/domain';

function messageRole(message: ChatMessage): RendererMessageVm['role'] {
  if (message.is_system) {
    return 'system';
  }
  return message.is_user ? 'user' : 'assistant';
}

export function buildRendererMessageVm(message: ChatMessage, index: number): RendererMessageVm {
  const rendered = resolveMessageRenderContent(message);
  return {
    index,
    id: String(message.send_date ?? index),
    role: messageRole(message),
    name: String(message.name ?? ''),
    content: rendered.content,
    raw_content: rendered.rawContent,
    source_content: rendered.sourceContent,
    reasoning: rendered.reasoning,
    reasoning_display_text: rendered.reasoningDisplayText,
    render_blocks: rendered.renderBlocks,
    render_has_interactive_code: rendered.renderHasInteractiveCode,
    allow_interactive_preview: true,
    pending: Boolean(resolveMultiplayerMessageMeta(message)?.pending),
    send_date: String(message.send_date ?? ''),
  };
}

function hasInteractivePreviewContent(message: ChatMessage): boolean {
  return resolveMessageRenderContent(message).renderHasInteractiveCode;
}

export function buildRendererWorkspaceVm(input: {
  sessionKey: string;
  sessionTitle: string;
  layout: RendererTarget;
  busy: boolean;
  canLoadMoreBefore: boolean;
  loadingMoreBefore: boolean;
  canSend: boolean;
  canStop: boolean;
  tokenUsage?: TokenUsage | null;
  messages: ChatMessage[];
  effectPolicy: Record<string, unknown>;
}): RendererWorkspaceVm {
  const latestInteractivePreviewIndex = input.layout === 'android'
    ? (() => {
        for (let index = input.messages.length - 1; index >= 0; index -= 1) {
          const message = input.messages[index];
          if (message.is_user || message.is_system) {
            continue;
          }
          if (hasInteractivePreviewContent(message)) {
            return index;
          }
        }
        return -1;
      })()
    : -1;

  return {
    session_key: input.sessionKey,
    session_title: input.sessionTitle,
    layout: input.layout,
    busy: input.busy,
    can_load_more_before: input.canLoadMoreBefore,
    loading_more_before: input.loadingMoreBefore,
    can_send: input.canSend,
    can_stop: input.canStop,
    token_usage: input.tokenUsage
      ? {
          model: input.tokenUsage.model,
          prompt_tokens: input.tokenUsage.promptTokens,
          max_context_tokens: input.tokenUsage.maxContextTokens,
          remaining_context_tokens: input.tokenUsage.remainingContextTokens,
          usage_ratio: input.tokenUsage.usageRatio,
          within_limit: input.tokenUsage.withinLimit,
        }
      : null,
    messages: input.messages.map((message, index) => ({
      ...buildRendererMessageVm(message, index),
      allow_interactive_preview: input.layout === 'android' ? index === latestInteractivePreviewIndex : true,
    })),
    effect_policy: input.effectPolicy,
  };
}
