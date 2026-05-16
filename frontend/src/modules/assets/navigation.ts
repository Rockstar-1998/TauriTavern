export const assetPanelIds = ['backgrounds', 'avatars', 'themes'] as const;
export type AssetPanelId = (typeof assetPanelIds)[number];

export function normalizeAssetPanelId(value?: string | null): AssetPanelId {
  const normalized = String(value ?? '').trim();
  return assetPanelIds.includes(normalized as AssetPanelId) ? (normalized as AssetPanelId) : 'backgrounds';
}

export function buildAssetsMigrationHref(options?: { panel?: string | null; selected?: string | null }): string {
  const params = new URLSearchParams();
  params.set('panel', 'migration');
  params.set('tool', 'assets');
  params.set('assetPanel', normalizeAssetPanelId(options?.panel));

  const selected = String(options?.selected ?? '').trim();
  if (selected) {
    params.set('assetSelected', selected);
  }

  return `/workbench?${params.toString()}`;
}
