-- Update search_meal_embeddings function to include total_nutrition in results
-- This allows the frontend to display nutrition info in suggestion cards
-- Note: Must DROP and recreate because PostgreSQL doesn't allow changing return type with CREATE OR REPLACE

DROP FUNCTION IF EXISTS search_meal_embeddings(UUID, TEXT, FLOAT, INTEGER);

CREATE FUNCTION search_meal_embeddings(
    p_user_id UUID,
    p_query_embedding TEXT,
    p_threshold FLOAT DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
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
    ORDER BY mle.embedding <=> v_query_embedding
    LIMIT p_limit;
END;
$$;

