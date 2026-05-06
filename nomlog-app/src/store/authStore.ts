import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../config/supabase';

type UserShape = {
  id: string;
  email?: string;
};

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  token: string | null;
  user: UserShape | null;
  isLoading: boolean;
  isInitialized: boolean;
  setSession: (session: Session | null) => void;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const toUserShape = (session: Session | null): UserShape | null => {
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
};

const createNonce = async (lengthBytes = 32) => {
  const bytes = await Crypto.getRandomBytesAsync(lengthBytes);
  // Keep it simple: a hex nonce works well for OIDC nonce usage.
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const googleDiscovery = AuthSession.fetchDiscoveryAsync('https://accounts.google.com');

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  token: null,
  user: null,
  isLoading: false,
  isInitialized: false,

  setSession: (session) => {
    set({
      session,
      token: session?.access_token ?? null,
      user: toUserShape(session),
    });
  },

  initialize: async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('supabase.auth.getSession error:', error.message);
      }
      get().setSession(data.session ?? null);
    } finally {
      set({ isInitialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      get().setSession(data.session ?? null);
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // If email confirmations are enabled, `data.session` can be null.
      get().setSession(data.session ?? null);
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const clientId =
        Platform.OS === 'ios'
          ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
          : Platform.OS === 'android'
            ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
            : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

      if (!clientId) {
        throw new Error(
          'Missing Google OAuth client ID. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID (and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for web).',
        );
      }

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'nomlog',
        path: 'auth/callback',
      });

      const discovery = await googleDiscovery;
      const nonce = await createNonce();

      const request = new AuthSession.AuthRequest({
        clientId,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
        extraParams: { nonce },
      });

      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        throw new Error(result.type === 'dismiss' ? 'Google sign-in dismissed.' : 'Google sign-in cancelled.');
      }

      const code = result.params.code;
      if (!code) throw new Error('Google sign-in did not return an authorization code.');
      if (!request.codeVerifier) throw new Error('Missing PKCE code verifier for Google sign-in.');

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
          },
        },
        discovery,
      );

      const idToken = tokenResponse.idToken;
      if (!idToken) throw new Error('Google sign-in did not return an ID token.');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce,
      });
      if (error) throw error;

      get().setSession(data.session ?? null);
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithApple: async () => {
    set({ isLoading: true });
    try {
      if (Platform.OS !== 'ios') {
        throw new Error('Apple sign-in is only available on iOS.');
      }
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple sign-in is not available on this device.');
      }

      const nonce = await createNonce();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
        nonce: hashedNonce,
      });

      const identityToken = credential.identityToken;
      if (!identityToken) throw new Error('Apple sign-in did not return an identity token.');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: identityToken,
        nonce,
      });
      if (error) throw error;

      get().setSession(data.session ?? null);
    } catch (e: any) {
      // expo-apple-authentication throws structured errors, but many surface as a generic message.
      // Log the raw payload so we can see `code`/`domain`/`userInfo` in device logs.
      console.error('Apple sign-in error (raw):', e);

      const code = e?.code as string | undefined;
      if (code === 'ERR_CANCELED') {
        throw new Error('Apple sign-in cancelled.');
      }
      if (code === 'ERR_NOT_HANDLED') {
        throw new Error('Apple sign-in could not be handled on this device.');
      }
      if (code === 'ERR_INVALID_RESPONSE') {
        throw new Error('Apple sign-in returned an invalid response. Please try again.');
      }
      if (code === 'ERR_FAILED') {
        // Common causes: simulator not signed into Apple ID, or missing capability/entitlement.
        throw new Error(
          'Apple sign-in failed. If you are on a simulator, sign into an Apple ID in the iOS Simulator Settings, then try again. If on a device, ensure the app has the “Sign In with Apple” capability enabled for this bundle ID.',
        );
      }
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, token: null, user: null });
  },

  refreshSession: async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return false;
      get().setSession(data.session ?? null);
      return !!data.session;
    } catch (e) {
      console.warn('refreshSession error:', e);
      return false;
    }
  },
}));