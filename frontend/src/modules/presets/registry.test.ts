import { describe, expect, it } from 'vitest';

import { getPresetCatalogDefinition, getPresetCatalogDefinitionsByGroup, presetCatalogDefinitions, presetCatalogGroupOrder } from './registry';

describe('preset registry', () => {
  it('keeps the expected eight catalogs in desktop workbench order', () => {
    expect(presetCatalogDefinitions.map((definition) => definition.id)).toEqual([
      'openai',
      'kobold',
      'novel',
      'textgenerationwebui',
      'context',
      'instruct',
      'sysprompt',
      'reasoning',
    ]);
  });

  it('separates completion and advanced-formatting catalogs into grouped rails', () => {
    expect(presetCatalogGroupOrder).toEqual(['completion', 'advanced-formatting']);
    expect(getPresetCatalogDefinitionsByGroup('completion').map((definition) => definition.id)).toEqual([
      'openai',
      'kobold',
      'novel',
      'textgenerationwebui',
    ]);
    expect(getPresetCatalogDefinitionsByGroup('advanced-formatting').map((definition) => definition.id)).toEqual([
      'context',
      'instruct',
      'sysprompt',
      'reasoning',
    ]);
  });

  it('marks advanced-formatting catalogs with master tools support', () => {
    expect(getPresetCatalogDefinition('context').supportsMasterTools).toBe(true);
    expect(getPresetCatalogDefinition('instruct').supportsMasterTools).toBe(true);
    expect(getPresetCatalogDefinition('openai').supportsMasterTools).toBe(false);
    expect(getPresetCatalogDefinition('openai').supportsConnectionBinding).toBe(false);
    expect(getPresetCatalogDefinition('openai').supportsRestore).toBe(false);
    expect(getPresetCatalogDefinition('openai').group).toBe('completion');
    expect(getPresetCatalogDefinition('context').group).toBe('advanced-formatting');
  });

  it('keeps openai sections scoped to parameters and prompt manager', () => {
    const openaiSections = getPresetCatalogDefinition('openai').sections.map((section) => section.id);
    expect(openaiSections).toEqual(['parameters', 'prompt-manager']);
  });

  it('removes model/source fields from openai parameters', () => {
    const openaiFields = getPresetCatalogDefinition('openai').sections.flatMap((section) => section.fields).map((field) => field.id);
    expect(openaiFields).not.toContain('chat_completion_source');
    expect(openaiFields).not.toContain('openai_model');
    expect(openaiFields).not.toContain('claude_model');
    expect(openaiFields).not.toContain('openrouter_model');
    expect(openaiFields).not.toContain('reverse_proxy');
    expect(openaiFields).not.toContain('bind_preset_to_connection');
  });
});
