import { Navigate, Route, Router } from '@solidjs/router';
import { ErrorBoundary, type JSX, lazy, Show } from 'solid-js';

import AssetsPage from '@/modules/assets/page';
import CharactersPage from '@/modules/characters/page';
import CharacterDetailPage from '@/modules/characters/detail-page';
import ChatsPage from '@/modules/chats/page';
import SettingsPage from '@/modules/settings/page';
import PresetsPage from '@/modules/presets/page';
import WorkbenchPage from '@/modules/workbench/page';
import WorldInfoPage from '@/modules/worldinfo/page';

import { AppShell } from './layout/AppShell';
import { MobileAppShell } from './layout/mobile/MobileAppShell';
import { isMobileLayout } from '@/shared/utils/platform';

// 移动端页面延迟加载
const ChatsListMobilePage = lazy(() => import('@/modules/chats/mobile/ChatsListMobilePage'));
const ChatDetailMobilePage = lazy(() => import('@/modules/chats/mobile/ChatDetailMobilePage'));
const CharactersListMobilePage = lazy(() => import('@/modules/characters/mobile/CharactersListMobilePage'));
const CharacterDetailMobilePage = lazy(() => import('@/modules/characters/mobile/CharacterDetailMobilePage'));
const SettingsMobilePage = lazy(() => import('@/modules/settings/mobile/SettingsMobilePage'));
const SettingsDetailMobilePage = lazy(() => import('@/modules/settings/mobile/SettingsDetailMobilePage'));
const WorldInfoListMobilePage = lazy(() => import('@/modules/worldinfo/mobile/WorldInfoListMobilePage'));
const WorldInfoDetailMobilePage = lazy(() => import('@/modules/worldinfo/mobile/WorldInfoDetailMobilePage'));
const PresetsMobilePage = lazy(() => import('@/modules/presets/mobile/PresetsMobilePage'));

function MobileRedirect(props: { href: string }): JSX.Element {
  return <Navigate href={props.href} />;
}

function DesktopRouter(): JSX.Element {
  return (
    <Router root={(props) => <AppShell>{props.children}</AppShell>}>
      <Route path="/" component={() => <Navigate href="/chats" />} />
      <Route path="/characters" component={CharactersPage} />
      <Route path="/characters/:characterId" component={CharacterDetailPage} />
      <Route path="/chats" component={ChatsPage} />
      <Route path="/chats/:scope/:id" component={ChatsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/presets" component={() => <PresetsPage />} />
      <Route path="/assets" component={AssetsPage} />
      <Route path="/world-info" component={WorldInfoPage} />
      <Route path="/workbench" component={WorkbenchPage} />
    </Router>
  );
}

function MobileRouter(): JSX.Element {
  return (
    <Router root={(props) => <MobileAppShell>{props.children}</MobileAppShell>}>
      <Route path="/" component={() => <Navigate href="/chats" />} />
      <Route path="/chats" component={ChatsListMobilePage} />
      <Route path="/chats/:scope/:id" component={ChatDetailMobilePage} />
      <Route path="/characters" component={CharactersListMobilePage} />
      <Route path="/characters/:id" component={CharacterDetailMobilePage} />
      <Route path="/world-info" component={WorldInfoListMobilePage} />
      <Route path="/world-info/:id" component={WorldInfoDetailMobilePage} />
      <Route path="/presets" component={PresetsMobilePage} />
      <Route path="/settings" component={SettingsMobilePage} />
      <Route path="/settings/:panelId" component={SettingsDetailMobilePage} />
      <Route path="/assets" component={() => <MobileRedirect href="/chats" />} />
      <Route path="/workbench" component={() => <MobileRedirect href="/chats" />} />
    </Router>
  );
}

export function AppRouter(): JSX.Element {
  // 根据平台自适应挂载不同的路由渲染器
  // 使用 Show 或以函数形式调用信号，保证在屏幕尺寸变化时能够动态切换
  return (
    <Show when={isMobileLayout()} fallback={<DesktopRouter />}>
      <MobileRouter />
    </Show>
  );
}

export function AppRouteBoundary(props: { children: JSX.Element }): JSX.Element {
  return (
    <ErrorBoundary fallback={(error) => <div class="rounded-[1.5rem] border border-rose-200 bg-white px-5 py-4 text-sm text-rose-700">页面加载失败：{String(error)}</div>}>
      {props.children}
    </ErrorBoundary>
  );
}
