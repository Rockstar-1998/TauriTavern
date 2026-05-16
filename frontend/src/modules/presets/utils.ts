export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

export function humanizeId(input: string): string {
  return input
    .replace(/^__/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function fileStem(fileName: string): string {
  return String(fileName ?? '').replace(/\.[^.]+$/i, '').trim();
}

export function toLineList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).filter((item) => item.trim().length > 0);
  }
  return String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function summarizeValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '开启' : '关闭';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.trim() || '未设置';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.slice(0, 3).map((item) => String(item)).join(', ') : '未设置';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `${keys.length} 项` : '未设置';
  }
  return '未设置';
}
