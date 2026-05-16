import { For, Show, type JSX } from 'solid-js';

import { useMotionMount } from '@/shared/motion/runtime';
import { Button, Card, EmptyState } from '@/shared/components/ui';

import { PRESET_COPY, formatCatalogSubtitle } from '../copy';
import type { PresetCatalogDefinition } from '../registry';
import { PresetHeader } from './PresetHeader';
import { PresetSectionCard } from './PresetSectionCard';

function UtilityCard(props: { title: string; description: string; onOpen: () => void }): JSX.Element {
  let cardRef: HTMLButtonElement | undefined;
  useMotionMount(() => cardRef, 'card');

  return (
    <button ref={cardRef} type="button" class="tt-card-surface rounded-[1.8rem] px-5 py-5 text-left transition hover:-translate-y-[1px] hover:bg-slate-50" onClick={props.onOpen}>
      <div class="text-base font-semibold text-slate-900">{props.title}</div>
      <div class="mt-2 text-sm text-slate-500">{props.description}</div>
    </button>
  );
}

export function PresetWorkspace(props: {
  catalog: PresetCatalogDefinition;
  selectedName?: string;
  hasSelection: boolean;
  loading: boolean;
  dirty: boolean;
  saveState: 'synced' | 'saving' | 'error';
  values: Record<string, unknown>;
  bindPresetToConnection: boolean;
  onToggleConnectionBinding: (value: boolean) => void;
  onUpdateCurrent: () => void;
  onSaveAs: () => void;
  onRename: () => void;
  onRestore: () => void;
  onExport: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onOpenSection: (sectionId: string) => void;
  onOpenUtility: (utilityId: string) => void;
}): JSX.Element {
  if (!props.hasSelection) {
    return (
      <EmptyState
        title={PRESET_COPY.emptyCatalogTitle}
        description={PRESET_COPY.emptyCatalogDescription}
        action={<Button onClick={props.onCreate}>{PRESET_COPY.createFirst}</Button>}
      />
    );
  }

  let workspaceRef: HTMLDivElement | undefined;
  useMotionMount(() => workspaceRef, 'page');

  return (
    <div ref={workspaceRef} class="space-y-5">
      <PresetHeader
        title={props.selectedName ?? ''}
        catalogLabel={formatCatalogSubtitle(props.catalog.group, props.catalog.label)}
        dirty={props.dirty}
        saveState={props.saveState}
        supportsRestore={props.catalog.supportsRestore}
        supportsPerItemExport={props.catalog.supportsPerItemImportExport}
        supportsConnectionBinding={props.catalog.supportsConnectionBinding}
        bindPresetToConnection={props.bindPresetToConnection}
        onToggleConnectionBinding={props.onToggleConnectionBinding}
        onUpdateCurrent={props.onUpdateCurrent}
        onSaveAs={props.onSaveAs}
        onRename={props.onRename}
        onRestore={props.onRestore}
        onExport={props.onExport}
        onDelete={props.onDelete}
      />

      <Card title={PRESET_COPY.workspaceSections}>
        <div class="grid gap-5 xl:grid-cols-2">
          <For each={props.catalog.sections}>
            {(section) => (
              <PresetSectionCard section={section} values={props.values} onOpen={() => props.onOpenSection(section.id)} />
            )}
          </For>
        </div>
      </Card>

      <Show when={props.catalog.supportsMasterTools}>
        <Card title={PRESET_COPY.utilityTools}>
          <div class="grid gap-5 xl:grid-cols-2">
            <UtilityCard title={PRESET_COPY.masterImport} description={PRESET_COPY.utilityMasterImportDescription} onOpen={() => props.onOpenUtility('masterImport')} />
            <UtilityCard title={PRESET_COPY.masterExport} description={PRESET_COPY.utilityMasterExportDescription} onOpen={() => props.onOpenUtility('masterExport')} />
            <UtilityCard title={PRESET_COPY.startReplyWith} description={PRESET_COPY.utilityStartReplyWithDescription} onOpen={() => props.onOpenUtility('start-reply-with')} />
            <UtilityCard title={PRESET_COPY.customStoppingStrings} description={PRESET_COPY.utilityCustomStoppingDescription} onOpen={() => props.onOpenUtility('custom-stopping-strings')} />
            <UtilityCard title={PRESET_COPY.tokenizer} description={PRESET_COPY.utilityTokenizerDescription} onOpen={() => props.onOpenUtility('tokenizer')} />
            <UtilityCard title={PRESET_COPY.markdownEscapes} description={PRESET_COPY.utilityMarkdownDescription} onOpen={() => props.onOpenUtility('markdown-escapes')} />
            <UtilityCard title={PRESET_COPY.bindModelTemplates} description={PRESET_COPY.utilityBindingsDescription} onOpen={() => props.onOpenUtility('bind-model-templates')} />
          </div>
        </Card>
      </Show>
    </div>
  );
}
