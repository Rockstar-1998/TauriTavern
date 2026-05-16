import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';

import { ActionIconButton, Card, Input } from './ui';

describe('shared UI surfaces', () => {
  it('uses semantic card and input surface classes', () => {
    const view = render(() => (
      <div>
        <Card title="Test">body</Card>
        <Input value="hello" />
      </div>
    ));

    expect(view.container.querySelector('.tt-card-surface')).toBeTruthy();
    expect(view.container.querySelector('.tt-input-surface')).toBeTruthy();
  });

  it('renders action icon buttons with accessible labels and native titles', () => {
    render(() => <ActionIconButton label="Edit message" icon={<span>*</span>} />);

    const button = screen.getByRole('button', { name: 'Edit message' });
    expect(button.getAttribute('title')).toBe('Edit message');
  });
});
