/**
 * Shared helpers for meal log context (date + meal type).
 * Used by LogsScreen and the chat route when opening the logger with a specific slot.
 */

export type MealTypeTag = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Build a Date for "that calendar day at the meal's configured time" (device local time).
 * Snacks default to 15:00 for non-today dates, but for today we use the current time.
 */
export function getLoggedAtForSlot(
  dateString: string,
  mealType: MealTypeTag,
  profile: { breakfast_time?: string; lunch_time?: string; dinner_time?: string } | null
): Date {
  const [y, m, d] = dateString.split('-').map(Number);

  // For snack logging, prefer the user's current time when they're logging "today".
  // This matches the expectation that the + button logs at the moment of tapping.
  if (mealType === 'snack') {
    const now = new Date();
    const isToday = y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
    if (isToday) {
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        0,
        0
      );
    }
  }

  let timeStr: string;
  if (mealType === 'breakfast') timeStr = profile?.breakfast_time || '08:00';
  else if (mealType === 'lunch') timeStr = profile?.lunch_time || '12:00';
  else if (mealType === 'dinner') timeStr = profile?.dinner_time || '18:00';
  else timeStr = '15:00';
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

/**
 * Build a Date for logging that respects the user's configured meal time, but
 * will use "right now" when the user is logging close to that meal.
 *
 * Rules:
 * - If the target date is today AND the current time is within ±60 minutes of
 *   the configured meal time for breakfast/lunch/dinner, use the current time.
 * - Otherwise, fall back to the profile meal time (via getLoggedAtForSlot).
 * - Snacks use getLoggedAtForSlot (today => current time).
 */
export function getSmartLoggedAtForSlot(
  dateString: string,
  mealType: MealTypeTag,
  profile: { breakfast_time?: string; lunch_time?: string; dinner_time?: string } | null
): Date {
  // Always respect the existing behavior if we don't have a profile.
  if (!profile) {
    return getLoggedAtForSlot(dateString, mealType, profile);
  }

  // Only apply "current time" logic when logging for today.
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  const [slotY, slotM, slotD] = dateString.split('-').map(Number);
  const isToday =
    slotY === todayY &&
    slotM === todayM &&
    slotD === todayD;

  if (!isToday) {
    return getLoggedAtForSlot(dateString, mealType, profile);
  }

  // For snacks, there is no configured meal time; keep existing behavior.
  if (mealType === 'snack') {
    return getLoggedAtForSlot(dateString, mealType, profile);
  }

  const parseTimeToMinutes = (timeString: string): number => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let mealTimeMinutes: number;

  if (mealType === 'breakfast') {
    mealTimeMinutes = parseTimeToMinutes(profile.breakfast_time || '08:00');
  } else if (mealType === 'lunch') {
    mealTimeMinutes = parseTimeToMinutes(profile.lunch_time || '12:00');
  } else {
    mealTimeMinutes = parseTimeToMinutes(profile.dinner_time || '18:00');
  }

  const diffMinutes = Math.abs(currentMinutes - mealTimeMinutes);

  // If within the 1-hour window before/after the configured meal time,
  // log at the current time of day.
  if (diffMinutes <= 60) {
    return new Date(
      todayY,
      todayM - 1,
      todayD,
      now.getHours(),
      now.getMinutes(),
      0,
      0
    );
  }

  // Otherwise, stick with the profile meal time for that day.
  return getLoggedAtForSlot(dateString, mealType, profile);
}
