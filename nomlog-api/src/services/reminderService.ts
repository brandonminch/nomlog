import { supabaseAdmin } from '../config/supabase';
import { reminderMessageService, ReminderMessage } from './reminderMessageService';
import { DateTime } from 'luxon';

type MealType = 'breakfast' | 'lunch' | 'dinner';

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  return h * 60 + m;
}

async function hasLoggedMealForSlotToday(
  userId: string,
  meal: MealType,
  startOfLocalDayUtcISO: string,
  endOfLocalDayUtcISO: string
): Promise<boolean> {
  // Meal logs can use `logged_at` (preferred) or fall back to `created_at`.
  // We query a narrow local-day UTC window and then match the meal_type in code
  // to be resilient to capitalization/format differences.
  const { data, error } = await supabaseAdmin
    .from('meal_logs')
    .select('id, meal_type')
    .eq('user_id', userId)
    .eq('status', 'logged')
    .or(
      `and(logged_at.gte.${startOfLocalDayUtcISO},logged_at.lte.${endOfLocalDayUtcISO}),and(created_at.gte.${startOfLocalDayUtcISO},created_at.lte.${endOfLocalDayUtcISO})`
    );

  if (error) throw error;

  return (data || []).some((row: any) => {
    const mt = (row.meal_type as string | null | undefined)?.toLowerCase();
    return mt === meal;
  });
}

function getLocalMinutesNow(timezone: string): number {
  const dt = DateTime.now().setZone(timezone);
  if (!dt.isValid) {
    return DateTime.utc().hour * 60 + DateTime.utc().minute;
  }
  return dt.hour * 60 + dt.minute;
}

function getLocalDateString(timezone: string): string {
  const dt = DateTime.now().setZone(timezone);
  if (!dt.isValid) {
    return DateTime.utc().toISODate() ?? '';
  }
  return dt.toISODate() ?? '';
}

async function hasAlreadySent(userId: string, meal: MealType, localDate: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('reminder_sends')
    .select('id')
    .eq('user_id', userId)
    .eq('meal', meal)
    .eq('date', localDate)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return !!data;
}

async function markSent(userId: string, meal: MealType, localDate: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reminder_sends')
    .insert({ user_id: userId, meal, date: localDate });
  if (error) throw error;
}

async function hasAlreadySentPlanned(userId: string, mealLogId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('planned_reminder_sends')
    .select('id')
    .eq('user_id', userId)
    .eq('meal_log_id', mealLogId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return !!data;
}

async function markSentPlanned(userId: string, mealLogId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('planned_reminder_sends')
    .insert({ user_id: userId, meal_log_id: mealLogId });
  if (error) throw error;
}

async function sendOneSignalToExternalId(
  externalId: string,
  meal: MealType
): Promise<void> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) {
    throw new Error('Missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY');
  }

  // Get a random message for this meal type
  const reminderMessage: ReminderMessage = reminderMessageService.getRandomMessage(meal);

  const body = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: [externalId] },
    headings: { en: reminderMessage.title },
    contents: { en: reminderMessage.message },
    data: { type: 'meal_reminder', meal },
  };

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OneSignal error: ${response.status} ${text}`);
  }
}

async function sendPlannedOneSignalToExternalId(
  externalId: string,
  meal: MealType,
  mealLogId: string,
  nameOrDescription: string
): Promise<void> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) {
    throw new Error('Missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY');
  }

  const body = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: [externalId] },
    headings: { en: 'Planned meal reminder' },
    contents: { en: `Time to log: ${nameOrDescription}` },
    data: { type: 'planned_meal_reminder', meal, mealLogId },
  };

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OneSignal error: ${response.status} ${text}`);
  }
}

export class ReminderService {
  // window in minutes around the target time
  private windowMinutes: number;

  constructor(windowMinutes: number = 7) {
    this.windowMinutes = windowMinutes;
  }

  public async run(): Promise<{ sent: number; checked: number }> {
    // Fetch all users with push enabled and who have logged in (exists in auth.users)
    const { data: profiles, error } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, timezone, breakfast_time, lunch_time, dinner_time, push_enabled')
      .eq('push_enabled', true);

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      return { sent: 0, checked: 0 };
    }

    let sentCount = 0;
    let checkedCount = 0;

