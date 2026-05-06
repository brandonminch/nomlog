import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, AppState, AppStateStatus } from 'react-native';
import { Stack, usePathname, useGlobalSearchParams, useNavigationContainerRef, router } from 'expo-router';
import { isRunningInExpoGo } from 'expo';
import * as Sentry from '@sentry/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as SplashScreen from 'expo-splash-screen';
import { PostHogProvider } from 'posthog-react-native';
import { useAuthStore } from '../src/store/authStore';
import OneSignalService from '../src/services/oneSignalService';
import { supabase } from '../src/config/supabase';
import { LottieLoadingSpinner } from '../src/components/LottieLoadingSpinner';
import { useMealLogRealtime } from '../src/hooks/useMealLogRealtime';
import { posthog } from '../src/config/posthog';
import { OneSignal } from 'react-native-onesignal';
import { useChatAsyncStore } from '../src/store/chatAsyncStore';
import { HealthKitAutoSyncBridge } from '../src/components/HealthKitAutoSyncBridge';
import { maybeSyncProfileTimeZone } from '../src/services/profileTimezoneSync';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

const navigationIntegration = sentryDsn
  ? Sentry.reactNavigationIntegration({
      enableTimeToInitialDisplay: !isRunningInExpoGo(),
    })
  : undefined;

if (sentryDsn && navigationIntegration) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    profilesSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: __DEV__ ? 1.0 : 0.05,
    integrations: [
      navigationIntegration,
      Sentry.mobileReplayIntegration(),
      Sentry.feedbackIntegration({
        namePlaceholder: 'Full name',
        // SDK shallow-merges `styles` onto defaults — overriding `submitButton` replaces the
        // whole default object, so padding/width must be repeated here.
        styles: {
          submitButton: {
            backgroundColor: '#9810fa',
            paddingVertical: 16,
            paddingHorizontal: 20,
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
            marginBottom: 10,
            minHeight: 52,
          },
          submitText: {
            color: '#ffffff',
            fontSize: 17,
            fontWeight: '600',
          },
        },
      }),
    ],
    enableNativeFramesTracking: !isRunningInExpoGo(),
    environment: __DEV__ ? 'development' : 'production',
    debug: __DEV__,
    ...(process.env.EXPO_PUBLIC_API_URL
      ? {
          tracePropagationTargets: [
            'localhost',
            process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, ''),
          ],
        }
      : {}),
  });
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Error boundary so a thrown error shows a message instead of a white screen
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 16, color: '#333', textAlign: 'center' }}>
            Something went wrong. Restart the app.
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 12, textAlign: 'center' }}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// Component to initialize auth store and OneSignal
function AuthInitializer() {
  const initialize = useAuthStore((state) => state.initialize);
  const setSession = useAuthStore((state) => state.setSession);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const addPendingRequestId = useChatAsyncStore((s) => s.addPendingRequestId);
  
  useEffect(() => {
    // Initialize OneSignal early (as recommended by docs)
    const oneSignalService = OneSignalService.getInstance();
    oneSignalService.initialize();
    
    // Initialize auth store
    initialize();
  }, [initialize]);

  // OneSignal handlers (registered early so click events fire reliably).
  useEffect(() => {
    const handleClick = (event: any) => {
      const n = event?.notification;
      const data =
        n?.additionalData ??
        n?.data ??
        n?.payload?.additionalData ??
        n?.rawPayload?.additionalData ??
        null;
      if (!data || typeof data !== 'object') return;
      if ((data as any).type !== 'chat_summary_complete') return;
      const requestId = (data as any).requestId;
      if (typeof requestId !== 'string' || requestId.length === 0) return;
      addPendingRequestId(requestId);
      // Best-effort: bring the user to chat.
      try {
        router.push('/chat');
      } catch (e) {
        console.warn('Failed to navigate to chat on notification click', e);
      }
    };

    const handleForegroundWillDisplay = (event: any) => {
      // If we receive a completion push while in the app, queue it for processing without forcing navigation.
      const n = event?.getNotification?.() ?? event?.notification;
      const data =
        n?.additionalData ??
        n?.data ??
        n?.payload?.additionalData ??
        n?.rawPayload?.additionalData ??
        null;
      if (!data || typeof data !== 'object') return;
      if ((data as any).type !== 'chat_summary_complete') return;
      const requestId = (data as any).requestId;
      if (typeof requestId !== 'string' || requestId.length === 0) return;
      addPendingRequestId(requestId);
    };

    OneSignal.Notifications.addEventListener('click', handleClick);
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', handleForegroundWillDisplay);
    return () => {
      OneSignal.Notifications.removeEventListener('click', handleClick);
      OneSignal.Notifications.removeEventListener('foregroundWillDisplay', handleForegroundWillDisplay);
    };
  }, [addPendingRequestId]);

  // Identify user in PostHog when auth state changes
  useEffect(() => {
    if (!isInitialized) return;
    if (user?.id) {
      posthog.identify(user.id, {
        $set: { email: user.email ?? null },
      });
    } else {
      posthog.reset();
    }
  }, [user?.id, isInitialized]);

  useEffect(() => {
    if (!sentryDsn || !isInitialized) return;
    if (user?.id) {
      Sentry.setUser({ id: user.id, email: user.email ?? undefined });
    } else {
      Sentry.setUser(null);
    }
  }, [user?.id, user?.email, isInitialized]);

  // Keep OneSignal external user ID in sync with auth state
  useEffect(() => {
    if (!isInitialized) return;
    const oneSignalService = OneSignalService.getInstance();

    let cancelled = false;

    const sync = async () => {
      try {
        if (user?.id) {
          const permissionGranted = await oneSignalService.requestPermission();
          if (cancelled) return;
          if (permissionGranted) {
            await oneSignalService.setExternalUserId(user.id);
          }
        } else {
          await oneSignalService.removeExternalUserId();
        }
      } catch (e) {
        console.error('Error syncing OneSignal auth state:', e);
      }
    };

    sync();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isInitialized]);

  // Keep Zustand auth state in sync with Supabase auth events
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [setSession]);

  // Handle app state changes: ensure session is refreshed after backgrounding
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        (supabase.auth as any).startAutoRefresh?.();
        // In React Native, backgrounding can pause timers; force a session read (may refresh)
        supabase.auth
          .getSession()
          .then(({ data }) => {
            setSession(data.session ?? null);
            const uid = data.session?.user?.id;
            const t = data.session?.access_token;
            if (uid && t) {
              void maybeSyncProfileTimeZone(uid, t);
            }
          })
          .catch((error) => {
            console.error('Error getting session on app resume:', error);
          });
      } else {
        (supabase.auth as any).stopAutoRefresh?.();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    (supabase.auth as any).startAutoRefresh?.();

    return () => {
      subscription.remove();
      (supabase.auth as any).stopAutoRefresh?.();
    };
  }, [setSession]);

  // Align server profile timezone with device (throttled) on cold start
  useEffect(() => {
    if (!isInitialized || !user?.id || !token) return;
    void maybeSyncProfileTimeZone(user.id, token);
  }, [isInitialized, user?.id, token]);
  
  return null;
}

