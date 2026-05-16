import { Show, type JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { chatFileStem } from '@/shared/utils/format';
import { Button, Field, Input, Select } from '@/shared/components/ui';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { StatusChip } from '@/shared/components/desktop/StatusChip';
import type { ChatProviderDraft, ChatSessionSummary, ProviderSource, RendererManifest, SessionRendererBinding } from '@/types/domain';

type EditorTab = 'session' | 'settings';

function sourceLabel(sourceType: ChatSessionSummary['source_type'] | undefined): string {
  return sourceType === 'group' ? locale.chats.sessionSourceGroup : locale.chats.sessionSourceCharacter;
}

export function ChatSessionEditorModal(props: {
  open: boolean;
  onClose: () => void;
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  session?: ChatSessionSummary | null;
  renameText: string;
  messageCount: number;
  worldInfoSummary?: string;
  presetSummary?: string;
  apiProfileSummary?: string;
  dirty?: boolean;
  draft?: boolean;
  disabled?: boolean;
  loadingModels?: boolean;
  savingDefaults?: boolean;
  modelOptions: string[];
  statusPayload?: Record<string, unknown>;
  draftSettings: ChatProviderDraft;
  onRenameTextChange: (value: string) => void;
  onRename: () => void;
  onSaveChat: () => void;
  onExportChat: () => void;
  onDeleteChat: () => void;
  rendererBinding: SessionRendererBinding;
  availableRenderers: RendererManifest[];
  onRendererModeChange: (mode: SessionRendererBinding['mode']) => void;
  onRendererIdChange: (rendererId: string | null) => void;
  onSaveRenderer: () => void;
  canCreateMultiplayerCopy?: boolean;
  onCreateMultiplayerCopy?: () => void;
  onOpenWorldInfoBinding?: () => void;
  onOpenPresetBinding?: () => void;
  onOpenApiProfileBinding?: () => void;
  onSourceChange: (source: ProviderSource) => void;
  onModelChange: (model: string) => void;
  onFieldChange: (field: keyof ChatProviderDraft, value: string | boolean) => void;
  onRefreshModels: () => void;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}): JSX.Element {
  const title = () => chatFileStem(props.session?.file_name || props.renameText || locale.chats.editSession);

  return (
    <WorkbenchModal open={props.open} onClose={props.onClose} title={title()} size="lg">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class={`rounded-[1rem] px-4 py-2 text-sm font-medium transition ${props.tab === 'session' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          onClick={() => props.onTabChange('session')}
        >
          {locale.chats.sessionTab}
        </button>
        <button
          type="button"
          class={`rounded-[1rem] px-4 py-2 text-sm font-medium transition ${props.tab === 'settings' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          onClick={() => props.onTabChange('settings')}
        >
          {locale.chats.bindingTitle}
        </button>
      </div>

      <Show
        when={props.tab === 'session'}
        fallback={
          <div class="mt-6 grid gap-6">
            <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
              <div class="mb-2 text-sm font-semibold text-slate-900">绑定入口</div>
              <p class="text-sm text-slate-500">会话级 API、预设与世界书统一通过绑定界面管理，避免与全局或默认提供方配置冲突。</p>
            </div>

            <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
              <div class="grid gap-4 md:grid-cols-3">
                <div class="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                  <div class="text-xs uppercase tracking-[0.14em] text-slate-400">{locale.chats.bindWorldInfo}</div>
                  <div class="mt-2 text-sm font-medium text-slate-900">{props.worldInfoSummary ?? locale.chats.bindingNone}</div>
                  <Button variant="secondary" class="mt-4 w-full" onClick={props.onOpenWorldInfoBinding} disabled={props.disabled || !props.onOpenWorldInfoBinding}>{locale.chats.bindWorldInfo}</Button>
                </div>
                <div class="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                  <div class="text-xs uppercase tracking-[0.14em] text-slate-400">{locale.chats.bindPreset}</div>
                  <div class="mt-2 text-sm font-medium text-slate-900">{props.presetSummary ?? locale.chats.bindingNone}</div>
                  <Button variant="secondary" class="mt-4 w-full" onClick={props.onOpenPresetBinding} disabled={props.disabled || !props.onOpenPresetBinding}>{locale.chats.bindPreset}</Button>
                </div>
                <div class="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                  <div class="text-xs uppercase tracking-[0.14em] text-slate-400">{locale.chats.bindApiProfile}</div>
                  <div class="mt-2 text-sm font-medium text-slate-900">{props.apiProfileSummary ?? locale.chats.bindingGlobalDefault}</div>
                  <Button variant="secondary" class="mt-4 w-full" onClick={props.onOpenApiProfileBinding} disabled={props.disabled || !props.onOpenApiProfileBinding}>{locale.chats.bindApiProfile}</Button>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <div class="mt-6 grid gap-6">
          <Field label={locale.common.rename}>
            <div class="flex flex-wrap gap-3">
              <Input value={props.renameText} onInput={(event) => props.onRenameTextChange(event.currentTarget.value)} disabled={props.disabled} />
              <Button variant="secondary" onClick={props.onRename} disabled={props.disabled}>{locale.common.rename}</Button>
            </div>
          </Field>

          <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
            <div class="mb-3 flex items-center gap-2">
              <div class="text-sm font-semibold text-slate-900">{locale.chats.sessionSummary}</div>
              {props.dirty ? <StatusChip tone="danger">{locale.chats.dirty}</StatusChip> : null}
              {props.draft ? <StatusChip>{locale.chats.unsaved}</StatusChip> : null}
            </div>
            <div class="grid gap-3 text-sm text-slate-600">
              <div><span class="font-medium text-slate-900">文件：</span>{title()}</div>
              <div><span class="font-medium text-slate-900">来源：</span>{sourceLabel(props.session?.source_type)}</div>
              <div><span class="font-medium text-slate-900">{`${locale.chats.sessionBelongsTo}：`}</span>{props.session?.scope_name ?? '-'}</div>
              <div><span class="font-medium text-slate-900">{`${locale.chats.messageCount}：`}</span>{props.messageCount}</div>
              <Show when={props.presetSummary}>
                <div><span class="font-medium text-slate-900">Preset：</span>{props.presetSummary}</div>
              </Show>
            </div>
          </div>

          <div class="tt-card-surface rounded-[1.6rem] px-5 py-5">
            <div class="mb-3 text-sm font-semibold text-slate-900">Renderer</div>
            <div class="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
              <Field label="Mode">
                <Select value={props.rendererBinding.mode} onChange={(event) => props.onRendererModeChange(event.currentTarget.value as SessionRendererBinding['mode'])} disabled={props.disabled}>
                  <option value="inherit">Inherit global default</option>
                  <option value="override">Override for this session</option>
                </Select>
              </Field>
              <Field label="Renderer">
                <Select
                  value={props.rendererBinding.renderer_id ?? 'native'}
                  onChange={(event) => props.onRendererIdChange(event.currentTarget.value || null)}
                  disabled={props.disabled || props.rendererBinding.mode !== 'override'}
                >
                  {props.availableRenderers.map((renderer) => (
                    <option value={renderer.id}>{renderer.name} ({renderer.mode})</option>
                  ))}
                </Select>
              </Field>
              <Button variant="secondary" onClick={props.onSaveRenderer} disabled={props.disabled}>Save Renderer</Button>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={props.onSaveChat} disabled={props.disabled}>{locale.chats.saveChat}</Button>
            <Button variant="secondary" onClick={props.onExportChat} disabled={props.disabled}>{locale.chats.exportChat}</Button>
            <Show when={props.canCreateMultiplayerCopy && props.onCreateMultiplayerCopy}>
              <Button variant="secondary" onClick={props.onCreateMultiplayerCopy} disabled={props.disabled}>{"\u521b\u5efa\u8054\u673a\u4f1a\u8bdd\u526f\u672c"}</Button>
            </Show>
            <Button variant="danger" onClick={props.onDeleteChat} disabled={props.disabled}>{locale.chats.deleteChat}</Button>
          </div>
        </div>
      </Show>
    </WorkbenchModal>
  );
}
