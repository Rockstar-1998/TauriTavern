import type { JSX } from 'solid-js';

import { DesktopWorkbenchShell } from './desktop/DesktopWorkbenchShell';

export function AppShell(props: { children: JSX.Element }): JSX.Element {
  return <DesktopWorkbenchShell>{props.children}</DesktopWorkbenchShell>;
}
