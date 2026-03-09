import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface OdometerReading {
  id: string;
  user_id: string;
  year: number;
  start_reading: number;
  end_reading: number | null;
  created_at: string;
  updated_at: string;
}

export function useOdometerDB() {
  const { user } = useAuth();
  const [readings, setReadings] = useState<OdometerReading[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReadings = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('odometer_readings')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      
      setReadings(data?.map(r => ({
        ...r,
        start_reading: Number(r.start_reading),
        end_reading: r.end_reading !== null ? Number(r.end_reading) : null,
      })) || []);
    } catch (error) {
      console.error('Error fetching odometer readings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadings();
  }, [user]);

  const getReadingForYear = (year: number): OdometerReading | undefined => {
    return readings.find(r => r.year === year);
  };

  const upsertReading = async (year: number, startReading: number, endReading: number | null) => {
    if (!user) return null;

    try {
      const existing = getReadingForYear(year);
      
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('odometer_readings')
          .update({
            start_reading: startReading,
            end_reading: endReading,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;

        const updated = {
          ...data,
          start_reading: Number(data.start_reading),
          end_reading: data.end_reading !== null ? Number(data.end_reading) : null,
        };

        setReadings(prev => prev.map(r => r.id === existing.id ? updated : r));
        toast.success('Odometer reading updated');
        return updated;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('odometer_readings')
          .insert({
            user_id: user.id,
            year,
            start_reading: startReading,
            end_reading: endReading,
          })
          .select()
          .single();

        if (error) throw error;

        const newReading = {
          ...data,
          start_reading: Number(data.start_reading),
          end_reading: data.end_reading ? Number(data.end_reading) : null,
        };

        setReadings(prev => [newReading, ...prev]);
        toast.success('Odometer reading saved');
        return newReading;
      }
    } catch (error) {
      console.error('Error saving odometer reading:', error);
      toast.error('Failed to save odometer reading');
      return null;
    }
  };

  const getTotalKmForYear = (year: number): number | null => {
    const reading = getReadingForYear(year);
    if (!reading || reading.end_reading === null) return null;
    return reading.end_reading - reading.start_reading;
  };

  const getBusinessPercentage = (year: number, businessKm: number): number => {
    const totalKm = getTotalKmForYear(year);
    if (totalKm === null || totalKm <= 0) return 0;
    return (businessKm / totalKm) * 100;
  };

  return {
    readings,
    loading,
    getReadingForYear,
    upsertReading,
    getTotalKmForYear,
    getBusinessPercentage,
    refetch: fetchReadings,
  };
}
