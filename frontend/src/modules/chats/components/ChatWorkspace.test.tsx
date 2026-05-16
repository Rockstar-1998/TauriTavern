import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { locale } from '@/shared/i18n';

import { ChatWorkspace } from './ChatWorkspace';

const TEST_TITLE = 'Test Character';

describe('ChatWorkspace', () => {
  it('renders glass overlays with title and send button', async () => {
    const onAppendUserMessage = vi.fn();
    const view = render(() => (
      <ChatWorkspace
        busy={false}
        generating={false}
        composer="hello"
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        onComposerChange={vi.fn()}
        onAppendUserMessage={onAppendUserMessage}
        onGenerateReply={vi.fn()}
        onStop={vi.fn()}
        onOpenWorldInfoBinding={vi.fn()}
        onOpenPresetBinding={vi.fn()}
        onOpenApiProfileBinding={vi.fn()}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    expect(screen.getByText(TEST_TITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: locale.chats.sendMessage })).toBeTruthy();
    expect(screen.getByRole('button', { name: locale.chats.workspaceMenu })).toBeTruthy();
    expect(screen.queryByText(locale.chats.addUserMessage)).toBeNull();
    expect(screen.queryByText(locale.chats.generateReply)).toBeNull();
    expect(view.container.querySelector('.tt-card-surface')).toBeNull();
    expect(view.container.querySelectorAll('.tt-chat-overlay-surface').length).toBe(2);

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.sendMessage }));
    expect(onAppendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('opens the top-right settings menu', async () => {
    const onOpenWorldInfoBinding = vi.fn();
    const onOpenPresetBinding = vi.fn();
    const onOpenApiProfileBinding = vi.fn();

    render(() => (
      <ChatWorkspace
        busy={false}
        generating={false}
        composer="hello"
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        onComposerChange={vi.fn()}
        onAppendUserMessage={vi.fn()}
        onGenerateReply={vi.fn()}
        onStop={vi.fn()}
        onOpenWorldInfoBinding={onOpenWorldInfoBinding}
        onOpenPresetBinding={onOpenPresetBinding}
        onOpenApiProfileBinding={onOpenApiProfileBinding}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.workspaceMenu }));
    await fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(locale.chats.bindWorldInfo) }));
    expect(onOpenWorldInfoBinding).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.workspaceMenu }));
    await fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(locale.chats.bindPreset) }));
    expect(onOpenPresetBinding).toHaveBeenCalledTimes(1);

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.workspaceMenu }));
    await fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(locale.chats.bindApiProfile) }));
    expect(onOpenApiProfileBinding).toHaveBeenCalledTimes(1);
  });

  it('disables the send button when composer is empty', () => {
    render(() => (
      <ChatWorkspace
        busy={false}
        generating={false}
        composer="   "
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        onComposerChange={vi.fn()}
        onAppendUserMessage={vi.fn()}
        onGenerateReply={vi.fn()}
        onStop={vi.fn()}
        onOpenWorldInfoBinding={vi.fn()}
        onOpenPresetBinding={vi.fn()}
        onOpenApiProfileBinding={vi.fn()}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    expect((screen.getByRole('button', { name: locale.chats.sendMessage }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows stop button while generating', async () => {
    const onStop = vi.fn();
    const view = render(() => (
      <ChatWorkspace
        busy
        generating
        composer="hello"
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        allowStopGenerate
        onComposerChange={vi.fn()}
        onAppendUserMessage={vi.fn()}
        onGenerateReply={vi.fn()}
        onStop={onStop}
        onOpenWorldInfoBinding={vi.fn()}
        onOpenPresetBinding={vi.fn()}
        onOpenApiProfileBinding={vi.fn()}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    const stopButton = screen.getByRole('button', { name: locale.chats.stopGeneration });
    expect(stopButton).toBeTruthy();
    await fireEvent.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('svg')).toBeTruthy();
  });

  it('calls fullscreen toggle from the top overlay button', async () => {
    const onToggleFullscreen = vi.fn();

    render(() => (
      <ChatWorkspace
        busy={false}
        generating={false}
        composer="hello"
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        onComposerChange={vi.fn()}
        onAppendUserMessage={vi.fn()}
        onGenerateReply={vi.fn()}
        onStop={vi.fn()}
        onOpenWorldInfoBinding={vi.fn()}
        onOpenPresetBinding={vi.fn()}
        onOpenApiProfileBinding={vi.fn()}
        onToggleFullscreen={onToggleFullscreen}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('renders token usage indicator when backend usage is available', () => {
    render(() => (
      <ChatWorkspace
        busy={false}
        generating={false}
        composer="hello"
        title={TEST_TITLE}
        messages={[]}
        editingMessage={null}
        worldInfoSummary={locale.chats.bindingNone}
        presetSummary={locale.chats.bindingNone}
        apiProfileSummary={locale.chats.bindingGlobalDefault}
        tokenUsage={{
          model: 'gpt-4.1-mini',
          promptTokens: 1024,
          maxContextTokens: 4096,
          remainingContextTokens: 3072,
          usageRatio: 0.25,
          withinLimit: true,
        }}
        onComposerChange={vi.fn()}
        onAppendUserMessage={vi.fn()}
        onGenerateReply={vi.fn()}
        onStop={vi.fn()}
        onOpenWorldInfoBinding={vi.fn()}
        onOpenPresetBinding={vi.fn()}
        onOpenApiProfileBinding={vi.fn()}
        onStartEdit={vi.fn()}
        onEditingTextChange={vi.fn()}
        onSaveEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onDeleteMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onContinue={vi.fn()}
        onPrevSwipe={vi.fn()}
        onNextSwipe={vi.fn()}
      />
    ));

    expect(screen.getByText(locale.chats.tokenUsageTitle)).toBeTruthy();
    expect(screen.getByText('1,024 / 4,096')).toBeTruthy();
    expect(screen.getByText(/剩余 3,072/)).toBeTruthy();
  });
});
