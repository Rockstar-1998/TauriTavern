import {
  rendererManifestSchema,
  type AppSettings,
  type RendererActionType,
  type RendererManifest,
  type RendererTarget,
  type SessionRendererBinding,
  type UiRendererSettings,
} from '@/types/domain';

export const BUILTIN_NATIVE_RENDERER_ID = 'native';

export const RENDERER_ACTION_WHITELIST: readonly RendererActionType[] = [
  'send',
  'edit',
  'delete',
  'withdraw',
  'regenerate',
  'continue',
  'load_more_before',
  'stop',
  'open_session_menu',
] as const;

export type RendererEnvironment = {
  target: RendererTarget;
  isAndroid: boolean;
};

export type RendererEffectPolicy = {
  blurEnabled: boolean;
  blurPx: number;
  animationMs: number;
  interactivePreviewLimit: number;
  particlesEnabled: boolean;
};

export type ResolvedChatRenderer = {
  manifest: RendererManifest;
  builtin: boolean;
  effectPolicy: RendererEffectPolicy;
  capabilities: RendererActionType[];
};

import { isMobileLayout } from '@/shared/utils/platform';

export function detectRendererEnvironment(): RendererEnvironment {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /Android/i.test(userAgent);
  return {
    target: isMobileLayout() ? 'android' : 'desktop',
    isAndroid,
  };
}

export function createBuiltinNativeRenderer(): RendererManifest {
  return rendererManifestSchema.parse({
    id: BUILTIN_NATIVE_RENDERER_ID,
    name: 'Native',
    version: '1',
    mode: 'native',
    targets: ['desktop', 'android'],
    min_app_version: '',
    capabilities: [],
    host: {
      theme: {},
    },
  });
}

export function listKnownRenderers(installedRenderers: RendererManifest[]): RendererManifest[] {
  const deduped = new Map<string, RendererManifest>();
  deduped.set(BUILTIN_NATIVE_RENDERER_ID, createBuiltinNativeRenderer());

  for (const renderer of installedRenderers) {
    const parsed = rendererManifestSchema.safeParse(renderer);
    if (parsed.success) {
      deduped.set(parsed.data.id, parsed.data);
    }
  }

  return [...deduped.values()];
}

function supportsTarget(manifest: RendererManifest, target: RendererTarget): boolean {
  return manifest.targets.length === 0 || manifest.targets.includes(target);
}

function resolveDefaultRendererId(settings: UiRendererSettings, env: RendererEnvironment): string | null {
  if (!settings.default_renderer_id) {
    return null;
  }

  if (env.isAndroid && settings.default_renderer_id !== BUILTIN_NATIVE_RENDERER_ID) {
    return settings.default_renderer_id;
  }

  return settings.default_renderer_id;
}

function canUseAsDefault(manifest: RendererManifest, env: RendererEnvironment): boolean {
  if (manifest.mode === 'iframe-dev-v1' && env.isAndroid) {
    return false;
  }
  return true;
}

export function resolveRendererSelection(input: {
  installedRenderers: RendererManifest[];
  settings: UiRendererSettings;
  sessionBinding: SessionRendererBinding;
  env: RendererEnvironment;
}): ResolvedChatRenderer {
  const known = listKnownRenderers(input.installedRenderers);
  const byId = new Map(known.map((renderer) => [renderer.id, renderer] as const));
  const preferredId = input.sessionBinding.mode === 'override'
    ? input.sessionBinding.renderer_id
    : resolveDefaultRendererId(input.settings, input.env);
  const preferred = preferredId ? byId.get(preferredId) : null;
  const fallback = byId.get(BUILTIN_NATIVE_RENDERER_ID) ?? createBuiltinNativeRenderer();

  const manifest = preferred
    && supportsTarget(preferred, input.env.target)
    && (input.sessionBinding.mode === 'override' || canUseAsDefault(preferred, input.env))
    ? preferred
    : fallback;

  return {
    manifest,
    builtin: manifest.id === BUILTIN_NATIVE_RENDERER_ID,
    effectPolicy: resolveRendererEffectPolicy(manifest, input.settings, input.env),
    capabilities: manifest.mode === 'iframe-dev-v1'
      ? manifest.capabilities.filter((capability): capability is RendererActionType => RENDERER_ACTION_WHITELIST.includes(capability))
      : [],
  };
}

export function resolveRendererEffectPolicy(
  manifest: RendererManifest,
  settings: UiRendererSettings,
  env: RendererEnvironment,
): RendererEffectPolicy {
  if (settings.mobile_effect_policy !== 'adaptive') {
    return {
      blurEnabled: true,
      blurPx: 16,
      animationMs: 180,
      interactivePreviewLimit: 4,
      particlesEnabled: false,
    };
  }

  if (env.target === 'desktop') {
    return {
      blurEnabled: true,
      blurPx: manifest.mode === 'host-v1' ? 18 : 16,
      animationMs: 180,
      interactivePreviewLimit: 4,
      particlesEnabled: false,
    };
  }

  return {
    blurEnabled: false,
    blurPx: 0,
    animationMs: 100,
    interactivePreviewLimit: 1,
    particlesEnabled: false,
  };
}

export function readHostThemeTokens(manifest: RendererManifest): Record<string, string | number> {
  const host = manifest.host && typeof manifest.host === 'object' && !Array.isArray(manifest.host)
    ? manifest.host as Record<string, unknown>
    : {};
  const theme = host.theme && typeof host.theme === 'object' && !Array.isArray(host.theme)
    ? host.theme as Record<string, unknown>
    : {};

  return Object.fromEntries(
    Object.entries(theme)
      .filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number'),
  );
}

export function isIframeRendererEnabled(settings: AppSettings | undefined, renderer: RendererManifest): boolean {
  if (renderer.mode !== 'iframe-dev-v1') {
    return true;
  }

  const value = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>).tauritavern
    : null;
  const tauritavern = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const ui = tauritavern.ui && typeof tauritavern.ui === 'object' && !Array.isArray(tauritavern.ui)
    ? tauritavern.ui as Record<string, unknown>
    : {};
  const rendererSettings = ui.renderer && typeof ui.renderer === 'object' && !Array.isArray(ui.renderer)
    ? ui.renderer as Record<string, unknown>
    : {};

  return rendererSettings.iframe_dev_mode_enabled === true;
}
