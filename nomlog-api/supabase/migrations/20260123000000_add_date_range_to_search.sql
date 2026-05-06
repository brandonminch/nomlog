-- Update search_meal_embeddings function to support optional date range filtering
-- This allows filtering meals by date range (e.g., last 30 days)
-- Note: Must DROP and recreate because PostgreSQL doesn't allow changing return type with CREATE OR REPLACE

DROP FUNCTION IF EXISTS search_meal_embeddings(UUID, TEXT, FLOAT, INTEGER);

CREATE FUNCTION search_meal_embeddings(
    p_user_id UUID,
    p_query_embedding TEXT,
    p_threshold FLOAT DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10,
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    logged_at TIMESTAMP WITH TIME ZONE,
    total_nutrition JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_query_embedding vector(1536);
BEGIN
    -- Cast text to vector
    v_query_embedding := p_query_embedding::vector(1536);
    
    RETURN QUERY
    SELECT 
        ml.id,
        ml.name,
        ml.description,
        ml.logged_at,
        ml.total_nutrition,
        1 - (mle.embedding <=> v_query_embedding)::FLOAT as similarity
    FROM meal_log_embeddings mle
    JOIN meal_logs ml ON mle.meal_log_id = ml.id
    WHERE ml.user_id = p_user_id
      AND 1 - (mle.embedding <=> v_query_embedding)::FLOAT >= p_threshold
      -- Date range filtering: use logged_at if available, otherwise use created_at
      AND (
        (p_start_date IS NULL AND p_end_date IS NULL)
        OR (
          COALESCE(ml.logged_at, ml.created_at) >= COALESCE(p_start_date, '1970-01-01'::TIMESTAMP WITH TIME ZONE)
          AND COALESCE(ml.logged_at, ml.created_at) <= COALESCE(p_end_date, NOW())
        )
      )
    ORDER BY mle.embedding <=> v_query_embedding
    LIMIT p_limit;
END;
$$;
