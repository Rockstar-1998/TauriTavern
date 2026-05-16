import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { createAssistantChatMessage } from '@/lib/api/core-client';
import { locale } from '@/shared/i18n';

import { MessageCard } from './message-card';

describe('MessageCard', () => {
  it('renders swipe indicator and edit controls', async () => {
    const onStartEdit = vi.fn();
    render(() => (
      <MessageCard
        index={1}
        message={{ ...createAssistantChatMessage('Alice', 'hello'), swipes: ['hello', 'hello 2'], swipe_id: 1, swipe_info: [{}, {}] }}
        isEditing={false}
        editingText=""
        onStartEdit={onStartEdit}
        onEditingTextChange={() => undefined}
        onSaveEdit={() => undefined}
        onCancelEdit={() => undefined}
        onDelete={() => undefined}
        onRegenerate={() => undefined}
        onContinue={() => undefined}
        onPrevSwipe={() => undefined}
        onNextSwipe={() => undefined}
      />
    ));

    expect(screen.getByText(`${locale.chats.swipeLabel} 2/2`)).toBeTruthy();
    const editButton = screen.getByRole('button', { name: locale.chats.editMessage });
    expect(editButton.getAttribute('title')).toBe(locale.chats.editMessage);
    await fireEvent.click(editButton);
    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });

  it('shows generate reply only when requested', async () => {
    const onGenerateReply = vi.fn();
    render(() => (
      <MessageCard
        index={0}
        message={createAssistantChatMessage('Alice', 'hello')}
        isEditing={false}
        editingText=""
        showGenerateReply
        onGenerateReply={onGenerateReply}
        onStartEdit={() => undefined}
        onEditingTextChange={() => undefined}
        onSaveEdit={() => undefined}
        onCancelEdit={() => undefined}
        onDelete={() => undefined}
      />
    ));

    await fireEvent.click(screen.getByRole('button', { name: locale.chats.generateReply }));
    expect(onGenerateReply).toHaveBeenCalledTimes(1);
  });

  it('shows stop generation in place of generate when busy', () => {
    render(() => (
      <MessageCard
        index={0}
        message={createAssistantChatMessage('Alice', 'hello')}
        isEditing={false}
        editingText=""
        busy
        showStopGenerate
        onStopGenerate={() => undefined}
        onStartEdit={() => undefined}
        onEditingTextChange={() => undefined}
        onSaveEdit={() => undefined}
        onCancelEdit={() => undefined}
        onDelete={() => undefined}
      />
    ));

    expect(screen.getByRole('button', { name: locale.chats.stopGeneration })).toBeTruthy();
    expect(screen.queryByRole('button', { name: locale.chats.generateReply })).toBeNull();
  });
});
