-- Add company column to trips table for tracking which delivery service the trip was for
ALTER TABLE public.trips ADD COLUMN company text;