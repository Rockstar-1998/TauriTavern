import { ChevronLeft, ChevronRight, ChevronsRight, Pencil, Play, RefreshCcw, Square, Trash2, Undo2 } from 'lucide-solid';
import { For, Show, createMemo, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { Tag } from '@/shared/components/ui';
import { formatTimestamp } from '@/shared/utils/format';
import type { ChatMessage } from '@/types/domain';

import { MessageEditor } from './message-editor';
import { MessageContent } from '../renderers/message-content';
import { resolveMessageRenderContent } from '../message-display';

const WITHDRAW_LABEL = '撤回';

type ActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type MessageAction = {
  key: string;
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  variant?: ActionVariant;
};

function roleLabel(message: ChatMessage): string {
  if (message.is_system) {
    return locale.chats.messageRoleSystem;
  }
  return message.is_user ? locale.chats.messageRoleUser : locale.chats.messageRoleAssistant;
}

function messageDisplayName(message: ChatMessage): string {
  const name = String(message.name ?? '').trim();
  return name || roleLabel(message);
}

function avatarLabel(message: ChatMessage): string {
  const name = messageDisplayName(message);
  if (!name) {
    return roleLabel(message).slice(0, 1).toUpperCase();
  }

  if (/[\u3400-\u9fff]/.test(name)) {
    return name.slice(0, Math.min(2, name.length));
  }

  const words = name.split(/[\s_-]+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }

  return name.slice(0, 2).toUpperCase();
}

function avatarStyle(message: ChatMessage): JSX.CSSProperties {
  if (message.is_user) {
    return {
      background: 'linear-gradient(135deg, #34d399, #14b8a6)',
      color: '#ffffff',
      'box-shadow': '0 12px 30px rgba(20, 184, 166, 0.22)',
    };
  }

  if (message.is_system) {
    return {
      background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
      color: '#ffffff',
      'box-shadow': '0 10px 26px rgba(148, 163, 184, 0.20)',
    };
  }

  return {
    background: 'linear-gradient(135deg, #14b8a6, #38bdf8)',
    color: '#ffffff',
    'box-shadow': '0 12px 30px rgba(20, 184, 166, 0.24)',
  };
}

function titleStyle(message: ChatMessage): JSX.CSSProperties {
  if (message.is_user) {
    return { color: 'var(--tt-renderer-user-bg, #0f172a)' };
  }

  if (message.is_system) {
    return { color: 'var(--tt-renderer-system-fg, #475569)' };
  }

  return { color: 'var(--tt-renderer-assistant-fg, #0f172a)' };
}

function contentStyle(message: ChatMessage): JSX.CSSProperties {
  if (message.is_system) {
    return { color: 'var(--tt-renderer-system-fg, #475569)' };
  }

  return { color: 'rgba(15, 23, 42, 0.96)' };
}

function metaStyle(message: ChatMessage): JSX.CSSProperties {
  if (message.is_user) {
    return { color: 'rgba(15, 23, 42, 0.42)' };
  }

  if (message.is_system) {
    return { color: 'rgba(71, 85, 105, 0.72)' };
  }

  return { color: 'rgba(71, 85, 105, 0.78)' };
}

function systemContainerStyle(): JSX.CSSProperties {
  return {
    background: 'rgba(241, 245, 249, 0.66)',
    border: '1px solid var(--tt-renderer-system-border, rgba(148,163,184,0.22))',
    'box-shadow': '0 12px 30px rgba(15, 23, 42, 0.05)',
  };
}

function actionButtonClass(variant: ActionVariant | undefined): string {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-xs font-medium text-inherit transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40';

  switch (variant) {
    case 'danger':
      return `${base} text-rose-600`;
    case 'primary':
      return `${base} opacity-95`;
    case 'ghost':
      return `${base} opacity-65`;
    default:
      return `${base} opacity-80`;
  }
}

function renderRoleBadges(message: ChatMessage, isPending: boolean, swipeLabel: string | null): JSX.Element {
  return (
    <>
      <Show when={!message.is_user || message.is_system}>
        <Tag>{roleLabel(message)}</Tag>
      </Show>
      <Show when={isPending}>
        <Tag tone="danger">Pending</Tag>
      </Show>
      <Show when={swipeLabel}>
        <Tag>{swipeLabel}</Tag>
      </Show>
    </>
  );
}

export function MessageCard(props: {
  message: ChatMessage;
  index: number;
  isEditing: boolean;
  editingText: string;
  busy?: boolean;
  canContinue?: boolean;
  isPending?: boolean;
  showWithdraw?: boolean;
  showGenerateReply?: boolean;
  showStopGenerate?: boolean;
  onStartEdit: () => void;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onWithdraw?: () => void;
  onGenerateReply?: () => void;
  onStopGenerate?: () => void;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onPrevSwipe?: () => void;
  onNextSwipe?: () => void;
  interactivePreviewLimit?: number;
  allowInteractivePreview?: boolean;
}): JSX.Element {
  let cardRef: HTMLElement | undefined;
  const swipeCount = () => props.message.swipes?.length ?? 0;
  const swipeIndex = () => (props.message.swipe_id ?? 0) + 1;
  const swipeLabel = () => swipeCount() > 1 ? `${locale.chats.swipeLabel} ${swipeIndex()}/${swipeCount()}` : null;
  const withdrawOnly = () => Boolean(props.showWithdraw);
  const renderContent = createMemo(() => resolveMessageRenderContent(props.message));
  const displayName = () => messageDisplayName(props.message);
  const actions = createMemo<MessageAction[]>(() => {
    const items: Array<MessageAction | null> = [
      props.showGenerateReply && props.onGenerateReply
        ? {
            key: 'generate',
            label: locale.chats.generateReply,
            icon: <Play size={16} />,
            onClick: props.onGenerateReply,
            disabled: props.busy,
          }
        : null,
      props.showStopGenerate && props.onStopGenerate
        ? {
            key: 'stop',
            label: locale.chats.stopGeneration,
            icon: <Square size={16} />,
            onClick: props.onStopGenerate,
            variant: 'danger',
          }
        : null,
      props.showWithdraw && props.onWithdraw
        ? {
            key: 'withdraw',
            label: WITHDRAW_LABEL,
            icon: <Undo2 size={16} />,
            onClick: props.onWithdraw,
            disabled: props.busy,
          }
        : null,
      !withdrawOnly()
        ? {
            key: 'edit',
            label: locale.chats.editMessage,
            icon: <Pencil size={16} />,
            onClick: props.onStartEdit,
            disabled: props.busy || props.isEditing,
          }
        : null,
      !withdrawOnly()
        ? {
            key: 'delete',
            label: locale.common.delete,
            icon: <Trash2 size={16} />,
            onClick: props.onDelete,
            disabled: props.busy,
            variant: 'danger',
          }
        : null,
      props.onRegenerate && !withdrawOnly()
        ? {
            key: 'regenerate',
            label: locale.chats.regenerate,
            icon: <RefreshCcw size={16} />,
            onClick: props.onRegenerate,
            disabled: props.busy,
          }
        : null,
      props.canContinue && props.onContinue && !withdrawOnly()
        ? {
            key: 'continue',
            label: locale.chats.continueGenerate,
            icon: <ChevronsRight size={16} />,
            onClick: props.onContinue,
            disabled: props.busy,
          }
        : null,
      swipeCount() > 1 && props.onPrevSwipe && !withdrawOnly()
        ? {
            key: 'previous-swipe',
            label: locale.chats.previousSwipe,
            icon: <ChevronLeft size={16} />,
            onClick: props.onPrevSwipe,
            disabled: props.busy,
            variant: 'ghost',
          }
        : null,
      swipeCount() > 1 && props.onNextSwipe && !withdrawOnly()
        ? {
            key: 'next-swipe',
            label: locale.chats.nextSwipe,
            icon: <ChevronRight size={16} />,
            onClick: props.onNextSwipe,
            disabled: props.busy,
            variant: 'ghost',
          }
        : null,
    ];

    return items.filter((action): action is MessageAction => action !== null);
  });

  useMotionMount(() => cardRef, 'messageCard');

  const renderTimestamp = (className: string) => (
    <div class={className} style={metaStyle(props.message)}>
      <span>{formatTimestamp(props.message.send_date)}</span>
      <span>#{props.index + 1}</span>
    </div>
  );

  const renderActions = (className: string) => (
    <Show when={actions().length > 0}>
      <div class={className} style={metaStyle(props.message)}>
        <For each={actions()}>
          {(action) => (
            <button
              type="button"
              class={actionButtonClass(action.variant)}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.label}
              aria-label={action.label}
            >
              <span aria-hidden="true" class="inline-flex h-4 w-4 items-center justify-center">
                {action.icon}
              </span>
              <span>{action.label}</span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );

  const renderEditableContent = () => (
    <Show
      when={!props.isEditing}
      fallback={(
        <div class="rounded-[1.2rem] border border-slate-200/70 bg-white/70 p-4">
          <MessageEditor
            value={props.editingText}
            disabled={props.busy}
            onInput={props.onEditingTextChange}
            onSave={props.onSaveEdit}
            onCancel={props.onCancelEdit}
          />
        </div>
      )}
    >
      <MessageContent
        content={renderContent().content}
        reasoning={renderContent().reasoning}
        reasoningDisplayText={renderContent().reasoningDisplayText}
        renderBlocks={renderContent().renderBlocks}
        interactivePreviewLimit={props.interactivePreviewLimit}
        allowInteractivePreview={props.allowInteractivePreview}
      />
    </Show>
  );

  return (
    <article
      ref={cardRef}
      data-message-role={props.message.is_system ? 'system' : props.message.is_user ? 'user' : 'assistant'}
      class={props.message.is_system ? 'mx-auto w-full max-w-3xl' : 'w-full'}
    >
      <Show
        when={!props.message.is_system}
        fallback={(
          <div class="rounded-[1.4rem] px-5 py-4 text-center" style={systemContainerStyle()}>
            <div class="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
              <span class="font-semibold" style={titleStyle(props.message)}>{displayName()}</span>
              {renderRoleBadges(props.message, Boolean(props.isPending), swipeLabel())}
            </div>

            <div class="mt-3 text-[15px] leading-7" style={contentStyle(props.message)}>
              {renderEditableContent()}
            </div>

            {renderTimestamp('mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.16em]')}
            {renderActions('mt-4 flex flex-wrap justify-center gap-4')}
          </div>
        )}
      >
        <div class="flex items-start gap-4 md:gap-5">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold tracking-[0.04em]"
            style={avatarStyle(props.message)}
            aria-hidden="true"
          >
            {avatarLabel(props.message)}
          </div>

          <div class="min-w-0 flex-1 pt-1">
            <div class="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
              <span class="text-[1.05rem] font-semibold tracking-tight" style={titleStyle(props.message)}>{displayName()}</span>
              {renderRoleBadges(props.message, Boolean(props.isPending), swipeLabel())}
            </div>

            <div class="mt-3 min-w-0 text-[15px] leading-8" style={contentStyle(props.message)}>
              {renderEditableContent()}
            </div>

            {renderTimestamp('mt-4 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.16em]')}
            {renderActions('mt-3 flex flex-wrap items-center gap-x-4 gap-y-2')}
          </div>
        </div>
      </Show>
    </article>
  );
}
