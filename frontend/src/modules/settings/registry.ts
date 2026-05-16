import {
  BadgeInfo,
  History,
  KeyRound,
  Palette,
  Settings2,
} from 'lucide-solid';
import type { Component } from 'solid-js';

import { locale } from '@/shared/i18n';

export type SettingsPanelId =
  | 'system'
  | 'api-profiles'
  | 'secrets'
  | 'snapshots'
  | 'appearance';

export type SettingsSectionMap = {
  system: 'general' | 'raw-json';
  'api-profiles': 'profiles';
  secrets: 'write' | 'state';
  snapshots: 'library';
  appearance: 'desktop-theme' | 'window-material' | 'renderers';
};

export type SettingsSectionId = SettingsSectionMap[SettingsPanelId];

export type SettingsSectionDefinition = {
  id: string;
  title: string;
  description: string;
};

export type SettingsPanelDefinition = {
  id: SettingsPanelId;
  title: string;
  description: string;
  icon: Component<{ size?: number; class?: string }>;
  defaultSection: string;
  sections: readonly SettingsSectionDefinition[];
};

export const SETTINGS_PANEL_REGISTRY: readonly SettingsPanelDefinition[] = [
  {
    id: 'system',
    title: locale.settings.groups.system,
    description: locale.settings.systemPanelDescription,
    icon: Settings2,
    defaultSection: 'general',
    sections: [
      { id: 'general', title: locale.settings.generalSection, description: locale.settings.systemOverview },
      { id: 'raw-json', title: locale.settings.rawJsonSection, description: locale.settings.systemJson },
    ],
  },
  {
    id: 'api-profiles',
    title: locale.settings.groups.apiProfiles,
    description: locale.settings.apiProfilesHint,
    icon: BadgeInfo,
    defaultSection: 'profiles',
    sections: [
      { id: 'profiles', title: locale.settings.apiProfilesTitle, description: locale.settings.profileSummary },
    ],
  },
  {
    id: 'secrets',
    title: locale.settings.groups.secrets,
    description: locale.settings.secretsPanelDescription,
    icon: KeyRound,
    defaultSection: 'write',
    sections: [
      { id: 'write', title: locale.settings.writeSecretSection, description: locale.settings.secretsPanelDescription },
      { id: 'state', title: locale.settings.secretStateSection, description: locale.settings.secretState },
    ],
  },
  {
    id: 'snapshots',
    title: locale.settings.groups.snapshots,
    description: locale.settings.snapshotsPanelDescription,
    icon: History,
    defaultSection: 'library',
    sections: [
      { id: 'library', title: locale.settings.snapshotLibrarySection, description: locale.settings.snapshotSummary },
    ],
  },
  {
    id: 'appearance',
    title: locale.settings.groups.appearance,
    description: locale.settings.appearanceHint,
    icon: Palette,
    defaultSection: 'desktop-theme',
    sections: [
      { id: 'desktop-theme', title: locale.settings.desktopThemeSection, description: locale.settings.appearanceHint },
      { id: 'window-material', title: locale.settings.windowMaterialSection, description: locale.settings.appearanceHint },
      { id: 'renderers', title: 'Renderers', description: 'Renderer defaults, package import, and mobile policy.' },
    ],
  },
] as const;

const panelRegistryMap = new Map<SettingsPanelId, SettingsPanelDefinition>(
  SETTINGS_PANEL_REGISTRY.map((panel) => [panel.id, panel]),
);

export const DEFAULT_SETTINGS_PANEL_ID: SettingsPanelId = SETTINGS_PANEL_REGISTRY[0].id;

export function getPanelDefinition(panel: SettingsPanelId): SettingsPanelDefinition {
  const definition = panelRegistryMap.get(panel);
  if (!definition) {
    throw new Error(`Unknown settings panel: ${panel}`);
  }

  return definition;
}

export function getDefaultSection(panel: SettingsPanelId): string {
  return getPanelDefinition(panel).defaultSection;
}

export function isValidPanel(panel: string | undefined): panel is SettingsPanelId {
  return Boolean(panel && panelRegistryMap.has(panel as SettingsPanelId));
}

export function isValidSection(panel: SettingsPanelId, section: string | undefined): boolean {
  if (!section) {
    return false;
  }

  return getPanelDefinition(panel).sections.some((item) => item.id === section);
}

export function getSectionDefinition(panel: SettingsPanelId, section: string): SettingsSectionDefinition {
  const definition = getPanelDefinition(panel).sections.find((item) => item.id === section);
  if (!definition) {
    throw new Error(`Unknown settings section: ${panel}/${section}`);
  }

  return definition;
}
