import { fromZonedTime } from 'date-fns-tz';

/**
 * Converts a local date (in guild's timezone) to UTC.
 * The input date is treated as a date in the given timezone
 * and converted to its UTC equivalent.
 */
export function convertToUtc(date: Date, timezone: string): Date {
  return fromZonedTime(date, timezone);
}

/**
 * Validates that a timezone string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses a date string in YYYYMMDD HH:MM format.
 * Returns null if the format is invalid.
 */
export function parseDate(input: string): Date | null {
  const match = input.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
  );

  // Validate the date components are real (e.g., no Feb 30)
  if (
    date.getFullYear() !== parseInt(year) ||
    date.getMonth() !== parseInt(month) - 1 ||
    date.getDate() !== parseInt(day)
  ) {
    return null;
  }

  return date;
}
