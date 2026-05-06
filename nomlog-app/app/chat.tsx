import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../src/screens/ChatScreen';
import { useUserProfile } from '../src/hooks/useUserProfile';
import { getLoggedAtForSlot } from '../src/utils/mealLogContext';
import type { MealTypeTag } from '../src/utils/mealLogContext';
import { getLoggedAtForActivityDay } from '../src/utils/activityLogDate';
import { parseChatLoggerParam } from '../src/utils/chatRouteParams';

export default function ChatPage() {
  const params = useLocalSearchParams<{
    dateString?: string | string[];
    mealType?: string | string[];
    mealLogId?: string | string[];
    editMeal?: string | string[];
    /** `meal` | `activity` — see `parseChatLoggerParam` in `src/utils/chatRouteParams.ts` */
    logger?: string | string[];
    /** `log` | `plan` — see `parseChatModeParam` in `src/utils/chatRouteParams.ts` */
    mode?: string | string[];
  }>();
  const { data: profile } = useUserProfile();

  const dateStringParam = Array.isArray(params.dateString) ? params.dateString[0] : params.dateString;
  const mealTypeParam = (Array.isArray(params.mealType) ? params.mealType[0] : params.mealType)?.toLowerCase() as MealTypeTag | undefined;
  const mealLogIdParam = Array.isArray(params.mealLogId) ? params.mealLogId[0] : params.mealLogId;
  const editMealParam = Array.isArray(params.editMeal) ? params.editMeal[0] : params.editMeal;
  const loggerParam = Array.isArray(params.logger) ? params.logger[0] : params.logger;
  const loggerKind = parseChatLoggerParam(loggerParam);

  const initialLoggedAt =
    dateStringParam && mealTypeParam && profile
      ? getLoggedAtForSlot(dateStringParam, mealTypeParam, profile)
      : dateStringParam && loggerKind === 'activity'
        ? getLoggedAtForActivityDay(dateStringParam)
        : undefined;
  const initialMealType = mealTypeParam;

  return (
    <ChatScreen
      initialLoggedAt={initialLoggedAt}
      initialMealType={initialMealType}
      mealLogId={mealLogIdParam}
      isEditMealMode={editMealParam === 'true'}
    />
  );
}
