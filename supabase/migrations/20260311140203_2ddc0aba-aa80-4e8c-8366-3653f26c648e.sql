-- Soft-delete duplicate expenses: keep receipt entries (with line items), remove statement-only copies
-- Each ID below is the duplicate to remove (the "Added from statement" copy or exact duplicate)

UPDATE public.expenses SET deleted_at = now() WHERE id IN (
  -- Exact duplicates (both "Added from statement", same card)
  'bb0f7281-2380-4f23-90bc-0312c0e68858',  -- 2025-03-15 AMAZON.CA PRIME $11.19 (dup)
  'f8745245-cc43-4fc5-9555-43d6c8d5d1df',  -- 2025-04-02 AMAZON.CA PRIME $1.11 (dup)
  'f66bafa8-be7b-455b-be77-f35b411a9d4f',  -- 2025-06-02 THRIFTY FOODS $4.69 (dup)
  '88725541-a846-4153-8844-8e4d9d0330ba',  -- 2025-12-17 LOVABLE $17.90 (dup)
  
  -- Statement copy when receipt with line items exists (keep receipt, delete statement)
  'fce99936-fdf1-41ba-a268-194849ff0b2b',  -- 2025-07-06 FOR GOOD MEASURE $7.99
  'ef449046-3fb4-4eb1-9d69-9049ad955007',  -- 2025-07-06 BC FERRIES TSA $20.00
  'f9bdfbf2-7940-4686-abc1-27a3a4f15b73',  -- 2025-07-06 SIZZLING TANDOOR $26.02
  '3825f371-15a9-461e-97b8-c7c5148a1f78',  -- 2025-07-08 THRIFTY FOODS $2.98
  '18f21af6-ef77-4b81-af88-d9c9bcc79c7b',  -- 2025-07-10 THRIFTY FOODS $8.14
  'a593d16d-de43-438e-b704-4d6533a8300b',  -- 2025-07-14 THRIFTY FOODS $29.58
  '1c09e015-9416-4a61-9cd4-b45ec18bae74',  -- 2025-07-14 SONU HAIRCUT $34.69
  '7554e92f-da8a-4c9b-be7f-92007c452ea5',  -- 2025-07-15 THRIFTY FOODS $1.98
  '42220554-2e4a-41a8-8a34-bcb3bed1119b',  -- 2025-07-15 THRIFTY FOODS $2.00
  '20f758e4-1f34-494b-a797-23c459d35312',  -- 2025-07-18 BC FERRIES SWB $20.00
  'c8363ed4-c38f-4fad-b69f-412839c9eee3',  -- 2025-07-20 BC FERRIES ONLINE $105.00
  'a1aeab0e-dade-4657-9cd5-a78f0c2d6ec8',  -- 2025-07-24 HI-QUADRA CHEVRON $40.00
  '5bbd9b81-d4d3-4fdd-a782-5ad933553792',  -- 2025-07-24 THRIFTY FOODS $47.63
  'e1487a16-70c6-4bea-93f9-1c919339bae2',  -- 2025-07-26 PETRO-CANADA $50.00
  '3cf79b66-64e5-473c-9271-2887e82ddfbd',  -- 2025-08-06 SUBWAY $9.51
  '5c00e760-f54c-45c9-b3f4-ab8195a2e436',  -- 2025-08-08 THRIFTY FOODS $4.19
  '4d381f61-3bf6-48ca-9595-f1e7ebf3815e',  -- 2025-08-09 THRIFTY FOODS $26.69
  '1aca7bd1-0ec1-402e-8f84-5f9f5feab989',  -- 2025-08-11 THRIFTY FOODS $8.91
  '9051d050-6b74-46d4-b5e6-958e103db99a',  -- 2025-08-18 THRIFTY FOODS $3.15
  'b5ed387d-e4e4-4c9e-9adb-562585adc269',  -- 2025-08-30 BEACON HILL FARMS $27.00
  '41dbeaca-3be9-47f5-9ca4-cc98c29ca5ee',  -- 2025-09-01 SONU HAIRCUT $34.69
  'b487d55e-a209-4b23-a68c-964e305a9f36',  -- 2025-09-20 4 MILE LIQUOR $61.51
  '8d2c11b7-a673-4bb5-b7ec-c1f508c09052',  -- 2025-09-26 MCDONALD'S $6.57
  'b5b801ca-b845-426a-9487-067b0eb7836d',  -- 2025-12-12 R PARKING $10.00
  
  -- Triple duplicate (Aug 21 THRIFTY $3.15) - keep receipt b9066be7, delete 2 statement copies
  '5c0cfcd3-0979-4a92-8237-1cd87431c0a9',  -- 2025-08-21 THRIFTY FOODS (HomeTrust dup)
  '75b2f085-f3fc-4f7e-95a9-f1634e547374',  -- 2025-08-21 THRIFTY FOODS (card 3908 dup)
  
  -- COMPASS duplicate (same date/amount, different cards)
  '8fa6028b-d738-48b7-a142-ad22bb896ecf'   -- 2025-07-06 COMPASS $3.35 (dup)
) AND deleted_at IS NULL;