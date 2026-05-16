export function formatTimestamp(value: number | string | undefined): string {
  if (value == null || value === '') {
    return '?';
  }

  if (typeof value === 'string' && Number.isNaN(Number(value))) {
    return value;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  const date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatRelativeTime(value: number | string | undefined): string {
  if (value == null || value === '') {
    return '??';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  const date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
  const diff = date.getTime() - Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  if (Math.abs(diff) < hour) return rtf.format(Math.round(diff / minute), 'minute');
  if (Math.abs(diff) < day) return rtf.format(Math.round(diff / hour), 'hour');
  return rtf.format(Math.round(diff / day), 'day');
}

export function humanFileSize(value: string | number | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = numeric;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function createCreateDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}@${pick('hour')}h${pick('minute')}m${pick('second')}s`;
}

export function createSendDate(date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function avatarStem(value: string): string {
  return String(value || '').replace(/\.png$/i, '');
}

export function chatFileStem(value: string): string {
  return String(value || '').replace(/\.jsonl$/i, '');
}

export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
