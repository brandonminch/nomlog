import { supabase } from '../config/supabase';
import { useAuthStore } from '../store/authStore';
import Constants from 'expo-constants';
import { AppState, AppStateStatus } from 'react-native';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
const API_URL = extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL;

interface ApiRequestOptions extends RequestInit {
  requireAuth?: boolean;
  signal?: AbortSignal;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Custom error for aborted requests (e.g., when app goes to background)
class AbortedRequestError extends Error {
  constructor(message: string = 'Request was cancelled') {
    super(message);
    this.name = 'AbortedRequestError';
  }
}

// Centralized API utility that handles authentication and 401 errors
export class ApiClient {
  private static instance: ApiClient;
  private appState: AppStateStatus = 'active';
  private activeAbortControllers: Set<AbortController> = new Set();

  private constructor() {
    // Listen to app state changes
    AppState.addEventListener('change', this.handleAppStateChange.bind(this));
    this.appState = AppState.currentState;
  }

  private handleAppStateChange(nextAppState: AppStateStatus) {
    this.appState = nextAppState;
    // Note: We don't cancel requests when backgrounding - let them complete naturally.
    // If React Native's network stack fails due to backgrounding, we handle those errors gracefully.
  }

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  private async handleResponse(response: Response): Promise<any> {
    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If we can't parse the error, use the response text
        errorMessage = responseText || errorMessage;
      }
      throw new ApiError(errorMessage, response.status, response);
    }

    if (!responseText || responseText.trim() === '') {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new ApiError(`Failed to parse response: ${responseText}`, response.status, response);
    }
  }

  async request(endpoint: string, options: ApiRequestOptions = {}): Promise<any> {
    return this.makeRequest(endpoint, options, false);
  }

  private async makeRequest(endpoint: string, options: ApiRequestOptions = {}, isRetry: boolean = false): Promise<any> {
    const { requireAuth = true, signal: providedSignal, ...fetchOptions } = options;
    
    // Create an AbortController for this request if one wasn't provided
    let abortController: AbortController | null = null;
    let signal: AbortSignal;
    
    if (providedSignal) {
      signal = providedSignal;
    } else {
      abortController = new AbortController();
      signal = abortController.signal;
      this.activeAbortControllers.add(abortController);
    }
    
    // Clean up abort controller when request completes
    const cleanup = () => {
      if (abortController) {
        this.activeAbortControllers.delete(abortController);
      }
    };
    
    // Get token if authentication is required
    let token: string | null = null;
    if (requireAuth) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        cleanup();
        throw new ApiError('Session error. Please log in again.', 401);
      }
      token = data.session?.access_token ?? null;
      if (!token) {
        cleanup();
        throw new ApiError('Session expired. Please log in again.', 401);
      }
    }

    // Build URL
    const url = `${API_URL}${endpoint}`;
    
    const body = fetchOptions.body;
    const isFormData =
      typeof FormData !== 'undefined' &&
      body != null &&
      typeof body === 'object' &&
      body instanceof FormData;

    // Prepare headers (multipart must omit Content-Type so fetch sets the boundary)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };
    if (!isFormData && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Add authorization header if token is available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    console.log('Making API request:', { url, method: fetchOptions.method || 'GET', isRetry });

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include',
        signal,
      });

      cleanup();
      console.log('API response status:', response.status);
      if (requireAuth && response.status === 401 && !isRetry) {
        console.log('Received 401, attempting Supabase session refresh then retrying once');
        const refreshOk = await useAuthStore.getState().refreshSession();
        if (refreshOk) {
          return this.makeRequest(endpoint, options, true);
        }
        await useAuthStore.getState().signOut();
        throw new ApiError('Session expired. Please log in again.', 401, response);
      }
      return await this.handleResponse(response);
    } catch (error: any) {
      cleanup();
      
      // Handle abort errors gracefully (these can occur if a request is manually cancelled)
      if (error.name === 'AbortError' || error.name === 'AbortedRequestError') {
        console.log('Request was aborted');
        throw new AbortedRequestError('Request was cancelled');
      }
      
      // Don't convert network errors to AbortedRequestError - let them propagate naturally
      // This allows requests to complete even when app is backgrounded
      console.error('API request error:', error);
      throw error;
    }
  }

  // Convenience methods
  async get(endpoint: string, options: Omit<ApiRequestOptions, 'method'> = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint: string, data?: any, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /** Multipart POST (e.g. meal photo). Do not pass JSON Content-Type. */
  async postFormData(endpoint: string, formData: FormData, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
  }

  async put(endpoint: string, data?: any, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch(endpoint: string, data?: any, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete(endpoint: string, options: Omit<ApiRequestOptions, 'method'> = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = ApiClient.getInstance();

// Export error classes for type checking
export { ApiError, AbortedRequestError };
