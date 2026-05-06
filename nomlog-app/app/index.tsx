import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { useUserProfile } from '../src/hooks/useUserProfile';
import { LottieLoadingSpinner } from '../src/components/LottieLoadingSpinner';

export default function Index() {
  const { token, isInitialized } = useAuthStore();
  const { data: profile, isLoading: isProfileLoading } = useUserProfile();

  const isCheckingProfile = !!token && (!profile && isProfileLoading);

  if (!isInitialized || isCheckingProfile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <LottieLoadingSpinner width={140} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/(auth)" />;
  }

  const missingPrimaryGoal = !profile?.primary_goal;
  const missingStats =
    !profile?.date_of_birth || !profile?.height_cm || !profile?.weight_kg;
  const missingSexOrActivity =
    !profile?.biological_sex || !profile?.activity_level;
  const missingTargets = !profile?.daily_calorie_goal;
  const missingOnboardingAcceptance = !profile?.has_completed_onboarding;

  if (
    !profile ||
    missingPrimaryGoal ||
    missingStats ||
    missingSexOrActivity ||
    missingTargets ||
    missingOnboardingAcceptance
  ) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/meal-logs" />;
}