    for (const profile of profiles as any[]) {
      const userId: string = profile.user_id;
      const timezone: string = profile.timezone || 'UTC';
      const localNowMins = getLocalMinutesNow(timezone);
      const localDate = getLocalDateString(timezone);
      const nowUtc = DateTime.utc();

      // Load today's planned meals (used for both planned reminders and default-reminder suppression)
      const startOfLocalDayUtcISO = DateTime.fromISO(localDate, { zone: timezone }).startOf('day').toUTC().toISO();
      const endOfLocalDayUtcISO = DateTime.fromISO(localDate, { zone: timezone }).endOf('day').toUTC().toISO();

      const { data: plannedToday, error: plannedErr } = await supabaseAdmin
        .from('meal_logs')
        .select('id, meal_type, planned_for, name, description')
        .eq('user_id', userId)
        .eq('status', 'planned')
        .not('planned_for', 'is', null)
        .gte('planned_for', startOfLocalDayUtcISO!)
        .lte('planned_for', endOfLocalDayUtcISO!);

      if (plannedErr) throw plannedErr;

      const plannedByMealType = new Map<MealType, any[]>();
      for (const log of (plannedToday || [])) {
        const mt = (log.meal_type as string | null)?.toLowerCase();
        if (mt === 'breakfast' || mt === 'lunch' || mt === 'dinner') {
          const arr = plannedByMealType.get(mt) || [];
          arr.push(log);
          plannedByMealType.set(mt, arr);
        }
      }

      // Send planned-meal reminders at the specific planned_for time (within a window)
      for (const log of (plannedToday || [])) {
        checkedCount++;
        if (!log.planned_for) continue;
        const plannedForUtc = DateTime.fromISO(log.planned_for, { zone: 'utc' });
        if (!plannedForUtc.isValid) continue;
        const diffMinutes = Math.abs(plannedForUtc.diff(nowUtc, 'minutes').minutes);
        if (diffMinutes > this.windowMinutes) continue;

        const mt = (log.meal_type as string | null)?.toLowerCase();
        if (mt !== 'breakfast' && mt !== 'lunch' && mt !== 'dinner') continue;
        const already = await hasAlreadySentPlanned(userId, log.id);
        if (already) continue;

        const label = (log.name && String(log.name).trim()) || (log.description && String(log.description).trim()) || 'your meal';
        await sendPlannedOneSignalToExternalId(userId, mt, log.id, label);
        await markSentPlanned(userId, log.id);
        sentCount++;
      }

      const meals: { meal: MealType; time: string }[] = [
        { meal: 'breakfast', time: profile.breakfast_time },
        { meal: 'lunch', time: profile.lunch_time },
        { meal: 'dinner', time: profile.dinner_time },
      ];

      for (const { meal, time } of meals) {
        checkedCount++;
        const target = parseTimeToMinutes(time);
        const timeDiff = Math.abs(localNowMins - target);
        console.log(`User ${userId}: ${meal} at ${time} (${target}min), now ${localNowMins}min, diff ${timeDiff}min, window ${this.windowMinutes}min`);
        
        if (timeDiff <= this.windowMinutes) {
          // If there's a planned meal for this meal slot today, suppress the default reminder.
          if ((plannedByMealType.get(meal) || []).length > 0) {
            console.log(`User ${userId}: suppressing ${meal} reminder (planned meal exists)`);
            continue;
          }
          // If the user already logged this meal today, skip the default reminder.
          if (startOfLocalDayUtcISO && endOfLocalDayUtcISO) {
            const alreadyLogged = await hasLoggedMealForSlotToday(
              userId,
              meal,
              startOfLocalDayUtcISO,
              endOfLocalDayUtcISO
            );
            if (alreadyLogged) {
              console.log(`User ${userId}: suppressing ${meal} reminder (meal already logged today)`);
              continue;
            }
          }
          const already = await hasAlreadySent(userId, meal, localDate);
          console.log(`User ${userId}: ${meal} already sent today: ${already}`);
          if (!already) {
            console.log(`Sending ${meal} reminder to user ${userId}`);
            // Use Supabase auth user id as OneSignal external_id
            await sendOneSignalToExternalId(userId, meal);
            await markSent(userId, meal, localDate);
            sentCount++;
            console.log(`Sent ${meal} reminder to user ${userId}`);
          }
        }
      }
    }

    return { sent: sentCount, checked: checkedCount };
  }
}


