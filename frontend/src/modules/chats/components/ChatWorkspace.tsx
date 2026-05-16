import { ChevronLeft, Maximize2, Minimize2, SendHorizontal, Settings2, Square } from 'lucide-solid';
import { createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';

import { animatePreset, useMotionMount, usePressMotion } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import type { ChatMessage, TokenUsage } from '@/types/domain';

import { ChatTimeline } from './chat-timeline';

type EditingMessageState = {
  index: number;
  text: string;
} | null;

const MIN_COMPOSER_HEIGHT = 48;
const MAX_COMPOSER_HEIGHT = 220;
const TOP_OVERLAY_FALLBACK = 92;
const BOTTOM_OVERLAY_FALLBACK = 84;
const FULLSCREEN_LABEL = 'Fullscreen';
const EXIT_FULLSCREEN_LABEL = 'Exit Fullscreen';
const TOKEN_NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN');

function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return TOKEN_NUMBER_FORMATTER.format(Math.max(0, Math.round(value)));
}

function tokenUsageAccentColor(tokenUsage: TokenUsage | null | undefined): string {
  if (!tokenUsage) {
    return 'rgba(148, 163, 184, 0.55)';
  }
  if (!tokenUsage.withinLimit) {
    return '#e11d48';
  }
  if (tokenUsage.usageRatio >= 0.85) {
    return '#d97706';
  }
  return '#0f766e';
}

function tokenUsageTextClass(tokenUsage: TokenUsage | null | undefined): string {
  if (!tokenUsage) {
    return 'text-slate-500';
  }
  if (!tokenUsage.withinLimit) {
    return 'text-rose-600';
  }
  if (tokenUsage.usageRatio >= 0.85) {
    return 'text-amber-600';
  }
  return 'text-teal-700';
}

function tokenUsagePercentLabel(tokenUsage: TokenUsage | null | undefined): string {
  if (!tokenUsage || tokenUsage.maxContextTokens <= 0 || !Number.isFinite(tokenUsage.usageRatio)) {
    return '—';
  }
  return `${Math.max(0, Math.round(tokenUsage.usageRatio * 100))}%`;
}

function tokenUsagePrimaryText(tokenUsage: TokenUsage | null | undefined): string {
  if (!tokenUsage) {
    return locale.chats.tokenUsageUnknown;
  }
  if (tokenUsage.maxContextTokens <= 0) {
    return locale.chats.tokenUsageUnsetContext;
  }
  return `${formatTokenCount(tokenUsage.promptTokens)} / ${formatTokenCount(tokenUsage.maxContextTokens)}`;
}

function tokenUsageSecondaryText(tokenUsage: TokenUsage | null | undefined): string {
  if (!tokenUsage) {
    return '';
  }

  const model = tokenUsage.model.trim();
  if (tokenUsage.maxContextTokens <= 0) {
    return model;
  }

  const delta = tokenUsage.withinLimit
    ? tokenUsage.remainingContextTokens
    : Math.max(0, tokenUsage.promptTokens - tokenUsage.maxContextTokens);
  const text = (tokenUsage.withinLimit ? locale.chats.tokenUsageRemaining : locale.chats.tokenUsageExceeded)
    .replace('{count}', formatTokenCount(delta));
  return model ? `${text} · ${model}` : text;
}

function tokenUsageRingStyle(tokenUsage: TokenUsage | null | undefined): JSX.CSSProperties {
  const progress = !tokenUsage || tokenUsage.maxContextTokens <= 0 || !Number.isFinite(tokenUsage.usageRatio)
    ? 0
    : Math.max(0, Math.min(tokenUsage.usageRatio, 1));

  return {
    background: `conic-gradient(${tokenUsageAccentColor(tokenUsage)} ${Math.round(progress * 360)}deg, rgba(148,163,184,0.18) 0deg)`,
  };
}

