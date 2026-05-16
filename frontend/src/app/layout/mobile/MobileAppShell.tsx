import { A, useLocation } from '@solidjs/router';
import { Bell, BookOpen, MessageSquare, Settings, SlidersHorizontal, Users } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';

import { useMotionMount, usePressMotion, useStaggeredMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';

const mobileNavItems = [
  { href: '/chats', label: locale.modules.chats, icon: MessageSquare },
  { href: '/characters', label: locale.modules.characters, icon: Users },
  { href: '/presets', label: locale.settings.groups.presets, icon: SlidersHorizontal },
  { href: '/world-info', label: locale.modules.worldInfo, icon: BookOpen },
  { href: '/settings', label: locale.modules.settings, icon: Settings },
];

export function MobileAppShell(props: { children: JSX.Element }): JSX.Element {
  const location = useLocation();
  let shellRef: HTMLDivElement | undefined;
  let navRef: HTMLElement | undefined;
  let bellRef: HTMLButtonElement | undefined;

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  useMotionMount(() => shellRef, 'page');
  useMotionMount(() => navRef, 'mobileNav', { delay: 0.04 });
  useStaggeredMotionMount(() => navRef, '[data-motion-mobile-nav-item]', 'mobileNav', { step: 0.03 });
  usePressMotion(() => bellRef);

  const isMainTab = () => {
    // 如果有查询参数（如 ?selected=...），判定为二级详情页，隐藏外壳 UI
    if (location.search && location.search.includes('selected=')) {
      return false;
    }
    const mainPaths = ['/chats', '/characters', '/world-info', '/presets', '/settings'];
    return mainPaths.includes(location.pathname);
  };

  return (
    <div ref={shellRef} class="flex h-[100dvh] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <Show when={isMainTab()}>
        <header class="flex h-12 shrink-0 items-center justify-between border-b bg-white px-4">
          <div class="flex flex-col">
            <div class="text-lg font-bold leading-tight">TauriTavern <span class="text-[10px] text-rose-500 font-normal">(v1.4.2-MOB-SYNC)</span></div>
            <div class="text-[9px] text-slate-400 font-medium uppercase tracking-wider">PATH: {location.pathname}</div>
          </div>
          <button
            ref={bellRef}
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label={locale.common.more}
            title={locale.common.more}
          >
            <Bell size={18} />
          </button>
        </header>
      </Show>

      <main class="min-h-0 flex-1 overflow-y-auto">{props.children}</main>

      <Show when={isMainTab()}>
        <nav ref={navRef} class="flex h-16 shrink-0 items-center justify-around border-t bg-white pb-safe">
          {mobileNavItems.map((item) => (
            <A
              href={item.href}
              data-motion-mobile-nav-item
              class={`flex h-full flex-1 flex-col items-center justify-center gap-1 transition ${isActive(item.href) ? 'text-slate-900' : 'text-slate-400'
                }`}
            >
              <item.icon size={20} class={isActive(item.href) ? 'scale-110' : ''} />
              <span class="text-[10px] font-medium">{item.label}</span>
            </A>
          ))}
        </nav>
      </Show>
    </div>
  );
}
