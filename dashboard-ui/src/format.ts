import type { DashboardRecord } from './types';

export function formatDate(value: unknown): string {
  if (!value) {
    return '-';
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

export function toDatetimeInput(value: unknown): string {
  if (!value) {
    return '';
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);

  return local.toISOString().slice(0, 16);
}

export function recordValue(record: DashboardRecord, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return (value as Record<string, unknown>)[part];
  }, record);
}

export function displayValue(value: unknown): string {
  if (value == null || value === '') {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    return value.join(', ') || '-';
  }

  if (typeof value === 'object') {
    return Object.keys(value).join(', ') || '-';
  }

  return String(value);
}
