/** Weekdays from Monday, as the dashboard's busy-hours grid reads them. */
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0-23 as "12 am" to "11 pm". */
export const hourLabel = (hour: number): string => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;

/** 0 is Monday. */
export const dayName = (day: number): string => FULL_DAYS[day] ?? '';
