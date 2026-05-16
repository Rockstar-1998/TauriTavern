import type { JSX } from 'solid-js';

import { locale } from '@/shared/i18n';
import { Button } from '@/shared/components/ui';

export type MigrationToolId = 'assets';

export function MigrationToolTabs(props: {
  tool?: MigrationToolId;
  onChange: (tool: MigrationToolId) => void;
}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-2">
      <Button variant={props.tool === 'assets' ? 'primary' : 'secondary'} onClick={() => props.onChange('assets')}>
        {locale.assets.title}
      </Button>
    </div>
  );
}
