import React, { useState, useRef } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useAuthStore } from '../store/authStore';

export const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [activeAuthAction, setActiveAuthAction] = useState<
    'email' | 'google' | 'apple' | null
  >(null);
  const { signIn, signUp, signInWithGoogle, signInWithApple, isLoading } = useAuthStore();
  const router = useRouter();
  const posthog = usePostHog();
  const passwordInputRef = useRef<TextInput>(null);

  const handleAuth = async () => {
    console.log('handleAuth called', { email, password, isLogin });
    
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setActiveAuthAction('email');
      console.log('Attempting to', isLogin ? 'sign in' : 'sign up');
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      console.log('Auth successful');
      const { token, user } = useAuthStore.getState();
      if (!token) {
        Alert.alert('Almost there', 'Please check your email to confirm your account, then log in.');
        return;
      }
      if (user?.id) {
        posthog.identify(user.id, { $set: { email: user.email ?? null } });
      }
      posthog.capture(isLogin ? 'user_signed_in' : 'user_signed_up', { email });
      // Let the root index route decide whether to send the user
      // to onboarding or home based on their profile state.
      router.replace('/');
    } catch (error: any) {
      console.error('Auth error:', error);
      posthog.capture('$exception', {
        $exception_list: [{ type: 'AuthError', value: error?.message ?? 'Auth failed' }],
        is_login: isLogin,
      });
      Alert.alert('Error', error.message || 'An error occurred');
    } finally {
      setActiveAuthAction(null);
    }
  };

  const finishAuthSuccess = (eventName: 'user_signed_in' | 'user_signed_up', props?: Record<string, any>) => {
    const { token, user } = useAuthStore.getState();
    if (!token) return;
    if (user?.id) {
      posthog.identify(user.id, { $set: { email: user.email ?? null } });
    }
    posthog.capture(eventName, props);
    router.replace('/');
  };

  const handleGoogle = async () => {
    try {
      setActiveAuthAction('google');
      await signInWithGoogle();
      finishAuthSuccess('user_signed_in', { method: 'google' });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Google sign-in failed');
    } finally {
      setActiveAuthAction(null);
    }
  };

  const handleApple = async () => {
    try {
      setActiveAuthAction('apple');
      await signInWithApple();
      finishAuthSuccess('user_signed_in', { method: 'apple' });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Apple sign-in failed');
    } finally {
      setActiveAuthAction(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image 
          source={require('../../assets/nomlog-app-icon-transparent.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{isLogin ? 'Log in' : 'Sign Up'}</Text>
        {isLogin && (
          <Text style={styles.subtitle}>or should we say &quot;nom in&quot; eeehh???</Text>
        )}
        {!isLogin && (
          <Text style={styles.subtitle}>Welcome! Just nom on in!</Text>
        )}

        <TouchableOpacity
          style={[styles.socialButton, isLoading && styles.buttonDisabled]}
          onPress={handleGoogle}
          disabled={isLoading}
        >
          {isLoading && activeAuthAction === 'google' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.socialButtonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.socialButton, styles.appleButton, isLoading && styles.buttonDisabled]}
            onPress={handleApple}
            disabled={isLoading}
          >
            {isLoading && activeAuthAction === 'apple' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.orText}>or</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#A0A0A0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
          blurOnSubmit={false}
        />
        <TextInput
          ref={passwordInputRef}
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#A0A0A0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
          returnKeyType="done"
          onSubmitEditing={handleAuth}
        />
        <TouchableOpacity 
          style={[styles.button, isLoading && styles.buttonDisabled]} 
          onPress={handleAuth}
          disabled={isLoading}
        >
          {isLoading && activeAuthAction === 'email' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isLogin ? 'Login' : 'Sign Up'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsLogin(!isLogin)}
          disabled={isLoading}
        >
          <Text style={styles.switchButtonText}>
            {isLogin
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Login'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1F004B',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    color: '#A0A0A0',
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#4A4A4A',
    backgroundColor: '#2A2A2A',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    color: '#fff',
  },
  socialButton: {
    backgroundColor: '#3B82F6',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  socialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orText: {
    textAlign: 'center',
    color: '#A0A0A0',
    marginBottom: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: '#09BDB8',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  switchButtonText: {
    color: '#A0A0A0',
    fontSize: 16,
  },
}); 