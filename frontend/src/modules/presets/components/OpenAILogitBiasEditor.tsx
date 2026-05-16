import { Download, Plus, Trash2, Upload } from 'lucide-solid';
import { For, createMemo, createSignal, type JSX } from 'solid-js';

import { saveJsonExport } from '@/lib/api/export';
import { Button, Field, Input, Select } from '@/shared/components/ui';

import { PRESET_COPY } from '../copy';
import { fileStem } from '../utils';

type BiasEntry = {
  id: string;
  text: string;
  value: number;
};

function asBiasPresets(value: unknown): Record<string, BiasEntry[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { 'Default (none)': [] };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entries]) => [
      key,
      Array.isArray(entries)
        ? entries.map((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          return {
            id: typeof item.id === 'string' ? item.id : `${key}-${index}`,
            text: typeof item.text === 'string' ? item.text : '',
            value: typeof item.value === 'number' ? item.value : Number(item.value ?? 0),
          };
        })
        : [],
    ]),
  );
}

function createBiasId(): string {
  return `bias-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function displayPresetName(name: string): string {
  return name === 'Default (none)' ? '默认（无）' : name;
}

export function OpenAILogitBiasEditor(props: {
  selectedPreset: string;
  presets: unknown;
  onChange: (selectedPreset: string, presets: Record<string, BiasEntry[]>) => void;
}): JSX.Element {
  const [newPresetName, setNewPresetName] = createSignal('');
  let importInput: HTMLInputElement | undefined;
  const presets = createMemo(() => asBiasPresets(props.presets));
  const selectedPreset = createMemo(() => props.selectedPreset && props.selectedPreset in presets() ? props.selectedPreset : Object.keys(presets())[0] ?? 'Default (none)');
  const entries = createMemo(() => presets()[selectedPreset()] ?? []);

  function emit(nextSelected: string, nextPresets: Record<string, BiasEntry[]>): void {
    props.onChange(nextSelected, nextPresets);
  }

  function updateEntry(index: number, patch: Partial<BiasEntry>): void {
    const nextPresets = structuredClone(presets());
    nextPresets[selectedPreset()][index] = { ...nextPresets[selectedPreset()][index], ...patch };
    emit(selectedPreset(), nextPresets);
  }

  function addEntry(): void {
    const nextPresets = structuredClone(presets());
    nextPresets[selectedPreset()].push({ id: createBiasId(), text: '', value: 0 });
    emit(selectedPreset(), nextPresets);
  }

  function removeEntry(index: number): void {
    const nextPresets = structuredClone(presets());
    nextPresets[selectedPreset()].splice(index, 1);
    emit(selectedPreset(), nextPresets);
  }

  function moveEntry(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= entries().length) {
      return;
    }
    const nextPresets = structuredClone(presets());
    const list = nextPresets[selectedPreset()];
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    emit(selectedPreset(), nextPresets);
  }

  async function handleImport(file: File): Promise<void> {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (!Array.isArray(parsed)) {
      return;
    }
    const name = fileStem(file.name) || '导入 Bias 预设';
    const nextPresets = structuredClone(presets());
    nextPresets[name] = parsed.map((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      return {
        id: typeof item.id === 'string' ? item.id : `${name}-${index}`,
        text: typeof item.text === 'string' ? item.text : '',
        value: typeof item.value === 'number' ? item.value : Number(item.value ?? 0),
      };
    });
    emit(name, nextPresets);
  }

  function handleExport(): void {
    void saveJsonExport(entries(), `${selectedPreset()}.json`);
  }

  function createPreset(): void {
    const name = newPresetName().trim();
    if (!name || name in presets()) {
      return;
    }
    const nextPresets = structuredClone(presets());
    nextPresets[name] = [];
    setNewPresetName('');
    emit(name, nextPresets);
  }

  function deletePreset(): void {
    const names = Object.keys(presets());
    if (names.length <= 1) {
      emit('Default (none)', { 'Default (none)': [] });
      return;
    }
    const nextPresets = structuredClone(presets());
    delete nextPresets[selectedPreset()];
    emit(Object.keys(nextPresets)[0], nextPresets);
  }

  return (
    <div class="space-y-5">
      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <Field label={PRESET_COPY.biasPresetName}>
          <Select value={selectedPreset()} onChange={(event) => emit(event.currentTarget.value, structuredClone(presets()))}>
            <For each={Object.keys(presets())}>{(name) => <option value={name}>{displayPresetName(name)}</option>}</For>
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => importInput?.click()}>
          <Upload size={16} />
        </Button>
        <Button variant="secondary" onClick={handleExport}>
          <Download size={16} />
        </Button>
      </div>

      <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
        <Field label={PRESET_COPY.newBiasPreset}>
          <Input value={newPresetName()} onInput={(event) => setNewPresetName(event.currentTarget.value)} placeholder={PRESET_COPY.biasPresetName} />
        </Field>
        <Button variant="secondary" onClick={createPreset}>{PRESET_COPY.newBiasPreset}</Button>
        <Button variant="danger" onClick={deletePreset}>{PRESET_COPY.deleteBiasPreset}</Button>
      </div>

      <div class="space-y-3">
        <For each={entries()}>
          {(entry, index) => (
            <div class="tt-muted-surface rounded-[1.4rem] px-4 py-4">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_auto_auto_auto] lg:items-end">
                <Field label={PRESET_COPY.biasText}>
                  <Input value={entry.text} onInput={(event) => updateEntry(index(), { text: event.currentTarget.value })} />
                </Field>
                <Field label={PRESET_COPY.biasValue}>
                  <Input type="number" value={String(entry.value)} onInput={(event) => updateEntry(index(), { value: Number(event.currentTarget.value || 0) })} />
                </Field>
                <Button variant="secondary" onClick={() => moveEntry(index(), -1)}>上移</Button>
                <Button variant="secondary" onClick={() => moveEntry(index(), 1)}>下移</Button>
                <Button variant="danger" onClick={() => removeEntry(index())}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="flex justify-end">
        <Button variant="secondary" onClick={addEntry}>
          <Plus size={16} />
          <span class="ml-2">{PRESET_COPY.addBiasEntry}</span>
        </Button>
      </div>

      <input
        ref={importInput}
        type="file"
        class="hidden"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleImport(file);
          }
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
