-- Fix old signed URLs to relative paths by extracting the file path
UPDATE expenses 
SET receipt_url = regexp_replace(
  split_part(receipt_url, '/storage/v1/object/sign/receipts/', 2),
  '\?.*$', ''
)
WHERE receipt_url LIKE '%/storage/v1/object/sign/receipts/%'
AND deleted_at IS NULL;