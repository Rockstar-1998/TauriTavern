import { describe, expect, it } from 'vitest';

import { buildAssetsMigrationHref, normalizeAssetPanelId } from './navigation';

describe('asset navigation helpers', () => {
  it('normalizes asset panels', () => {
    expect(normalizeAssetPanelId(undefined)).toBe('backgrounds');
    expect(normalizeAssetPanelId('themes')).toBe('themes');
    expect(normalizeAssetPanelId('invalid')).toBe('backgrounds');
  });

  it('builds the workbench migration redirect href', () => {
    expect(buildAssetsMigrationHref({ panel: 'avatars', selected: 'hero.png' })).toBe('/workbench?panel=migration&tool=assets&assetPanel=avatars&assetSelected=hero.png');
    expect(buildAssetsMigrationHref()).toBe('/workbench?panel=migration&tool=assets&assetPanel=backgrounds');
  });
});
