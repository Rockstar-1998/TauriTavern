import { Bell, EllipsisVertical } from 'lucide-solid';
import { useLocation } from '@solidjs/router';
import type { JSX } from 'solid-js';

import { useMotionMount, usePressMotion, useStaggeredMotionMount } from '@/shared/motion/runtime';
import { locale } from '@/shared/i18n';
import { IconRailButton } from '@/shared/components/desktop/IconRailButton';

import { desktopModules, resolveDesktopModuleId } from './module-registry';

export function DesktopIconRail(): JSX.Element {
  const location = useLocation();
  const activeId = () => resolveDesktopModuleId(location.pathname);
  let railRef: HTMLElement | undefined;
  let statusRef: HTMLButtonElement | undefined;
  let moreRef: HTMLButtonElement | undefined;

  useMotionMount(() => railRef, 'rail');
  useStaggeredMotionMount(() => railRef, '[data-motion-rail-item]', 'rail', { initialDelay: 0.04, step: 0.045 });
  usePressMotion(() => statusRef);
  usePressMotion(() => moreRef);

  return (
    <aside ref={railRef} class="tt-desktop-rail flex h-full min-h-0 w-[76px] shrink-0 flex-col items-center rounded-[2rem] px-2 py-4">
      <div data-motion-rail-item class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-300 text-base font-semibold text-slate-700">T</div>
      <nav class="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
        {desktopModules.map((item) => (
          <div data-motion-rail-item>
            <IconRailButton href={item.href} label={item.label} icon={item.icon} active={activeId() === item.id} />
          </div>
        ))}
      </nav>
      <div class="mt-3 flex w-full shrink-0 flex-col items-center gap-2 text-slate-500">
        <button ref={statusRef} data-motion-rail-item type="button" class="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100" aria-label={locale.common.status} title={locale.common.status}>
          <Bell size={18} />
        </button>
        <button ref={moreRef} data-motion-rail-item type="button" class="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100" aria-label={locale.common.more} title={locale.common.more}>
          <EllipsisVertical size={18} />
        </button>
      </div>
    </aside>
  );
}
