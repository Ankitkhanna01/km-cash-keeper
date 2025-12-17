import { format } from 'date-fns';

/**
 * Get current date in local timezone as YYYY-MM-DD string
 */
export function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in local timezone as HH:mm string
 */
export function getLocalTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Parse a date string (YYYY-MM-DD) to a Date object in local timezone
 * This avoids the UTC interpretation issue
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date string for display, handling timezone correctly
 */
export function formatDateForDisplay(dateString: string, formatStr: string = 'MMM d, yyyy'): string {
  const date = parseLocalDate(dateString);
  return format(date, formatStr);
}
