-- Table to store flagged expense issues for later review
CREATE TABLE public.expense_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL, -- 'duplicate', 'category_check', 'amount_mismatch', 'missing_receipt', 'receipt_match'
  severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error'
  message TEXT NOT NULL,
  details TEXT,
  related_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expense_reviews ENABLE ROW LEVEL SECURITY;

-- Users can only see their own reviews
CREATE POLICY "Users can view their own reviews" ON public.expense_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reviews" ON public.expense_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" ON public.expense_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" ON public.expense_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_expense_reviews_user_unresolved ON public.expense_reviews(user_id, is_resolved) WHERE NOT is_resolved;
CREATE INDEX idx_expense_reviews_expense ON public.expense_reviews(expense_id);

-- Timestamp trigger
CREATE TRIGGER update_expense_reviews_updated_at
  BEFORE UPDATE ON public.expense_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
