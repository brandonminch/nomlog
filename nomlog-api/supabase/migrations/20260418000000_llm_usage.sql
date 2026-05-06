-- Ledger for OpenAI Responses API token usage (per-call, provider-reported).

CREATE TABLE IF NOT EXISTS public.llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NULL,
  provider text NOT NULL DEFAULT 'openai',
  endpoint text NOT NULL DEFAULT 'responses',
  route text NULL,
  tag text NULL,
  model text NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  response_id text NULL,
  usage_json jsonb NULL,
  request_group_id uuid NULL,
  attempt_index integer NULL
);

CREATE INDEX IF NOT EXISTS llm_usage_user_id_created_at_idx
  ON public.llm_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_usage_created_at_idx
  ON public.llm_usage (created_at DESC);

COMMENT ON TABLE public.llm_usage IS
  'Append-only log of LLM Responses API usage for quotas and analytics; user_id null for internal jobs.';

-- Sum billed tokens for a user since a timestamp (service role / backend).
CREATE OR REPLACE FUNCTION public.sum_llm_tokens_since(p_user_id uuid, p_since timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(total_tokens), 0)::bigint
  FROM public.llm_usage
  WHERE user_id IS NOT DISTINCT FROM p_user_id
    AND created_at >= p_since;
$$;
