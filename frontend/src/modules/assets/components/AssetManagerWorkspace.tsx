import { createMutation, createQuery, useQueryClient } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, Show, type JSX } from 'solid-js';

import { useToasts } from '@/app/providers';
import { coreApiClient } from '@/lib/api/core-client';
import { getErrorMessage } from '@/lib/api/http';
import { locale } from '@/shared/i18n';
import { ContextListCard } from '@/shared/components/desktop/ContextListCard';
import { SegmentedTabs } from '@/shared/components/desktop/SegmentedTabs';
import { WorkbenchModal } from '@/shared/components/desktop/WorkbenchModal';
import { Button, Card, EmptyState, Field, Input, JsonEditor, LoadingBlock } from '@/shared/components/ui';
import { safeJsonStringify } from '@/shared/utils/format';
import type { Theme } from '@/types/domain';

import type { AssetPanelId } from '../navigation';

const assetPanels = [
  { id: 'backgrounds', label: locale.assets.tabs.backgrounds },
  { id: 'avatars', label: locale.assets.tabs.avatars },
  { id: 'themes', label: locale.assets.tabs.themes },
] as const;

export function AssetManagerWorkspace(props: {
  panel: AssetPanelId;
  selected: string;
  onNavigate: (next: { panel: AssetPanelId; selected?: string }) => void;
}): JSX.Element {
  const toast = useToasts();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = createSignal(false);
  const [renameText, setRenameText] = createSignal('');
  const [themeText, setThemeText] = createSignal('{}');

  const settingsQuery = createQuery(() => ({ queryKey: ['settings'], queryFn: () => coreApiClient.getSettings() }));
  const backgroundsQuery = createQuery(() => ({ queryKey: ['assets', 'backgrounds'], queryFn: () => coreApiClient.assets.backgrounds() }));
  const avatarsQuery = createQuery(() => ({ queryKey: ['assets', 'avatars'], queryFn: () => coreApiClient.assets.avatars() }));

  const items = createMemo(() => {
    if (props.panel === 'backgrounds') {
      return (backgroundsQuery.data?.images ?? []).map((name) => ({
        id: name,
        title: name,
        description: locale.assets.backgroundDescription,
        tone: props.selected === name ? ('active' as const) : ('default' as const),
      }));
    }

    if (props.panel === 'avatars') {
      return (avatarsQuery.data ?? []).map((name) => ({
        id: name,
        title: name,
        description: locale.assets.avatarDescription,
        tone: props.selected === name ? ('active' as const) : ('default' as const),
      }));
    }

    return (settingsQuery.data?.themes ?? []).map((theme) => ({
      id: theme.name,
      title: theme.name,
      description: locale.assets.themeDescription,
      tone: props.selected === theme.name ? ('active' as const) : ('default' as const),
    }));
  });

  const selectedTheme = createMemo<Theme | undefined>(() => settingsQuery.data?.themes?.find((theme) => theme.name === props.selected));
  const selectedExists = createMemo(() => items().some((item) => item.id === props.selected));
  const currentPanelLabel = createMemo(() => assetPanels.find((item) => item.id === props.panel)?.label ?? locale.assets.title);
  const panelBusy = createMemo(() => {
    if (props.panel === 'backgrounds') return backgroundsQuery.isPending;
    if (props.panel === 'avatars') return avatarsQuery.isPending;
    return settingsQuery.isPending;
  });

  createEffect(() => {
    setRenameText(props.selected);
    if (props.panel === 'themes' && selectedTheme()) {
      setThemeText(safeJsonStringify(selectedTheme()));
    }
  });

  const uploadBackgroundMutation = createMutation(() => ({
    mutationFn: async (file: File) => coreApiClient.assets.uploadBackground(file),
    onSuccess: async () => {
      toast.push({ title: locale.assets.uploadBackgroundSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['assets', 'backgrounds'] });
      setModalOpen(false);
    },
    onError: (error: unknown) => toast.push({ title: locale.assets.upload, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const uploadAvatarMutation = createMutation(() => ({
    mutationFn: async (file: File) => coreApiClient.assets.uploadAvatar(file),
    onSuccess: async () => {
      toast.push({ title: locale.assets.uploadAvatarSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['assets', 'avatars'] });
      setModalOpen(false);
    },
    onError: (error: unknown) => toast.push({ title: locale.assets.upload, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const renameBackgroundMutation = createMutation(() => ({
    mutationFn: async () => coreApiClient.assets.renameBackground(props.selected, renameText().trim()),
    onSuccess: async () => {
      toast.push({ title: locale.assets.renameSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['assets', 'backgrounds'] });
      props.onNavigate({ panel: 'backgrounds', selected: renameText().trim() });
      setModalOpen(false);
    },
    onError: (error: unknown) => toast.push({ title: locale.common.rename, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const deleteAssetMutation = createMutation(() => ({
    mutationFn: async () => {
      if (props.panel === 'backgrounds') return coreApiClient.assets.deleteBackground(props.selected);
      if (props.panel === 'avatars') return coreApiClient.assets.deleteAvatar(props.selected);
      return coreApiClient.assets.deleteTheme(props.selected);
    },
    onSuccess: async () => {
      toast.push({ title: locale.assets.deleteSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['assets', 'backgrounds'] });
      await queryClient.invalidateQueries({ queryKey: ['assets', 'avatars'] });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      props.onNavigate({ panel: props.panel });
      setModalOpen(false);
    },
    onError: (error: unknown) => toast.push({ title: locale.common.delete, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const saveThemeMutation = createMutation(() => ({
    mutationFn: async () => {
      const parsed = JSON.parse(themeText()) as Theme & Record<string, unknown>;
      const nextName = String(parsed.name ?? props.selected ?? '').trim();
      if (!nextName) {
        throw new Error(locale.assets.themeNameRequired);
      }
      return coreApiClient.assets.saveTheme({ ...parsed, name: nextName });
    },
    onSuccess: async () => {
      const parsed = JSON.parse(themeText()) as Theme & Record<string, unknown>;
      const nextName = String(parsed.name ?? props.selected ?? '').trim();
      toast.push({ title: locale.assets.saveThemeSuccess, tone: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      props.onNavigate({ panel: 'themes', selected: nextName || undefined });
      setModalOpen(false);
    },
    onError: (error: unknown) => toast.push({ title: locale.common.save, description: getErrorMessage(error), tone: 'danger' }),
  }));

  const emptyTitle = () => {
    switch (props.panel) {
      case 'avatars':
        return locale.assets.emptyAvatars;
      case 'themes':
        return locale.assets.emptyThemes;
      default:
        return locale.assets.emptyBackgrounds;
    }
  };

  const emptyDescription = () => {
    switch (props.panel) {
      case 'avatars':
        return locale.assets.emptyAvatarsHint;
      case 'themes':
        return locale.assets.emptyThemesHint;
      default:
        return locale.assets.emptyBackgroundsHint;
    }
  };

  function openModal(): void {
    setModalOpen(true);
  }

  function detailActionLabel(): string {
    if (props.panel === 'themes') return locale.common.edit;
    if (props.panel === 'avatars') return locale.assets.upload;
    return locale.common.rename;
  }

  function modalTitle(): string {
    if (props.panel === 'themes') return locale.assets.themeJson;
    if (props.panel === 'backgrounds' && selectedExists()) return locale.common.rename;
    return locale.assets.upload;
  }

  return (
    <div class="space-y-5">
      <Card title={locale.assets.title} subtitle={locale.assets.workbenchPath}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs
            value={props.panel}
            items={assetPanels.map((item) => ({ value: item.id, label: item.label }))}
            onChange={(value) => props.onNavigate({ panel: value as AssetPanelId })}
          />
          <Button onClick={openModal}>{locale.assets.upload}</Button>
        </div>
      </Card>

      <Show when={!panelBusy()} fallback={<LoadingBlock />}>
        <div class="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
          <Card title={locale.assets.assetListTitle} subtitle={currentPanelLabel()}>
            <Show when={items().length > 0} fallback={<EmptyState title={emptyTitle()} description={emptyDescription()} />}>
              <div class="space-y-3">
                {items().map((item) => (
                  <ContextListCard
                    item={{
                      ...item,
                      onClick: () => props.onNavigate({ panel: props.panel, selected: item.id }),
                    }}
                    compact
                  />
                ))}
              </div>
            </Show>
          </Card>

          <Show when={selectedExists()} fallback={<EmptyState title={emptyTitle()} description={emptyDescription()} action={<Button onClick={openModal}>{locale.assets.upload}</Button>} />}>
            <Card title={props.selected} subtitle={locale.assets.actionPanel}>
              <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div class="tt-muted-surface flex min-h-[280px] items-center justify-center rounded-[1.8rem] border border-dashed text-center text-sm text-slate-500">
                  {locale.assets.preview}
                  <br />
                  {props.selected}
                </div>
                <div class="space-y-4">
                  <Card title={locale.common.overview}>
                    <div class="space-y-2 text-sm text-slate-600">
                      <div>{locale.assets.overviewPanelLabel}: {currentPanelLabel()}</div>
                      <div>{locale.assets.overviewNameLabel}: {props.selected}</div>
                      <div>{locale.assets.overviewSourceLabel}: {locale.assets.overviewSourceValue}</div>
                    </div>
                  </Card>
                  <Card title={locale.assets.actionPanel}>
                    <div class="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={openModal}>{detailActionLabel()}</Button>
                      <Button variant="danger" onClick={() => void deleteAssetMutation.mutateAsync()}>{locale.common.delete}</Button>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          </Show>
        </div>
      </Show>

      <WorkbenchModal open={modalOpen()} onClose={() => setModalOpen(false)} title={modalTitle()} size={props.panel === 'themes' ? 'xl' : 'md'}>
        <div class="space-y-4">
          <Show when={props.panel === 'backgrounds' && selectedExists()}>
            <Field label={locale.assets.rename}>
              <Input value={renameText()} onInput={(event) => setRenameText(event.currentTarget.value)} />
            </Field>
          </Show>

          <Show when={props.panel === 'themes'}>
            <Field label={locale.assets.themeJson}>
              <JsonEditor value={themeText()} onInput={(event) => setThemeText(event.currentTarget.value)} minHeight={520} />
            </Field>
          </Show>

          <Show when={props.panel !== 'themes'}>
            <Field label={locale.assets.upload}>
              <input
                type="file"
                accept="image/*,.json"
                class="text-sm text-slate-700"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) {
                    return;
                  }
                  if (props.panel === 'backgrounds') {
                    void uploadBackgroundMutation.mutateAsync(file);
                  } else {
                    void uploadAvatarMutation.mutateAsync(file);
                  }
                  event.currentTarget.value = '';
                }}
              />
            </Field>
          </Show>

          <div class="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{locale.common.cancel}</Button>
            <Show when={props.panel === 'backgrounds' && selectedExists()}>
              <Button onClick={() => void renameBackgroundMutation.mutateAsync()} disabled={!renameText().trim()}>{locale.common.save}</Button>
            </Show>
            <Show when={props.panel === 'themes'}>
              <Button onClick={() => void saveThemeMutation.mutateAsync()} disabled={saveThemeMutation.isPending}>{locale.common.save}</Button>
            </Show>
          </div>
        </div>
      </WorkbenchModal>
    </div>
  );
}
