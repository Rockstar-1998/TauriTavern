import { createAssistantChatMessage } from '@/lib/api/core-client';
import { getChatMessages, type ChatMessage, type ChatPayload } from '@/types/domain';

import { composeAssistantSourceContent } from './message-display';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function clonePayload(payload: ChatPayload): ChatPayload {
  return payload.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { ...(item as Record<string, unknown>) };
    }
    return item;
  }) as ChatPayload;
}

function updateMessageRecord(payload: ChatPayload, messageIndex: number, updater: (record: Record<string, unknown>) => Record<string, unknown>): ChatPayload {
  const nextPayload = clonePayload(payload);
  const payloadIndex = messageIndex + 1;
  const nextRecord = updater({ ...asRecord(nextPayload[payloadIndex]) });
  nextPayload[payloadIndex] = nextRecord;
  return nextPayload;
}

export function getPayloadMessage(payload: ChatPayload, messageIndex: number): ChatMessage | null {
  return getChatMessages(payload)[messageIndex] ?? null;
}

export function ensureSwipeState(message: ChatMessage): ChatMessage {
  const currentText = String(message.mes ?? '');
  const swipes = Array.isArray(message.swipes) && message.swipes.length > 0
    ? [...message.swipes]
    : [currentText];
  const safeSwipeId = Number.isInteger(message.swipe_id) ? Number(message.swipe_id) : 0;
  const swipeId = Math.min(Math.max(safeSwipeId, 0), swipes.length - 1);
  const swipeInfo = Array.isArray(message.swipe_info) ? [...message.swipe_info] : [];

  while (swipeInfo.length < swipes.length) {
    swipeInfo.push({});
  }

  if (!swipes[swipeId]) {
    swipes[swipeId] = currentText;
  }

  return {
    ...message,
    swipe_id: swipeId,
    swipes,
    swipe_info: swipeInfo,
    mes: swipes[swipeId] ?? currentText,
  };
}

function syncExtraToCurrentSwipe(message: ChatMessage, extra: Record<string, unknown>): ChatMessage {
  if (message.is_user || message.is_system) {
    return {
      ...message,
      extra: { ...extra },
    };
  }

  const ensured = ensureSwipeState(message);
  const swipeId = ensured.swipe_id ?? 0;
  const swipeInfo = Array.isArray(ensured.swipe_info) ? [...ensured.swipe_info] : [];
  while (swipeInfo.length < (ensured.swipes?.length ?? 0)) {
    swipeInfo.push({});
  }

  const currentSwipeInfo = asRecord(swipeInfo[swipeId]);
  swipeInfo[swipeId] = {
    ...currentSwipeInfo,
    extra: { ...extra },
  };

  return {
    ...ensured,
    extra: { ...extra },
    swipe_info: swipeInfo,
  };
}

function clearMessageRenderProjection(extra: Record<string, unknown>): Record<string, unknown> {
  const {
    display_text: _displayText,
    regex_display_text: _regexDisplayText,
    regex_prompt_text: _regexPromptText,
    regex_preset_hash: _regexPresetHash,
    regex_applied_rule_ids: _regexAppliedRuleIds,
    render_blocks: _renderBlocks,
    render_has_interactive_code: _renderHasInteractiveCode,
    ...rest
  } = extra;
  return rest;
}

export function replaceCurrentSwipeText(payload: ChatPayload, messageIndex: number, text: string): ChatPayload {
  return updateMessageRecord(payload, messageIndex, (record) => {
    const message = record as ChatMessage;
    if (message.is_user || message.is_system) {
      return { ...record, mes: text };
    }

    const ensured = ensureSwipeState({ ...message, mes: text });
    const swipeId = ensured.swipe_id ?? 0;
    ensured.swipes![swipeId] = text;
    ensured.mes = text;
    const currentExtra = clearMessageRenderProjection(asRecord(ensured.extra));
    const extra = {
      ...currentExtra,
      source_response_text: composeAssistantSourceContent(text, typeof currentExtra.reasoning === 'string' ? String(currentExtra.reasoning) : ''),
    };
    return { ...record, ...syncExtraToCurrentSwipe(ensured, extra) };
  });
}

