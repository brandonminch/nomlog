import { Router, Request, Response, RequestHandler } from 'express';
import { supabaseAnon } from '../config/supabase';
import posthog from '../config/posthog';

const router = Router();

// Deprecated for mobile clients: the app should use Supabase Auth directly.
const addDeprecationHeaders = (res: Response) => {
  res.setHeader('X-Nomlog-Deprecated', 'true');
  res.setHeader(
    'X-Nomlog-Deprecation-Notice',
    'Deprecated for mobile clients. Use Supabase Auth directly (supabase-js) and send Bearer access_token to this API.'
  );
};

// Sign up with email and password
const signupHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    addDeprecationHeaders(res);
    console.warn('[DEPRECATED] /api/v1/auth/signup called. Prefer Supabase Auth directly from the client.');
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Email and password are required'
      });
      return;
    }

    const { data, error } = await supabaseAnon.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      posthog.identify({
        distinctId: data.user.id,
        properties: {
          email: data.user.email,
          $set_once: { signup_method: 'email' },
        },
      });
      posthog.capture({
        distinctId: data.user.id,
        event: 'user signed up',
        properties: {
          signup_method: 'email',
        },
      });
    }

    res.status(201).json({
      message: 'User created successfully',
      deprecated: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Error in signup:', error);
    posthog.captureException(error);
    res.status(500).json({
      error: 'Failed to create user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Sign in with email and password
const loginHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    addDeprecationHeaders(res);
    console.warn('[DEPRECATED] /api/v1/auth/login called. Prefer Supabase Auth directly from the client.');
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Email and password are required'
      });
      return;
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      posthog.identify({
        distinctId: data.user.id,
        properties: {
          email: data.user.email,
        },
      });
      posthog.capture({
        distinctId: data.user.id,
        event: 'user logged in',
        properties: {
          login_method: 'email',
        },
      });
    }

    res.json({
      message: 'Login successful',
      deprecated: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Error in login:', error);
    posthog.captureException(error);
    res.status(401).json({
      error: 'Invalid credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Refresh token endpoint
const refreshHandler: RequestHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    addDeprecationHeaders(res);
    console.warn('[DEPRECATED] /api/v1/auth/refresh called. Prefer Supabase Auth directly from the client.');
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({
        error: 'Refresh token is required'
      });
      return;
    }

    const { data, error } = await supabaseAnon.auth.refreshSession({
      refresh_token
    });

    if (error) throw error;

    res.json({
      message: 'Token refreshed successfully',
      deprecated: true,
      user: data.user,
      session: data.session
    });
  } catch (error) {
    console.error('Error in token refresh:', error);
    res.status(401).json({
      error: 'Invalid refresh token',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

router.post('/signup', signupHandler);
router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);

export default router; 