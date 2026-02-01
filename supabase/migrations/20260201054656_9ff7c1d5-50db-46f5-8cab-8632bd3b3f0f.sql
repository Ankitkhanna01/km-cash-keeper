-- Create documents table for tracking all uploaded documents (paystubs, tax forms, receipts, etc.)
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('paystub', 'tax_form', 'bank_record', 'receipt', 'other')),
  source_type TEXT NOT NULL CHECK (source_type IN ('primary', 'secondary')),
  platform TEXT CHECK (platform IN ('uber', 'doordash', 'skip', 'other', NULL)),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  income_amount NUMERIC,
  kilometres NUMERIC,
  has_verified_km BOOLEAN NOT NULL DEFAULT false,
  estimated_km NUMERIC,
  document_url TEXT,
  raw_ocr_data JSONB,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create performance_ratios table to cache calculated ratios
CREATE TABLE public.performance_ratios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  platform TEXT CHECK (platform IN ('uber', 'doordash', 'skip', 'combined', NULL)),
  km_per_dollar NUMERIC NOT NULL,
  source_document_count INTEGER NOT NULL DEFAULT 0,
  total_km NUMERIC NOT NULL DEFAULT 0,
  total_income NUMERIC NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, platform)
);

-- Create odometer_gaps table for tracking discrepancies
CREATE TABLE public.odometer_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  logged_business_km NUMERIC NOT NULL DEFAULT 0,
  logged_personal_km NUMERIC NOT NULL DEFAULT 0,
  odometer_total_km NUMERIC NOT NULL DEFAULT 0,
  gap_km NUMERIC NOT NULL DEFAULT 0,
  gap_status TEXT NOT NULL DEFAULT 'pending' CHECK (gap_status IN ('pending', 'confirmed', 'dismissed')),
  gap_category TEXT DEFAULT 'personal' CHECK (gap_category IN ('personal', 'commute', 'business', 'other')),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year)
);

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_ratios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odometer_gaps ENABLE ROW LEVEL SECURITY;

-- Documents RLS Policies
CREATE POLICY "Users can view their own documents" 
ON public.documents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents" 
ON public.documents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" 
ON public.documents 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" 
ON public.documents 
FOR DELETE 
USING (auth.uid() = user_id);

-- Performance Ratios RLS Policies
CREATE POLICY "Users can view their own ratios" 
ON public.performance_ratios 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own ratios" 
ON public.performance_ratios 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratios" 
ON public.performance_ratios 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratios" 
ON public.performance_ratios 
FOR DELETE 
USING (auth.uid() = user_id);

-- Odometer Gaps RLS Policies
CREATE POLICY "Users can view their own gaps" 
ON public.odometer_gaps 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own gaps" 
ON public.odometer_gaps 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gaps" 
ON public.odometer_gaps 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gaps" 
ON public.odometer_gaps 
FOR DELETE 
USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_ratios_updated_at
BEFORE UPDATE ON public.performance_ratios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_odometer_gaps_updated_at
BEFORE UPDATE ON public.odometer_gaps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();