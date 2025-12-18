-- Fix PUBLIC_DATA_EXPOSURE: Restrict cached_addresses read access

-- 1) Drop overly permissive policies
DROP POLICY IF EXISTS "Anyone can read cached addresses" ON public.cached_addresses;
DROP POLICY IF EXISTS "Service role can insert/update cached addresses" ON public.cached_addresses;

-- 2) Allow authenticated users to read shared cache (user_id IS NULL) OR their own saved places
CREATE POLICY "Authenticated users can read cached addresses"
ON public.cached_addresses
FOR SELECT
TO authenticated
USING (
  user_id IS NULL OR user_id = auth.uid()
);

-- 3) Allow authenticated users to insert their own saved places only
CREATE POLICY "Users can insert their own cached addresses"
ON public.cached_addresses
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 4) Allow authenticated users to update their own saved places only
CREATE POLICY "Users can update their own cached addresses"
ON public.cached_addresses
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 5) Allow authenticated users to delete their own saved places only
CREATE POLICY "Users can delete their own cached addresses"
ON public.cached_addresses
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- 6) Allow service role full access for Edge Functions to manage shared cache
CREATE POLICY "Service role can manage cached addresses"
ON public.cached_addresses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);