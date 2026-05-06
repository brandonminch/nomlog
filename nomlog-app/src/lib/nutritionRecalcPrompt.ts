import { Alert } from 'react-native';
import type { UserProfile } from '../hooks/useUserProfile';

export function shouldOfferNutritionRecalc(profile: UserProfile | null | undefined): boolean {
  return profile != null && profile.daily_calorie_goal != null;
}

type PatchProfileFn = (recalculate: boolean) => Promise<unknown>;

/** @returns whether a patch was applied (false if user dismissed the alert). */
export async function patchWithOptionalNutritionRecalc(
  profile: UserProfile | null | undefined,
  applyPatch: PatchProfileFn
): Promise<boolean> {
  if (!shouldOfferNutritionRecalc(profile)) {
    await applyPatch(false);
    return true;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    Alert.alert(
      'Update daily goals?',
      'This change can update your recommended daily calories and macros.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => finish(false) },
        {
          text: 'Keep current goals',
          onPress: () => void applyPatch(false).then(() => finish(true)).catch(() => finish(false)),
        },
        {
          text: 'Update goals',
          onPress: () => void applyPatch(true).then(() => finish(true)).catch(() => finish(false)),
        },
      ]
    );
  });
}
