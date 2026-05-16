import type { PresetApiId } from '@/types/domain';

export const completionPresetCatalogOrder = [
  'openai',
] as const satisfies readonly PresetApiId[];

export const advancedFormattingCatalogOrder = [
  'context',
  'instruct',
  'sysprompt',
  'reasoning',
] as const satisfies readonly PresetApiId[];

export type CompletionPresetCatalogId = (typeof completionPresetCatalogOrder)[number];
export type AdvancedFormattingCatalogId = (typeof advancedFormattingCatalogOrder)[number];

const completionPresetCatalogSet = new Set<CompletionPresetCatalogId>(completionPresetCatalogOrder);
const advancedFormattingCatalogSet = new Set<AdvancedFormattingCatalogId>(advancedFormattingCatalogOrder);

export function normalizePresetApiId(value?: string | null): CompletionPresetCatalogId {
  const normalized = String(value ?? '').trim().toLowerCase();
  return completionPresetCatalogSet.has(normalized as CompletionPresetCatalogId)
    ? (normalized as CompletionPresetCatalogId)
    : 'openai';
}

export function coerceAdvancedFormattingApiId(value?: string | null): AdvancedFormattingCatalogId | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return advancedFormattingCatalogSet.has(normalized as AdvancedFormattingCatalogId)
    ? (normalized as AdvancedFormattingCatalogId)
    : null;
}

export function buildPresetHref(apiId: string, selected?: string): string {
  const params = new URLSearchParams();
  params.set('apiId', normalizePresetApiId(apiId));
  const nextSelected = String(selected ?? '').trim();
  if (nextSelected) {
    params.set('selected', nextSelected);
  }
  return `/presets?${params.toString()}`;
}
