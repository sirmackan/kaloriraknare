-- Migration 0001: M3 Database Performance, Indexes & JSONB Storage
-- Kaloriräknare

-- 1. Enable pg_trgm extension for substring and trigram index support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram index on ingredients.name for fast ilike substring search
CREATE INDEX IF NOT EXISTS ingredients_name_trgm_idx 
ON ingredients USING gin (name gin_trgm_ops);

-- 3. B-Tree index on ingredients.barcode for fast barcode lookups
CREATE INDEX IF NOT EXISTS ingredients_barcode_idx 
ON ingredients (barcode);

-- 4. Composite index on meals (user_id, date) for date navigation & meal aggregation
CREATE INDEX IF NOT EXISTS meals_user_id_date_idx 
ON meals (user_id, date);

-- 5. Index on meals (user_id, created_at) for recent meal history queries
CREATE INDEX IF NOT EXISTS meals_user_id_created_at_idx 
ON meals (user_id, created_at DESC);

-- 6. Index on recipes (user_id) for user recipe lookups
CREATE INDEX IF NOT EXISTS recipes_user_id_idx 
ON recipes (user_id);

-- 7. Convert recipes.items_json from text to native PostgreSQL jsonb
ALTER TABLE recipes 
  ALTER COLUMN items_json TYPE jsonb 
  USING (COALESCE(NULLIF(items_json, ''), '[]')::jsonb);

-- 8. Set default value of items_json to empty jsonb array
ALTER TABLE recipes 
  ALTER COLUMN items_json SET DEFAULT '[]'::jsonb;
