import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { type Accessor, createContext, createSignal, For, type JSX, onCleanup, onMount, Show, useContext } from 'solid-js';

import { locale } from '@/shared/i18n';
import { isMobileLayout } from '@/shared/utils/platform';

import { initializeWindowBackdrop } from './appearance';

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone?: 'default' | 'danger' | 'success' | 'warning';
};

type ToastContextValue = {
  items: Accessor<Toast[]>;
  push: (toast: Omit<Toast, 'id'>) => void;
  remove: (id: number) => void;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const ToastContext = createContext<ToastContextValue>();

function syncUiTheme(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.uiTheme = isMobileLayout() ? 'mobile' : 'desktop-light';
}

function ToastViewport(): JSX.Element {
  const toast = useToasts();
  return (
    <div class="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,24rem)] flex-col gap-3">
      <For each={toast.items()}>
        {(item) => (
          <div class={`pointer-events-auto rounded-[1.4rem] border px-4 py-3 shadow-lg ${item.tone === 'danger' ? 'border-rose-200 bg-white text-rose-700' : item.tone === 'success' ? 'border-emerald-200 bg-white text-emerald-700' : item.tone === 'warning' ? 'border-amber-200 bg-white text-amber-700' : 'border-slate-200 bg-white text-slate-700'}`}>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900">{item.title}</div>
                <Show when={item.description}>
                  <div class="mt-1 text-xs text-slate-500">{item.description}</div>
                </Show>
              </div>
              <button class="text-xs text-slate-400" onClick={() => toast.remove(item.id)}>{locale.common.close}</button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export function AppProviders(props: { children: JSX.Element }): JSX.Element {
  const [items, setItems] = createSignal<Toast[]>([]);
  let nextId = 1;

  onMount(() => {
    syncUiTheme();
    void initializeWindowBackdrop();

    const media = window.matchMedia('(max-width: 900px)');
    const handler = () => syncUiTheme();
    media.addEventListener?.('change', handler);
    media.addListener?.(handler);
    onCleanup(() => {
      media.removeEventListener?.('change', handler);
      media.removeListener?.(handler);
    });
  });

  const value: ToastContextValue = {
    items,
    push(toast) {
      const id = nextId;
      nextId += 1;
      setItems((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 4000);
    },
    remove(id) {
      setItems((current) => current.filter((item) => item.id !== id));
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={value}>
        {props.children}
        <ToastViewport />
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}

export function useToasts(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error(locale.errors.toastUnavailable);
  }

  return value;
}
