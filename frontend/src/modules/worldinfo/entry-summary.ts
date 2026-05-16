import type { WorldInfoEntry } from './editor-schema';

export type WorldInfoEntrySort = 'default' | 'order' | 'comment' | 'uid';

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function getWorldInfoEntryTitle(entry: WorldInfoEntry): string {
  const comment = compactText(entry.comment);
  if (comment) {
    return comment;
  }
  if (entry.key.length > 0) {
    return entry.key[0];
  }
  return `UID ${entry.uid}`;
}

export function getWorldInfoEntryKeywordSummary(entry: WorldInfoEntry): string {
  const primary = entry.key.join(', ');
  const secondary = entry.keysecondary.join(', ');
  if (primary && secondary) {
    return `${primary} · ${secondary}`;
  }
  return primary || secondary || '未设置关键词';
}

export function getWorldInfoEntryContentPreview(entry: WorldInfoEntry): string {
  const content = compactText(entry.content);
  return content || '未填写条目内容';
}

export function matchesWorldInfoEntry(entry: WorldInfoEntry, query: string): boolean {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  const haystack = [
    entry.comment,
    entry.content,
    entry.key.join(' '),
    entry.keysecondary.join(' '),
    entry.group,
    entry.outletName,
    String(entry.uid),
  ].join(' ').toLowerCase();

  return haystack.includes(keyword);
}

function compareDefault(left: WorldInfoEntry, right: WorldInfoEntry): number {
  return left.displayIndex - right.displayIndex || left.uid - right.uid;
}

export function sortWorldInfoEntries(entries: WorldInfoEntry[], sortBy: WorldInfoEntrySort): WorldInfoEntry[] {
  const next = [...entries];
  next.sort((left, right) => {
    if (sortBy === 'order') {
      return right.order - left.order || compareDefault(left, right);
    }
    if (sortBy === 'comment') {
      return getWorldInfoEntryTitle(left).localeCompare(getWorldInfoEntryTitle(right), 'zh-CN') || compareDefault(left, right);
    }
    if (sortBy === 'uid') {
      return left.uid - right.uid;
    }
    return compareDefault(left, right);
  });
  return next;
}
