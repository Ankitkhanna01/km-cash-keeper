-- Create odometer_readings table for CRA-compliant tracking
CREATE TABLE public.odometer_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  start_reading NUMERIC NOT NULL DEFAULT 0,
  end_reading NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, year)
);

-- Enable Row Level Security
ALTER TABLE public.odometer_readings ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own odometer readings" 
ON public.odometer_readings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own odometer readings" 
ON public.odometer_readings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own odometer readings" 
ON public.odometer_readings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own odometer readings" 
ON public.odometer_readings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_odometer_readings_updated_at
BEFORE UPDATE ON public.odometer_readings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();