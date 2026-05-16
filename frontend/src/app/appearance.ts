import { nativeBridge } from '@/lib/native/bridge';
import type { WindowBackdropState } from '@/types/ui';

function applyWindowBackdropState(state: WindowBackdropState): WindowBackdropState {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.windowBackdrop = state;
  }

  return state;
}

export async function initializeWindowBackdrop(): Promise<WindowBackdropState> {
  if (typeof document === 'undefined') {
    return 'fallback';
  }

  applyWindowBackdropState('fallback');

  const state = await nativeBridge.appearance.tryEnableMica();
  return applyWindowBackdropState(state);
}
