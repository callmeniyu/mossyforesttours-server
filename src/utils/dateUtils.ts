/**
 * Lightweight date utility functions
 * This file has minimal imports to avoid circular dependencies and performance issues
 */

/**
 * Parse a YYYY-MM-DD date string as Malaysia timezone date object
 * Malaysia is UTC+8, so we store dates at 4 AM UTC which represents noon in Malaysia
 * 
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object representing the date at noon in Malaysia timezone (stored as UTC)
 */
export function parseDateAsMalaysiaTimezone(dateString: string): Date {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD`);
  }
  
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Validate parsed values
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date values in: ${dateString}`);
  }
  
  // 4 AM UTC = 12 PM Malaysia (UTC+8)
  const malaysiaDate = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  
  if (isNaN(malaysiaDate.getTime())) {
    throw new Error(`Invalid date created from: ${dateString}`);
  }
  
  return malaysiaDate;
}

/**
 * Format a Date object as YYYY-MM-DD string in Malaysia timezone
 * Uses Intl API for accurate timezone conversion
 */
export function formatDateAsMalaysiaTimezone(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid Date object provided');
  }
  
  const malaysiaDateStr = date.toLocaleDateString('en-CA', { 
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return malaysiaDateStr;
}

/**
 * STANDARDIZED date-to-string formatter for ALL date formatting in the codebase
 * Replaces inconsistent methods like toISOString().split('T')[0]
 * 
 * @param date - Date object or date-like value
 * @returns YYYY-MM-DD string
 */
export function formatDateToYYYYMMDD(date: Date | string | number): string {
  let dateObj: Date;
  
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string' || typeof date === 'number') {
    dateObj = new Date(date);
  } else {
    throw new Error(`Invalid date type: ${typeof date}`);
  }
  
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid date value: ${date}`);
  }
  
  // Use UTC to avoid timezone shifts for date-only operations
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
