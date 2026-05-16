import { locale } from '@/shared/i18n';

export class ApiError extends Error {
  readonly status: number;

  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractPayloadMessage(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!isRecord(payload)) {
    return '';
  }

  const directKeys = ['message', 'error', 'reason', 'detail', 'description'];
  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  if (payload.error === true) {
    for (const nestedKey of ['data', 'payload']) {
      const nested = extractPayloadMessage(payload[nestedKey]);
      if (nested) {
        return nested;
      }
    }
  }

  try {
    const serialized = JSON.stringify(payload);
    return serialized && serialized !== '{}' ? serialized : '';
  } catch {
    return '';
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  const payloadMessage = extractPayloadMessage(error);
  if (payloadMessage) {
    return payloadMessage;
  }

  return String(error ?? locale.errors.unknownError);
}
