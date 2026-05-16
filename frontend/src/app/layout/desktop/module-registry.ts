import { locale } from '@/shared/i18n';
import type { Component } from 'solid-js';
import { BookOpenText, FolderKanban, MessageSquare, Settings2, SlidersHorizontal, UserRound } from 'lucide-solid';

const PRESETS_LABEL = '对话补全预设';
const NEW_PRESET_LABEL = '新建预设';

export type DesktopModuleId = 'chats' | 'characters' | 'settings' | 'presets' | 'world-info' | 'workbench';

export type DesktopModuleDefinition = {
  id: DesktopModuleId;
  href: string;
  label: string;
  paneTitle: string;
  supportsSearch: boolean;
  fabAction: string;
  icon: Component<{ class?: string; size?: number | string; strokeWidth?: number | string }>;
};

export const desktopModules: DesktopModuleDefinition[] = [
  { id: 'chats', href: '/chats', label: locale.modules.chats, paneTitle: locale.modules.chats, supportsSearch: true, fabAction: locale.chats.newChat, icon: MessageSquare },
  { id: 'characters', href: '/characters', label: locale.modules.characters, paneTitle: locale.modules.characters, supportsSearch: true, fabAction: locale.characters.createCharacter, icon: UserRound },
  { id: 'settings', href: '/settings', label: locale.modules.settings, paneTitle: locale.modules.settings, supportsSearch: false, fabAction: locale.common.edit, icon: Settings2 },
  { id: 'presets', href: '/presets', label: PRESETS_LABEL, paneTitle: PRESETS_LABEL, supportsSearch: true, fabAction: NEW_PRESET_LABEL, icon: SlidersHorizontal },
  { id: 'world-info', href: '/world-info', label: locale.modules.worldInfo, paneTitle: locale.modules.worldInfo, supportsSearch: true, fabAction: locale.worldInfo.createBook, icon: BookOpenText },
  { id: 'workbench', href: '/workbench', label: locale.modules.workbench, paneTitle: locale.modules.workbench, supportsSearch: false, fabAction: locale.common.open, icon: FolderKanban },
];

export function resolveDesktopModuleId(pathname: string): DesktopModuleId {
  if (pathname.startsWith('/characters')) return 'characters';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/presets')) return 'presets';
  if (pathname.startsWith('/assets')) return 'workbench';
  if (pathname.startsWith('/world-info')) return 'world-info';
  if (pathname.startsWith('/workbench')) return 'workbench';
  return 'chats';
}

export function findDesktopModule(pathname: string): DesktopModuleDefinition {
  return desktopModules.find((item) => item.id === resolveDesktopModuleId(pathname)) ?? desktopModules[0];
}

