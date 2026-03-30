
-- Drop restrictive category check constraint
ALTER TABLE expenses DROP CONSTRAINT expenses_category_check;

-- Add new constraint with all needed categories
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category = ANY (ARRAY[
  'fuel', 'repairs', 'insurance', 'licence', 'interest', 'other',
  'grocery', 'restaurant', 'rent', 'phone_internet', 'mobile_bill',
  'professional_fees', 'grooming', 'medical', 'transportation',
  'shopping', 'entertainment', 'health_supplements', 'alcohol',
  'government_fees', 'car_purchase', 'gym'
]));

-- Now fix categories
UPDATE expenses SET category = 'grocery' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) IN ('thrifty foods', 'old country market', 'dollarama', 'shoppers drug mart', 'costco wholesale', 'no frills', 'walmart', 'save-on-foods', '7-eleven');

UPDATE expenses SET category = 'restaurant' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) IN ('mexican village cafe', 'the new mexican village', 'subway 12154', 'subway', 'tim hortons #8449', 'tim hortons #3226', 'kukus catering', 'purdys chocolatier', 'freshii', 'erito sushi', 'himalayan flavours', 'dosa paragon', 'ocean garden');

UPDATE expenses SET category = 'rent' WHERE deleted_at IS NULL AND category = 'other' AND vendor_name = '1598';

UPDATE expenses SET category = 'phone_internet' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%shaw%';

UPDATE expenses SET category = 'mobile_bill' WHERE deleted_at IS NULL AND category = 'other' AND (LOWER(vendor_name) LIKE '%fido%' OR LOWER(vendor_name) LIKE '%fizz%');

UPDATE expenses SET category = 'professional_fees' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) = 'lovable';

UPDATE expenses SET category = 'grooming' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%haircut%';

UPDATE expenses SET category = 'medical' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%pharmasave%';

UPDATE expenses SET category = 'transportation' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) IN ('r parking vic', 'bc ferries swb', 'bc ferries tsa', 'yellow cab', 'city of victoria parking', 'city centre park', 'place face up on dash');

UPDATE expenses SET category = 'shopping' WHERE deleted_at IS NULL AND category = 'other' AND (LOWER(vendor_name) LIKE '%amazon%' OR LOWER(vendor_name) LIKE '%paypal%kitscomtech%');

UPDATE expenses SET category = 'entertainment' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) IN ('end dive', 'langford lanes citycentre');

UPDATE expenses SET category = 'health_supplements' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%blueprint%bryanjohn%';

UPDATE expenses SET category = 'gym' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%fit4less%';

UPDATE expenses SET category = 'alcohol' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) IN ('liquor plus', 'wandering bear', '4 mile');

UPDATE expenses SET category = 'government_fees' WHERE deleted_at IS NULL AND category = 'other' AND LOWER(vendor_name) LIKE '%rsbc%';

-- Remove non-expenses
DELETE FROM expenses WHERE deleted_at IS NULL AND LOWER(vendor_name) IN ('pre-auth debit', 'service charge', 'interest - capitalise');
