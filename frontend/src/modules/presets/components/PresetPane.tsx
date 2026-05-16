import type { JSX } from 'solid-js';

import { ContextToolbar } from '@/app/layout/desktop/ContextToolbar';
import { SearchField } from '@/shared/components/desktop/SearchField';

import { formatSearchPlaceholder } from '../copy';
import type { PresetCatalogDefinition, PresetCatalogId } from '../registry';
import { PresetCatalogRail } from './PresetCatalogRail';
import { PresetListCard } from './PresetListCard';

export function PresetPane(props: {
  title: string;
  subtitle: string;
  railTitle: string;
  railMetaLabel: string;
  definitions: PresetCatalogDefinition[];
  activeCatalog: PresetCatalogDefinition;
  activeId: PresetCatalogId;
  search: string;
  names: string[];
  selectedName: string;
  actions?: JSX.Element;
  onSearchChange: (value: string) => void;
  onCatalogChange: (apiId: PresetCatalogId) => void;
  onSelect: (name: string) => void;
}): JSX.Element {
  const searchPlaceholder = () => formatSearchPlaceholder(props.activeCatalog.noun);

  return (
    <>
      <ContextToolbar
        title={props.title}
        subtitle={props.subtitle}
        search={<SearchField value={props.search} onInput={(event) => props.onSearchChange(event.currentTarget.value)} placeholder={searchPlaceholder()} />}
        actions={props.actions}
      />

      <div class="mt-6 space-y-4">
        <PresetCatalogRail
          title={props.railTitle}
          metaLabel={props.railMetaLabel}
          definitions={props.definitions}
          activeId={props.activeId}
          onSelect={props.onCatalogChange}
        />
        <div class="space-y-3">
          {props.names.map((name) => (
            <PresetListCard name={name} description={props.activeCatalog.label} selected={name === props.selectedName} onSelect={() => props.onSelect(name)} />
          ))}
        </div>
      </div>
    </>
  );
}
