import { supabaseAdmin } from '../config/supabase';

export type MembershipTier = 'free' | 'premium';

export type LlmQuotaConfig = {
  enabled: true;
  limitTokens: number;
  windowSeconds: number;
  membershipTier: MembershipTier;
};

const DEFAULT_WINDOW_SECONDS = 86400;
const DEFAULT_MEMBERSHIP_TIER: MembershipTier = 'free';
const MEMBERSHIP_LIMITS: Record<MembershipTier, number> = {
  free: 100000,
  premium: 500000,
};

function parseWindowSecondsFromEnv(): number {
  const rawWindow = (process.env.LLM_TOKENS_WINDOW_SECONDS || '').trim();
  const windowSec = rawWindow ? Number.parseInt(rawWindow, 10) : DEFAULT_WINDOW_SECONDS;
  return Number.isFinite(windowSec) && windowSec > 0 ? windowSec : DEFAULT_WINDOW_SECONDS;
}

export function getDefaultLlmQuotaConfig(): LlmQuotaConfig {
  return {
    enabled: true,
    limitTokens: MEMBERSHIP_LIMITS[DEFAULT_MEMBERSHIP_TIER],
    windowSeconds: parseWindowSecondsFromEnv(),
    membershipTier: DEFAULT_MEMBERSHIP_TIER,
  };
}

export async function getUserLlmQuotaConfig(userId: string): Promise<LlmQuotaConfig> {
  const fallback = getDefaultLlmQuotaConfig();

  try {
    const { data, error } = await supabaseAdmin
      .from('user_memberships')
      .select('memberships!inner(slug, daily_token_limit)')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    const memberships = (data as { memberships?: unknown } | null)?.memberships;
    const membership = Array.isArray(memberships) ? memberships[0] : memberships;
    const tier = (membership as { slug?: unknown } | null)?.slug;
    const limitRaw = (membership as { daily_token_limit?: unknown } | null)?.daily_token_limit;
    const limit = Number(limitRaw);

    if ((tier === 'free' || tier === 'premium') && Number.isFinite(limit) && limit > 0) {
      return {
        enabled: true,
        limitTokens: limit,
        windowSeconds: parseWindowSecondsFromEnv(),
        membershipTier: tier,
      };
    }

    console.warn(
      '[llm_quota] Invalid membership config for user; falling back to free tier',
      userId
    );
    return fallback;
  } catch (error) {
    console.warn('[llm_quota] Failed to resolve membership quota; falling back to free tier', error);
    return fallback;
  }
}
