-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create separate table for meal log embeddings
CREATE TABLE IF NOT EXISTS meal_log_embeddings (
    meal_log_id UUID PRIMARY KEY REFERENCES meal_logs(id) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create HNSW index for fast similarity search
-- HNSW (Hierarchical Navigable Small World) is optimized for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS meal_log_embeddings_embedding_idx 
ON meal_log_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Create index on meal_log_id for efficient joins
CREATE INDEX IF NOT EXISTS meal_log_embeddings_meal_log_id_idx 
ON meal_log_embeddings(meal_log_id);

-- Enable Row Level Security (RLS)
ALTER TABLE meal_log_embeddings ENABLE ROW LEVEL SECURITY;

-- Create policy that allows users to only access embeddings for their own meals
-- This joins through meal_logs to check user_id
CREATE POLICY "Users can only access embeddings for their own meals"
    ON meal_log_embeddings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM meal_logs
            WHERE meal_logs.id = meal_log_embeddings.meal_log_id
            AND meal_logs.user_id = auth.uid()
        )
    );

-- Create RPC function for semantic search
-- This function performs vector similarity search and returns matching meal logs
-- Accepts query_embedding as TEXT and casts to vector for Supabase JS client compatibility
CREATE OR REPLACE FUNCTION search_meal_embeddings(
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

