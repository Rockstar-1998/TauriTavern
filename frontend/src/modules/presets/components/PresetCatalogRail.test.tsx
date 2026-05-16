import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it, vi } from 'vitest';

import { completionPresetCatalogDefinitions } from '../registry';
import { PresetCatalogRail } from './PresetCatalogRail';

describe('PresetCatalogRail', () => {
  it('renders only completion engine buttons for the main presets rail', () => {
    const onSelect = vi.fn();

    render(() => (
      <PresetCatalogRail
        title="补全引擎"
        metaLabel="补全格式"
        definitions={completionPresetCatalogDefinitions}
        activeId="openai"
        onSelect={onSelect}
      />
    ));

    expect(screen.getByText('补全引擎')).toBeTruthy();
    expect(screen.getByRole('button', { name: /OpenAI/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: /Kobold/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Novel/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Text Generation WebUI/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Context/i })).toBeNull();
  });
});

