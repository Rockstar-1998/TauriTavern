import {
  uiRendererSettingsSchema,
  type AppSettings,
  type MobileEffectPolicy,
  type RendererSettings,
  type UiRendererSettings,
} from '@/types/domain';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function createDefaultUiRendererSettings(): UiRendererSettings {
  return uiRendererSettingsSchema.parse({
    default_renderer_id: null,
    iframe_dev_mode_enabled: false,
    mobile_effect_policy: 'adaptive',
  });
}

export function readUiRendererSettings(settings: AppSettings | undefined | null): UiRendererSettings {
  const tauritavern = asRecord(asRecord(settings).tauritavern);
  const ui = asRecord(tauritavern.ui);
  const parsed = uiRendererSettingsSchema.safeParse(ui.renderer);
  return parsed.success ? parsed.data : createDefaultUiRendererSettings();
}

export function writeUiRendererSettings(settings: AppSettings, rendererSettings: UiRendererSettings): AppSettings {
  const source = asRecord(settings);
  const tauritavern = asRecord(source.tauritavern);
  const ui = asRecord(tauritavern.ui);
  const nextRenderer = uiRendererSettingsSchema.parse(rendererSettings);

  return {
    ...settings,
    tauritavern: {
      ...tauritavern,
      ui: {
        ...ui,
        renderer: nextRenderer,
      } satisfies RendererSettings,
    },
  };
}

export function getRendererMobileEffectPolicy(settings: AppSettings | undefined | null): MobileEffectPolicy {
  return readUiRendererSettings(settings).mobile_effect_policy;
}
