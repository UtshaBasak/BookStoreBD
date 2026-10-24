import { digits, t } from '../../utils/language.js';

/** Weekdays from Monday, as the dashboard's busy-hours grid reads them. */
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FULL_DAYS_BN = ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার'];

/** 0-23 as "12 am" to "11 pm"; in Bangla "সকাল ৯টা", "রাত ১১টা". */
export const hourLabel = (hour: number): string =>
  t(`${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`, `${bnPartOfDay(hour)} ${digits(hour % 12 || 12)}টা`);

/** The part of the day Bangla names an hour by. */
const bnPartOfDay = (hour: number): string =>
  hour < 4 ? 'রাত' : hour < 6 ? 'ভোর' : hour < 12 ? 'সকাল' : hour < 16 ? 'দুপুর' : hour < 18 ? 'বিকেল' : hour < 20 ? 'সন্ধ্যা' : 'রাত';

/** 0 is Monday. */
export const dayName = (day: number): string => t(FULL_DAYS[day] ?? '', FULL_DAYS_BN[day] ?? '');
