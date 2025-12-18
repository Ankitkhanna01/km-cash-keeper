-- Add lat/lon columns to trips table for learning from past locations
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS start_lat numeric,
ADD COLUMN IF NOT EXISTS start_lon numeric,
ADD COLUMN IF NOT EXISTS end_lat numeric,
ADD COLUMN IF NOT EXISTS end_lon numeric;

-- Create index for faster geo queries
CREATE INDEX IF NOT EXISTS idx_trips_start_coords ON public.trips (start_lat, start_lon) WHERE start_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_end_coords ON public.trips (end_lat, end_lon) WHERE end_lat IS NOT NULL;

-- Add user_id to cached_addresses so users can have personal saved places
ALTER TABLE public.cached_addresses
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS place_name text;