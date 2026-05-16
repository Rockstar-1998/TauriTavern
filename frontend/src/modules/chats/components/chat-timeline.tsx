import { Index, Show, createMemo, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { isMobileLayout } from '@/shared/utils/platform';
import type { ChatMessage } from '@/types/domain';

import { resolveMessageRenderContent } from '../message-display';
import { resolveMultiplayerMessageMeta } from '../session-metadata';

import { MessageCard } from './message-card';

type EditingMessageState = {
  index: number;
  text: string;
} | null;

export function ChatTimeline(props: {
  messages: ChatMessage[];
  editingMessage: EditingMessageState;
  busy?: boolean;
  allowGenerateReply?: boolean;
  allowStopGenerate?: boolean;
  canLoadMoreBefore?: boolean;
  loadingMoreBefore?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
  onGenerateReply: () => void;
  onStop: () => void;
  onLoadMoreBefore?: () => void;
  onStartEdit: (index: number, message: ChatMessage) => void;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (index: number) => void;
  onWithdraw?: (index: number) => void;
  onRegenerate: (index: number) => void;
  onContinue: (index: number) => void;
  onPrevSwipe: (index: number) => void;
  onNextSwipe: (index: number) => void;
  interactivePreviewLimit?: number;
}): JSX.Element {
  let timelineRef: HTMLDivElement | undefined;
  const allowManualGenerate = () => props.allowGenerateReply ?? true;
  const allowStopGenerate = () => props.allowStopGenerate ?? props.allowGenerateReply ?? true;
  const latestInteractivePreviewIndex = createMemo(() => {
    if (!isMobileLayout()) {
      return -1;
    }

    for (let index = props.messages.length - 1; index >= 0; index -= 1) {
      const message = props.messages[index];
      if (message.is_user || message.is_system) {
        continue;
      }

      const rendered = resolveMessageRenderContent(message);
      if (rendered.renderHasInteractiveCode) {
        return index;
      }
    }

    return -1;
  });

  useMotionMount(() => timelineRef, 'page', { delay: 0.06 });

  return (
    <div ref={timelineRef} class={`flex h-full min-h-0 flex-1 flex-col gap-[var(--tt-renderer-message-gap,0.75rem)] overflow-y-auto py-1 ${props.class ?? ''}`.trim()} style={props.style}>
      <Show when={props.messages.length > 0} fallback={<div class="flex flex-1 items-center justify-center px-6 py-6 text-sm text-slate-500">{locale.chats.emptyMessages}</div>}>
        <Show when={props.canLoadMoreBefore}>
          <div class="flex justify-center pb-1">
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => props.onLoadMoreBefore?.()}
              disabled={props.loadingMoreBefore || props.busy}
            >
              {props.loadingMoreBefore ? 'Loading...' : 'Load Earlier Messages'}
            </button>
          </div>
        </Show>
        <Index each={props.messages}>
          {(message, index) => {
            const currentMessage = () => message();
            const isEditing = () => props.editingMessage?.index === index;
            const multiplayerMeta = () => resolveMultiplayerMessageMeta(currentMessage());
            const isLastMessage = () => index === props.messages.length - 1;
            const canContinue = () => !currentMessage().is_user && !currentMessage().is_system && index === props.messages.length - 1;
            const canRegenerate = () => !currentMessage().is_user && !currentMessage().is_system;
            const allowInteractivePreview = () => !isMobileLayout() || index === latestInteractivePreviewIndex();

            return (
              <MessageCard
                index={index}
                message={currentMessage()}
                isEditing={isEditing()}
                editingText={isEditing() ? props.editingMessage?.text ?? '' : ''}
                busy={props.busy}
                canContinue={canContinue()}
                isPending={Boolean(multiplayerMeta()?.pending)}
                showWithdraw={Boolean(multiplayerMeta()?.pending && props.onWithdraw)}
                showGenerateReply={allowManualGenerate() && isLastMessage() && !props.busy}
                showStopGenerate={allowStopGenerate() && isLastMessage() && Boolean(props.busy)}
                onStartEdit={() => props.onStartEdit(index, currentMessage())}
                onEditingTextChange={props.onEditingTextChange}
                onSaveEdit={props.onSaveEdit}
                onCancelEdit={props.onCancelEdit}
                onDelete={() => props.onDelete(index)}
                onWithdraw={props.onWithdraw ? () => props.onWithdraw?.(index) : undefined}
                onGenerateReply={() => props.onGenerateReply()}
                onStopGenerate={() => props.onStop()}
                onRegenerate={canRegenerate() ? () => props.onRegenerate(index) : undefined}
                onContinue={canContinue() ? () => props.onContinue(index) : undefined}
                onPrevSwipe={() => props.onPrevSwipe(index)}
                onNextSwipe={() => props.onNextSwipe(index)}
                interactivePreviewLimit={props.interactivePreviewLimit}
                allowInteractivePreview={allowInteractivePreview()}
              />
            );
          }}
        </Index>
      </Show>
    </div>
  );
}
