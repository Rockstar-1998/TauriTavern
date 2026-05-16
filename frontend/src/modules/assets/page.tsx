import { useNavigate, useSearchParams } from '@solidjs/router';
import { createEffect, type JSX } from 'solid-js';

import { buildAssetsMigrationHref, normalizeAssetPanelId } from './navigation';

export default function AssetsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams<{ panel?: string; selected?: string }>();

  createEffect(() => {
    const panel = normalizeAssetPanelId(searchParams.panel);
    const selected = decodeURIComponent(searchParams.selected ?? '');
    navigate(buildAssetsMigrationHref({ panel, selected }), { replace: true });
  });

  return <div class="hidden" />;
}
