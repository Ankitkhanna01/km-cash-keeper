-- Add structured address fields for CRA compliance
ALTER TABLE public.trips
ADD COLUMN start_street text,
ADD COLUMN start_city text,
ADD COLUMN start_postal_code text,
ADD COLUMN start_province text,
ADD COLUMN end_street text,
ADD COLUMN end_city text,
ADD COLUMN end_postal_code text,
ADD COLUMN end_province text;

-- Add comment for documentation
COMMENT ON COLUMN public.trips.start_street IS 'CRA compliance: structured street address for start location';
COMMENT ON COLUMN public.trips.start_postal_code IS 'CRA compliance: postal code for start location';
COMMENT ON COLUMN public.trips.end_street IS 'CRA compliance: structured street address for end location';
COMMENT ON COLUMN public.trips.end_postal_code IS 'CRA compliance: postal code for end location';