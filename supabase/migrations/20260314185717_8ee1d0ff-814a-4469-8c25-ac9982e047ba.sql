-- Fix MODO: car share, not fuel
UPDATE expenses SET category = 'other' WHERE LOWER(vendor_name) LIKE '%modo%' AND category = 'fuel' AND deleted_at IS NULL;