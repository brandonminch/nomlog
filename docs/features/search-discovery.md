# Search & Discovery

[← Feature index](../FEATURES.md)

## Core Features

- **Semantic Meal Search**
  - Natural language search queries
  - Vector similarity search using embeddings
  - Search across meal names, descriptions, and nutrition data
  - Configurable similarity threshold
  - Results grouped by similarity ranges
  - Sorted by recency within similarity groups

## Technical Notes

- Uses OpenAI embeddings for semantic search
- PostgreSQL vector similarity search (pgvector)
- Results limited to user's own meal logs
