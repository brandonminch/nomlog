import { createClient } from '@supabase/supabase-js';
import type { RealtimeClientOptions } from '@supabase/realtime-js';
import WebSocket from 'ws';

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable');
}

// Server best-practice: do not persist sessions or auto-refresh tokens in a shared Node process.
// Node.js 20 has no global WebSocket; @supabase/realtime-js requires `ws` as transport until Node 22+.
const serverClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    // `ws` constructor typings don't match DOM WebSocket; runtime shape is compatible.
    transport: WebSocket as unknown as NonNullable<RealtimeClientOptions['transport']>,
  },
} as const;

// Use for database/admin operations (service role; never expose to clients).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  serverClientOptions
);

// Use for verifying access tokens / user lookup (anon key is sufficient).
export const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  serverClientOptions
);