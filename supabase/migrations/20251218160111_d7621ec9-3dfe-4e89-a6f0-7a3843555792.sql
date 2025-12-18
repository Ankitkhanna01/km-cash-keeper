-- Create cached addresses table for storing HERE discoveries
CREATE TABLE public.cached_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  lat NUMERIC NOT NULL,
  lon NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'here',
  search_terms TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hit_count INTEGER NOT NULL DEFAULT 1
);

-- Create index for fast text search
CREATE INDEX idx_cached_addresses_search ON public.cached_addresses USING GIN(search_terms);
CREATE INDEX idx_cached_addresses_location ON public.cached_addresses (lat, lon);

-- Enable RLS but allow public read access (addresses are not sensitive)
ALTER TABLE public.cached_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached addresses"
ON public.cached_addresses
FOR SELECT
USING (true);

CREATE POLICY "Service role can insert/update cached addresses"
ON public.cached_addresses
FOR ALL
USING (true)
WITH CHECK (true);