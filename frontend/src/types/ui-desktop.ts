import type { JSX } from 'solid-js';

export type WorkspacePanelMode = 'welcome' | 'detail' | 'editing';
export type ModalSize = 'md' | 'lg' | 'xl';
export type ListItemTone = 'default' | 'active' | 'muted' | 'danger';

export type QuickAction = {
  label: string;
  description?: string;
  icon?: JSX.Element;
  action?: () => void;
};

export type ContextListItem = {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  badge?: string;
  tone?: ListItemTone;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  active?: boolean;
  onClick?: () => void;
};

export type ContextSectionGroup = {
  id: string;
  title: string;
  items: ContextListItem[];
};

export type WelcomeCardSpec = {
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
};