export function appendContinuationToSwipe(payload: ChatPayload, messageIndex: number, chunk: string): ChatPayload {
  const current = getPayloadMessage(payload, messageIndex);
  const nextText = `${current?.mes ?? ''}${chunk}`;
  return replaceCurrentSwipeText(payload, messageIndex, nextText);
}

export function replaceMessageReasoning(payload: ChatPayload, messageIndex: number, reasoning: string, displayText?: string | null): ChatPayload {
  return updateMessageRecord(payload, messageIndex, (record) => {
    const message = record as ChatMessage;
    const extra = asRecord(message.extra);
    const nextExtra = {
      ...extra,
      reasoning,
      reasoning_display_text: displayText ?? extra.reasoning_display_text ?? 'Reasoning',
      source_response_text: message.is_user || message.is_system
        ? extra.source_response_text
        : composeAssistantSourceContent(String(message.mes ?? ''), reasoning),
    };
    return {
      ...record,
      ...syncExtraToCurrentSwipe(message, nextExtra),
    };
  });
}

export function appendReasoningToSwipe(payload: ChatPayload, messageIndex: number, chunk: string, displayText?: string | null): ChatPayload {
  const current = getPayloadMessage(payload, messageIndex);
  const currentExtra = current && current.extra && typeof current.extra === 'object' && !Array.isArray(current.extra)
    ? (current.extra as Record<string, unknown>)
    : {};
  const currentReasoning = typeof currentExtra.reasoning === 'string' ? currentExtra.reasoning : '';
  return replaceMessageReasoning(payload, messageIndex, `${currentReasoning}${chunk}`, displayText);
}

export function replaceMessageSourceResponse(payload: ChatPayload, messageIndex: number, sourceText: string): ChatPayload {
  return updateMessageRecord(payload, messageIndex, (record) => {
    const message = record as ChatMessage;
    const nextExtra = {
      ...asRecord(message.extra),
      source_response_text: String(sourceText ?? ''),
    };
    return {
      ...record,
      ...syncExtraToCurrentSwipe(message, nextExtra),
    };
  });
}

export function deleteMessage(payload: ChatPayload, messageIndex: number): ChatPayload {
  const nextPayload = clonePayload(payload);
  nextPayload.splice(messageIndex + 1, 1);
  return nextPayload;
}

export function cycleSwipe(payload: ChatPayload, messageIndex: number, direction: -1 | 1): ChatPayload {
  return updateMessageRecord(payload, messageIndex, (record) => {
    const message = ensureSwipeState(record as ChatMessage);
    const swipeCount = message.swipes?.length ?? 0;
    if (swipeCount <= 1) {
      return { ...record, ...message };
    }

    const nextSwipeId = ((message.swipe_id ?? 0) + direction + swipeCount) % swipeCount;
    return {
      ...record,
      ...message,
      swipe_id: nextSwipeId,
      mes: message.swipes?.[nextSwipeId] ?? message.mes,
      extra: message.swipe_info?.[nextSwipeId]?.extra ?? message.extra,
    };
  });
}

export function truncateTimelineForRegenerate(payload: ChatPayload, messageIndex: number): ChatPayload {
  const nextPayload = clonePayload(payload).slice(0, messageIndex + 2) as ChatPayload;
  return updateMessageRecord(nextPayload, messageIndex, (record) => {
    const message = ensureSwipeState(record as ChatMessage);
    const nextSwipeId = message.swipes!.length;
    return {
      ...record,
      ...message,
      swipes: [...message.swipes!, ''],
      swipe_info: [...(message.swipe_info ?? []), { extra: {} }],
      swipe_id: nextSwipeId,
      mes: '',
      extra: {},
    };
  });
}

export function appendAssistantPlaceholder(payload: ChatPayload, assistantName: string): { payload: ChatPayload; messageIndex: number } {
  const nextPayload = clonePayload(payload);
  const message = ensureSwipeState(createAssistantChatMessage(assistantName, ''));
  nextPayload.push(message);
  return {
    payload: nextPayload,
    messageIndex: getChatMessages(nextPayload).length - 1,
  };
}

