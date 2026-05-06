import React from 'react';
import { Redirect } from 'expo-router';
import { AuthScreen } from '../../src/screens/AuthScreen';
import { useAuthStore } from '../../src/store/authStore';

export default function AuthIndex() {
  const { token } = useAuthStore();

  // If user is authenticated, redirect to main app
  if (token) {
    return <Redirect href="/(tabs)/meal-logs" />;
  }

  return <AuthScreen />;
}
