-- Versioned prompt attribution for LLM calls (see src/prompts/index.ts).

ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS prompt_key text NULL,
  ADD COLUMN IF NOT EXISTS prompt_version text NULL;

COMMENT ON COLUMN public.llm_usage.prompt_key IS
  'Registry key for a versioned Nomlog prompt template when used; null for inline-only prompts.';
COMMENT ON COLUMN public.llm_usage.prompt_version IS
  'Active version label for prompt_key (e.g. v1); null when prompt_key is null.';
