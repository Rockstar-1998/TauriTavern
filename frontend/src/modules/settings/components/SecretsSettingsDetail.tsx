import type { JSX } from 'solid-js';

import { Button, Card, Field, Input } from '@/shared/components/ui';
import { safeJsonStringify } from '@/shared/utils/format';
import { locale } from '@/shared/i18n';

export function SecretsSettingsDetail(props: {
  section: 'write' | 'state';
  secretKey: string;
  secretLabel: string;
  secretValue: string;
  onSecretKeyChange: (value: string) => void;
  onSecretLabelChange: (value: string) => void;
  onSecretValueChange: (value: string) => void;
  onSaveSecret: () => void;
  savingSecret?: boolean;
  secretStatePayload?: Record<string, unknown>;
  secretsViewUnavailable: string;
}): JSX.Element {
  if (props.section === 'state') {
    return (
      <div class="grid gap-4 xl:grid-cols-2">
        <Card title={locale.settings.secretStateSection} subtitle={locale.settings.secretState}>
          <pre class="overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">{safeJsonStringify(props.secretStatePayload ?? {})}</pre>
        </Card>
        <Card title={locale.settings.secretsView} subtitle={locale.settings.secretStateHint}>
          <div class="text-sm text-slate-600">{props.secretsViewUnavailable}</div>
        </Card>
      </div>
    );
  }

  return (
    <Card title={locale.settings.writeSecretSection} subtitle={locale.settings.secretsPanelDescription}>
      <div class="grid gap-4">
        <div class="grid gap-4 md:grid-cols-3">
          <Field label={locale.settings.secretKeyLabel}><Input value={props.secretKey} onInput={(event) => props.onSecretKeyChange(event.currentTarget.value)} /></Field>
          <Field label={locale.settings.secretLabelLabel}><Input value={props.secretLabel} onInput={(event) => props.onSecretLabelChange(event.currentTarget.value)} /></Field>
          <Field label={locale.settings.secretValueLabel}><Input type="password" value={props.secretValue} onInput={(event) => props.onSecretValueChange(event.currentTarget.value)} /></Field>
        </div>
        <div class="flex justify-end">
          <Button onClick={props.onSaveSecret} disabled={props.savingSecret || !props.secretValue.trim()}>{locale.common.save}</Button>
        </div>
      </div>
    </Card>
  );
}
