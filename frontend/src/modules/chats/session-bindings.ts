import { coreApiClient } from '@/lib/api/core-client';
import {
  type ApiProfile,
  type AppSettings,
  type SessionBindings,
} from '@/types/domain';

import { getPresetCatalogAdapter } from '@/modules/presets/catalog-adapters';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stripJsonSuffix(name: string): string {
  return name.replace(/\.json$/i, '');
}

type ResolvedPresetResult = {
  name: string;
  preset: Record<string, unknown>;
  normalizedFrom?: string;
  normalizedReason?: 'strip_extension' | 'case_insensitive' | 'canonical';
  restoredDefault?: boolean;
};

function canonicalPresetName(name: string): string {
  const unsafe = '/\\:*?"<>|';
  return Array.from(String(name ?? ''))
    .map((char) => {
      if (unsafe.includes(char)) {
        return '_';
      }
      if (char === '-' || char === '_' || char === '.' || char === ' ') {
        return char;
      }
      if (/\p{L}|\p{N}/u.test(char)) {
        return char;
      }
      return '_';
    })
    .join('')
    .trim();
}

async function fetchPresetByName(name: string): Promise<Record<string, unknown> | null> {
  const restored = await coreApiClient.presets.get('openai', name);
  const preset = asRecord(restored);

  if (!restored || Object.keys(preset).length === 0) {
    return null;
  }

  const adapter = getPresetCatalogAdapter('openai');
  return adapter.normalizeRestoredPreset(preset);
}

async function restoreDefaultPreset(name: string): Promise<Record<string, unknown> | null> {
  const restored = await coreApiClient.presets.restore('openai', name);
  if (!restored.isDefault || Object.keys(restored.preset ?? {}).length === 0) {
    return null;
  }

  const adapter = getPresetCatalogAdapter('openai');
  return adapter.normalizeRestoredPreset(restored.preset);
}

function findCaseInsensitiveMatch(name: string, candidates: string[]): string | null {
  const target = name.toLowerCase();
  const matches = candidates.filter((candidate) => candidate.toLowerCase() === target);
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

function findCanonicalMatch(name: string, candidates: string[]): string | null {
  const target = canonicalPresetName(name).toLowerCase();
  if (!target) {
    return null;
  }
  const matches = candidates.filter((candidate) => canonicalPresetName(candidate).toLowerCase() === target);
  if (matches.length === 1) {
    return matches[0];
  }
  return null;
}

export function getApiProfiles(settings: AppSettings | undefined): ApiProfile[] {
  return settings?.api_profiles ?? [];
}

export function findApiProfile(settings: AppSettings | undefined, id: string | null | undefined): ApiProfile | null {
  const target = String(id ?? '').trim();
  if (!target) {
    return null;
  }

  return getApiProfiles(settings).find((profile) => profile.id === target) ?? null;
}

export async function resolveBoundPreset(
  bindings: SessionBindings,
  availablePresetNames?: string[],
): Promise<ResolvedPresetResult | null> {
  const presetName = String(bindings.preset_ref?.name ?? '').trim();
  if (!presetName) {
    return null;
  }

  const directPreset = await fetchPresetByName(presetName);
  if (directPreset) {
    return {
      name: presetName,
      preset: directPreset,
    };
  }

  const strippedName = stripJsonSuffix(presetName);
  if (strippedName && strippedName !== presetName) {
    const strippedPreset = await fetchPresetByName(strippedName);
    if (strippedPreset) {
      return {
        name: strippedName,
        preset: strippedPreset,
        normalizedFrom: presetName,
        normalizedReason: 'strip_extension',
      };
    }

    const restoredPreset = await restoreDefaultPreset(strippedName);
    if (restoredPreset) {
      return {
        name: strippedName,
        preset: restoredPreset,
        normalizedFrom: presetName,
        normalizedReason: 'strip_extension',
        restoredDefault: true,
      };
    }
  }

  const canonicalName = canonicalPresetName(presetName);
  if (canonicalName && canonicalName !== presetName) {
    const canonicalPreset = await fetchPresetByName(canonicalName);
    if (canonicalPreset) {
      return {
        name: canonicalName,
        preset: canonicalPreset,
        normalizedFrom: presetName,
        normalizedReason: 'canonical',
      };
    }

    const canonicalDefault = await restoreDefaultPreset(canonicalName);
    if (canonicalDefault) {
      return {
        name: canonicalName,
        preset: canonicalDefault,
        normalizedFrom: presetName,
        normalizedReason: 'canonical',
        restoredDefault: true,
      };
    }
  }

  const restoredDefault = await restoreDefaultPreset(presetName);
  if (restoredDefault) {
    return {
      name: presetName,
      preset: restoredDefault,
      restoredDefault: true,
    };
  }

  let candidateNames = availablePresetNames;
  if (!candidateNames) {
    candidateNames = await coreApiClient.presets.list('openai');
  }
  let match = findCaseInsensitiveMatch(presetName, candidateNames);
  let canonicalMatch: string | null = null;
  if (!match) {
    canonicalMatch = findCanonicalMatch(presetName, candidateNames);
  }
  if (!match && availablePresetNames) {
    const refreshed = await coreApiClient.presets.list('openai');
    match = findCaseInsensitiveMatch(presetName, refreshed);
    if (!match) {
      canonicalMatch = findCanonicalMatch(presetName, refreshed);
    }
  }

  const resolvedMatch = match ?? canonicalMatch;
  if (resolvedMatch && resolvedMatch !== presetName) {
    const matchedPreset = await fetchPresetByName(resolvedMatch);
    if (matchedPreset) {
      return {
        name: resolvedMatch,
        preset: matchedPreset,
        normalizedFrom: presetName,
        normalizedReason: match ? 'case_insensitive' : 'canonical',
      };
    }
  }

  throw new Error('preset_not_found');
}

