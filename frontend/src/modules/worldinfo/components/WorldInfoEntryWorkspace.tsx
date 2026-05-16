import { SearchField } from '@/shared/components/desktop/SearchField';
import { Button, Card, EmptyState, Select } from '@/shared/components/ui';
import { useMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import type { JSX } from 'solid-js';

import type { WorldInfoEntry } from '../editor-schema';
import type { WorldInfoEntrySort } from '../entry-summary';

import { WorldInfoEntryCard } from './WorldInfoEntryCard';

export function WorldInfoEntryWorkspace(props: {
  entries: WorldInfoEntry[];
  totalCount: number;
  search: string;
  sortBy: WorldInfoEntrySort;
  saveDirty?: boolean;
  savePending?: boolean;
  saveError?: string | null;
  onSearchChange: (value: string) => void;
  onSortChange: (value: WorldInfoEntrySort) => void;
  onOpenEntry: (uid: string) => void;
  onCreateEntry: () => void;
}): JSX.Element {
  let workspaceRef: HTMLDivElement | undefined;
  const hasFilter = () => props.search.trim().length > 0;
  const countSummary = () => (hasFilter()
    ? locale.worldInfo.filteredEntryCount.replace('{count}', String(props.entries.length)).replace('{total}', String(props.totalCount))
    : locale.worldInfo.entryCount.replace('{count}', String(props.totalCount)));

  const saveSummary = () => {
    if (props.saveError) {
      return props.saveError;
    }
    if (props.savePending) {
      return locale.worldInfo.savePending;
    }
    if (props.saveDirty) {
      return locale.worldInfo.saveDirty;
    }
    return locale.worldInfo.saveSynced;
  };

  useMotionMount(() => workspaceRef, 'page');

  return (
    <Card title={locale.worldInfo.entryWorkspaceTitle} subtitle={locale.worldInfo.entryWorkspaceHint}>
      <div ref={workspaceRef} class="flex flex-col gap-5">
        <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px_auto]">
          <SearchField value={props.search} onInput={(event) => props.onSearchChange(event.currentTarget.value)} placeholder={locale.worldInfo.searchEntries} />
          <Select value={props.sortBy} onChange={(event) => props.onSortChange(event.currentTarget.value as WorldInfoEntrySort)}>
            <option value="default">{locale.worldInfo.sortByDefault}</option>
            <option value="order">{locale.worldInfo.sortByOrder}</option>
            <option value="comment">{locale.worldInfo.sortByComment}</option>
            <option value="uid">{locale.worldInfo.sortByUid}</option>
          </Select>
          <div class="flex items-center justify-end gap-3">
            <div class={`text-sm ${props.saveError ? 'text-rose-600' : 'text-slate-500'}`}>{saveSummary()}</div>
            <Button onClick={props.onCreateEntry}>{locale.worldInfo.newEntry}</Button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div>{countSummary()}</div>
        </div>

        {props.entries.length > 0 ? (
          <div class="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {props.entries.map((entry) => (
              <WorldInfoEntryCard entry={entry} onOpen={() => props.onOpenEntry(String(entry.uid))} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={locale.worldInfo.noEntries}
            description={hasFilter() ? locale.worldInfo.noFilteredEntriesHint : locale.worldInfo.noEntriesHint}
            action={<Button onClick={props.onCreateEntry}>{locale.worldInfo.newEntry}</Button>}
          />
        )}
      </div>
    </Card>
  );
}