export function ChatWorkspace(props: {
  busy: boolean;
  composer: string;
  title: string;
  messages: ChatMessage[];
  editingMessage: EditingMessageState;
  allowGenerateReply?: boolean;
  allowStopGenerate?: boolean;
  generating?: boolean;
  canLoadMoreBefore?: boolean;
  loadingMoreBefore?: boolean;
  worldInfoSummary: string;
  presetSummary: string;
  apiProfileSummary: string;
  roomSummary?: string;
  bindingReadOnly?: boolean;
  fullscreen?: boolean;
  rendererTheme?: Record<string, string | number>;
  blurEnabled?: boolean;
  blurPx?: number;
  animationMs?: number;
  interactivePreviewLimit?: number;
  tokenUsage?: TokenUsage | null;
  onComposerChange: (value: string) => void;
  onAppendUserMessage: () => void;
  onGenerateReply: () => void;
  onStop: () => void;
  onLoadMoreBefore?: () => void;
  onOpenWorldInfoBinding: () => void;
  onOpenPresetBinding: () => void;
  onOpenApiProfileBinding: () => void;
  onToggleFullscreen?: () => void;
  onOpenRoomPanel?: () => void;
  onStartEdit: (index: number, message: ChatMessage) => void;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteMessage: (index: number) => void;
  onWithdrawMessage?: (index: number) => void;
  onRegenerate: (index: number) => void;
  onContinue: (index: number) => void;
  onPrevSwipe: (index: number) => void;
  onNextSwipe: (index: number) => void;
  onBack?: () => void;
}): JSX.Element {
  let rootRef: HTMLDivElement | undefined;
  let composerRef: HTMLTextAreaElement | undefined;
  let topOverlayRef: HTMLDivElement | undefined;
  let bottomOverlayRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;
  let menuButtonRef: HTMLButtonElement | undefined;
  let fullscreenButtonRef: HTMLButtonElement | undefined;
  let sendButtonRef: HTMLButtonElement | undefined;

  const [menuOpen, setMenuOpen] = createSignal(false);
  const [topInset, setTopInset] = createSignal(TOP_OVERLAY_FALLBACK);
  const [bottomInset, setBottomInset] = createSignal(BOTTOM_OVERLAY_FALLBACK);
  const isGenerating = () => Boolean(props.generating);
  const sendDisabled = () => {
    if (isGenerating()) {
      return !props.allowStopGenerate;
    }
    return props.busy || !props.composer.trim();
  };

  function resizeComposer(): void {
    if (!composerRef) {
      return;
    }

    composerRef.style.height = `${MIN_COMPOSER_HEIGHT}px`;
    const nextHeight = Math.min(Math.max(composerRef.scrollHeight, MIN_COMPOSER_HEIGHT), MAX_COMPOSER_HEIGHT);
    composerRef.style.height = `${nextHeight}px`;
    composerRef.style.overflowY = composerRef.scrollHeight > MAX_COMPOSER_HEIGHT ? 'auto' : 'hidden';
  }

  function measureOverlays(): void {
    const nextTop = Math.max(topOverlayRef?.offsetHeight ?? 0, TOP_OVERLAY_FALLBACK);
    const nextBottom = Math.max(bottomOverlayRef?.offsetHeight ?? 0, BOTTOM_OVERLAY_FALLBACK);

    if (nextTop !== topInset()) {
      setTopInset(nextTop);
    }
    if (nextBottom !== bottomInset()) {
      setBottomInset(nextBottom);
    }
  }

  function closeMenu(): void {
    setMenuOpen(false);
  }

  useMotionMount(() => rootRef, 'page');
  useMotionMount(() => topOverlayRef, 'panel', { delay: 0.04 });
  useMotionMount(() => bottomOverlayRef, 'panel', { delay: 0.08 });
  usePressMotion(() => menuButtonRef);
  usePressMotion(() => fullscreenButtonRef);
  usePressMotion(() => sendButtonRef);

  function runMenuAction(action: () => void): void {
    closeMenu();
    action();
  }

  createEffect(() => {
    props.composer;
    resizeComposer();
  });

  createEffect(() => {
    measureOverlays();

    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (!ResizeObserverCtor || !topOverlayRef || !bottomOverlayRef) {
      return;
    }

    const observer = new ResizeObserverCtor(() => measureOverlays());
    observer.observe(topOverlayRef);
    observer.observe(bottomOverlayRef);

    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    if (!menuOpen()) {
      return;
    }

    queueMicrotask(() => {
      void animatePreset(menuRef, 'menu');
    });

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef?.contains(target ?? null) || menuButtonRef?.contains(target ?? null)) {
        return;
      }
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  const timelineStyle = () => ({
    'padding-top': `${topInset() + 14}px`,
    'padding-bottom': `${bottomInset() + 18}px`,
  });
  const workspaceStyle = (): JSX.CSSProperties => {
    const theme = props.rendererTheme ?? {};
    const style: JSX.CSSProperties = {
      '--tt-renderer-message-gap': typeof theme.message_gap === 'number' ? `${theme.message_gap}px` : String(theme.message_gap ?? '0.75rem'),
      '--tt-renderer-user-bg': String(theme.user_bg ?? '#0f172a'),
      '--tt-renderer-user-fg': String(theme.user_fg ?? '#ffffff'),
      '--tt-renderer-assistant-bg': String(theme.assistant_bg ?? '#dce4ea'),
      '--tt-renderer-assistant-fg': String(theme.assistant_fg ?? '#0f172a'),
      '--tt-renderer-system-bg': String(theme.system_bg ?? '#f1f5f9'),
      '--tt-renderer-system-fg': String(theme.system_fg ?? '#475569'),
      '--tt-renderer-system-border': String(theme.system_border ?? 'rgba(148,163,184,0.28)'),
      '--tt-renderer-reasoning-bg': String(theme.reasoning_bg ?? 'rgba(255,255,255,0.42)'),
      '--tt-renderer-reasoning-border': String(theme.reasoning_border ?? 'rgba(148,163,184,0.28)'),
      '--tt-renderer-reasoning-label': String(theme.reasoning_label ?? 'rgba(71,85,105,0.92)'),
      '--tt-renderer-code-bg': String(theme.code_bg ?? 'rgba(2, 6, 23, 0.92)'),
      '--tt-renderer-code-fg': String(theme.code_fg ?? '#f8fafc'),
      '--tt-renderer-code-border': String(theme.code_border ?? 'rgba(255,255,255,0.08)'),
      '--tt-renderer-code-label': String(theme.code_label ?? 'rgba(226,232,240,0.88)'),
      'font-family': typeof theme.font_family === 'string' && theme.font_family.trim() ? theme.font_family : undefined,
    };

    return style;
  };
  const overlayStyle = (): JSX.CSSProperties => ({
    'backdrop-filter': props.blurEnabled === false ? undefined : `blur(${props.blurPx ?? 16}px)`,
    'transition-duration': `${props.animationMs ?? 180}ms`,
  });

  return (
    <div ref={rootRef} class="relative flex h-full min-h-0 flex-col overflow-hidden" style={workspaceStyle()}>
      <div class="min-h-0 flex-1 overflow-hidden">
        <ChatTimeline
          class="mx-auto w-full max-w-[min(100%,96rem)] px-4 md:px-6 lg:px-8"
          style={timelineStyle()}
          messages={props.messages}
          editingMessage={props.editingMessage}
          busy={props.busy}
          allowGenerateReply={props.allowGenerateReply}
          allowStopGenerate={props.allowStopGenerate}
          canLoadMoreBefore={props.canLoadMoreBefore}
          loadingMoreBefore={props.loadingMoreBefore}
          onGenerateReply={props.onGenerateReply}
          onStop={props.onStop}
          onLoadMoreBefore={props.onLoadMoreBefore}
          onStartEdit={props.onStartEdit}
          onEditingTextChange={props.onEditingTextChange}
          onSaveEdit={props.onSaveEdit}
          onCancelEdit={props.onCancelEdit}
          onDelete={props.onDeleteMessage}
          onWithdraw={props.onWithdrawMessage}
          onRegenerate={props.onRegenerate}
          onContinue={props.onContinue}
          onPrevSwipe={props.onPrevSwipe}
          onNextSwipe={props.onNextSwipe}
          interactivePreviewLimit={props.interactivePreviewLimit}
        />
      </div>

      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-3">
        <div ref={topOverlayRef} class="tt-chat-overlay-surface pointer-events-auto relative flex items-center justify-between gap-4 rounded-[1.8rem] px-5 py-4" style={overlayStyle()}>
          <div class="min-w-0 flex items-center">
            <Show when={props.onBack}>
              <button
                type="button"
                class="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                onClick={() => props.onBack?.()}
                aria-label="Back"
              >
                <ChevronLeft size={20} />
              </button>
            </Show>
            <h2 class="truncate text-[1.75rem] font-semibold tracking-tight text-slate-900" title={props.title}>{props.title}</h2>
          </div>

          <div class="relative shrink-0">
            <div class="flex items-center gap-2">
              <div
                class="flex items-center gap-2 rounded-[1.4rem] bg-white/55 px-2.5 py-2"
                title={`${locale.chats.tokenUsageTitle} · ${tokenUsagePrimaryText(props.tokenUsage)}${tokenUsageSecondaryText(props.tokenUsage) ? ` · ${tokenUsageSecondaryText(props.tokenUsage)}` : ''}`}
              >
                <div class="relative h-11 w-11 shrink-0 rounded-full p-[3px]" style={tokenUsageRingStyle(props.tokenUsage)}>
                  <div class={`flex h-full w-full items-center justify-center rounded-full bg-white/85 text-[0.7rem] font-semibold ${tokenUsageTextClass(props.tokenUsage)}`}>
                    {tokenUsagePercentLabel(props.tokenUsage)}
                  </div>
                </div>
                <div class="hidden min-w-0 md:block">
                  <div class="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-slate-500">{locale.chats.tokenUsageTitle}</div>
                  <div class={`text-sm font-semibold ${tokenUsageTextClass(props.tokenUsage)}`}>{tokenUsagePrimaryText(props.tokenUsage)}</div>
                  <div class="max-w-[220px] truncate text-xs text-slate-500">{tokenUsageSecondaryText(props.tokenUsage)}</div>
                </div>
              </div>
              <Show when={props.onToggleFullscreen}>
                <button
                  ref={fullscreenButtonRef}
                  type="button"
                  class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/55 text-slate-700 transition hover:bg-white/80"
                  title={props.fullscreen ? EXIT_FULLSCREEN_LABEL : FULLSCREEN_LABEL}
                  aria-label={props.fullscreen ? EXIT_FULLSCREEN_LABEL : FULLSCREEN_LABEL}
                  onClick={() => props.onToggleFullscreen?.()}
                >
                  {props.fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </Show>

              <button
                ref={menuButtonRef}
                type="button"
                class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/55 text-slate-700 transition hover:bg-white/80"
                title={locale.chats.workspaceMenu}
                aria-label={locale.chats.workspaceMenu}
                aria-expanded={menuOpen()}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <Settings2 size={18} />
              </button>
            </div>

            <Show when={menuOpen()}>
              <div ref={menuRef} role="menu" class="tt-chat-overlay-menu absolute right-0 top-[calc(100%+0.75rem)] z-30 flex w-72 flex-col gap-1 rounded-[1.4rem] p-2">
                <button
                  type="button"
                  role="menuitem"
                  class="rounded-[1rem] px-3 py-2.5 text-left transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => runMenuAction(props.onOpenWorldInfoBinding)}
                  disabled={props.bindingReadOnly}
                >
                  <div class="text-sm font-medium text-slate-800">{locale.chats.bindWorldInfo}</div>
                  <div class="mt-1 text-xs text-slate-500">{props.worldInfoSummary}</div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="rounded-[1rem] px-3 py-2.5 text-left transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => runMenuAction(props.onOpenPresetBinding)}
                  disabled={props.bindingReadOnly}
                >
                  <div class="text-sm font-medium text-slate-800">{locale.chats.bindPreset}</div>
                  <div class="mt-1 text-xs text-slate-500">{props.presetSummary}</div>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  class="rounded-[1rem] px-3 py-2.5 text-left transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => runMenuAction(props.onOpenApiProfileBinding)}
                  disabled={props.bindingReadOnly}
                >
                  <div class="text-sm font-medium text-slate-800">{locale.chats.bindApiProfile}</div>
                  <div class="mt-1 text-xs text-slate-500">{props.apiProfileSummary}</div>
                </button>
                <Show when={props.onOpenRoomPanel}>
                  <button
                    type="button"
                    role="menuitem"
                    class="rounded-[1rem] px-3 py-2.5 text-left transition hover:bg-white/70"
                    onClick={() => runMenuAction(() => props.onOpenRoomPanel?.())}
                  >
                    <div class="text-sm font-medium text-slate-800">联机房间</div>
                    <div class="mt-1 text-xs text-slate-500">{props.roomSummary ?? '查看当前房间状态'}</div>
                  </button>
                </Show>
                <Show when={props.bindingReadOnly}>
                  <div class="rounded-[1rem] px-3 py-2 text-xs text-slate-500">{locale.chats.bindingReadOnly}</div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3">
        <div ref={bottomOverlayRef} class="tt-chat-overlay-surface pointer-events-auto rounded-[1.8rem] px-3 py-2.5" style={overlayStyle()}>
          <div class="flex items-end gap-3">
            <textarea
              ref={composerRef}
              rows={1}
              value={props.composer}
              onInput={(event) => props.onComposerChange(event.currentTarget.value)}
              class="min-h-12 max-h-[220px] w-full flex-1 resize-none bg-transparent px-2 py-[0.7rem] text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              placeholder={locale.chats.composerPlaceholder}
              disabled={props.busy}
            />
            <button
              ref={sendButtonRef}
              type="button"
              class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={isGenerating() ? props.onStop : props.onAppendUserMessage}
              disabled={sendDisabled()}
              title={isGenerating() ? locale.chats.stopGeneration : locale.chats.sendMessage}
              aria-label={isGenerating() ? locale.chats.stopGeneration : locale.chats.sendMessage}
            >
              {isGenerating() ? <Square size={18} /> : <SendHorizontal size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