/** Subscribes to meal_logs + meals (favorite templates) realtime for the signed-in user. */
function MealLogRealtimeBridge() {
  useMealLogRealtime();
  return null;
}

/** Tracks screen changes for Expo Router navigation. */
function ScreenTracker() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      posthog.screen(pathname, {
        previous_screen: previousPathname.current ?? null,
        ...params,
      });
      previousPathname.current = pathname;
    }
  }, [pathname, params]);

  return null;
}

function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const [appIsReady, setAppIsReady] = React.useState(false);

  useEffect(() => {
    if (!sentryDsn || !navigationIntegration || !navigationRef) return;
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(() => {
    async function prepare() {
      try {
        // Wait for auth initialization to complete
        if (isInitialized) {
          // Add a small delay to ensure everything is ready
          // This gives time for fonts and other resources to load
          await new Promise(resolve => setTimeout(resolve, 100));
          setAppIsReady(true);
        }
      } catch (e) {
        console.warn('Error preparing app:', e);
        setAppIsReady(true); // Still show app even if there's an error
      }
    }

    prepare();
  }, [isInitialized]);

  // Safety timeout: hide splash screen after 3 seconds max
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!appIsReady) {
        console.warn('Splash screen timeout - showing app anyway');
        setAppIsReady(true);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [appIsReady]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // Hide the splash screen once the app is ready
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    // Show a visible loading state so we never show a blank white screen
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
            <LottieLoadingSpinner width={140} />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <RootErrorBoundary>
      <SafeAreaProvider>
      <PostHogProvider
        client={posthog}
        autocapture={{
          captureScreens: false,
          captureTouches: true,
          propsToCapture: ['testID'],
        }}
      >
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <AuthInitializer />
          <MealLogRealtimeBridge />
          <HealthKitAutoSyncBridge />
          <ScreenTracker />
          <Stack
            screenOptions={{
              headerShown: false,
              // Faster transitions: simple_push allows duration control on iOS (default slide does not)
              animation: 'simple_push',
              animationDuration: 250,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="chat" />
            <Stack.Screen name="meal-log-detail" />
            <Stack.Screen name="meal-log-item-detail" />
            <Stack.Screen name="activities-log-detail" />
            <Stack.Screen name="activity-log-item-detail" />
            <Stack.Screen name="favorite-meals" />
            <Stack.Screen name="favorite-meal-detail" />
            <Stack.Screen name="recipe-detail" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="edit-daily-goals" />
          </Stack>
        </BottomSheetModalProvider>
      </QueryClientProvider>
      </PostHogProvider>
      </SafeAreaProvider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}

const AppRoot = sentryDsn ? Sentry.wrap(RootLayout) : RootLayout;
export default AppRoot;
