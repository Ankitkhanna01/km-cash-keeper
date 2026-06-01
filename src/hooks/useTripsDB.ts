import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';

export interface AddressComponents {
  street?: string;
  city?: string;
  postal_code?: string;
  province?: string;
}

export interface Trip {
  id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  start_location: string;
  end_location: string;
  kilometres: number;
  category: 'business' | 'personal' | 'uncategorized';
  created_at: string;
  notes?: string;
  company?: string | null;
  // CRA-compliant structured address fields
  start_street?: string;
  start_city?: string;
  start_postal_code?: string;
  start_province?: string;
  end_street?: string;
  end_city?: string;
  end_postal_code?: string;
  end_province?: string;
  // Coordinates for learning nearby places
  start_lat?: number;
  start_lon?: number;
  end_lat?: number;
  end_lon?: number;
}

export interface TripInput extends Omit<Trip, 'id' | 'user_id' | 'created_at'> {
  start_address?: AddressComponents;
  end_address?: AddressComponents;
}

export function useTripsDB() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = async () => {
    if (!user) return;
    
    try {
      // Paginate to bypass Supabase's 1000-row default limit
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setTrips(all.map(t => ({
        ...t,
        kilometres: Number(t.kilometres),
        category: t.category as 'business' | 'personal' | 'uncategorized'
      })));
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [user]);

  const addTrip = async (tripData: TripInput) => {
    if (!user) return null;

    // Debug logging
    console.log('useTripsDB addTrip - tripData:', tripData);
    console.log('useTripsDB addTrip - start_address:', tripData.start_address);
    console.log('useTripsDB addTrip - end_address:', tripData.end_address);

    try {
      // Extract address components for CRA compliance
      const startAddr = tripData.start_address;
      const endAddr = tripData.end_address;

      const { data, error } = await supabase
        .from('trips')
        .insert({
          user_id: user.id,
          date: tripData.date,
          start_time: tripData.start_time,
          end_time: tripData.end_time,
          start_location: tripData.start_location,
          end_location: tripData.end_location,
          kilometres: tripData.kilometres,
          category: tripData.category,
          notes: tripData.notes,
          company: tripData.company || null,
          // CRA-compliant structured fields
          start_street: startAddr?.street || null,
          start_city: startAddr?.city || null,
          start_postal_code: startAddr?.postal_code || null,
          start_province: startAddr?.province || null,
          end_street: endAddr?.street || null,
          end_city: endAddr?.city || null,
          end_postal_code: endAddr?.postal_code || null,
          end_province: endAddr?.province || null,
          // Coordinates for learning
          start_lat: tripData.start_lat || null,
          start_lon: tripData.start_lon || null,
          end_lat: tripData.end_lat || null,
          end_lon: tripData.end_lon || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      const newTrip = {
        ...data,
        kilometres: Number(data.kilometres),
        category: data.category as 'business' | 'personal' | 'uncategorized'
      };
      
      setTrips(prev => [newTrip, ...prev]);
      return newTrip;
    } catch (error) {
      console.error('Error adding trip:', error);
      toast.error('Failed to add trip');
      return null;
    }
  };

  const updateTrip = async (id: string, updates: Partial<Trip>) => {
    try {
      const { error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setTrips(prev =>
        prev.map(trip => (trip.id === id ? { ...trip, ...updates } : trip))
      );
    } catch (error) {
      console.error('Error updating trip:', error);
      toast.error('Failed to update trip');
    }
  };

  const deleteTrip = async (id: string) => {
    try {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setTrips(prev => prev.filter(trip => trip.id !== id));
    } catch (error) {
      console.error('Error deleting trip:', error);
      toast.error('Failed to delete trip');
    }
  };

  const categorizeTrip = async (id: string, category: 'business' | 'personal') => {
    await updateTrip(id, { category });
  };

  const getUncategorizedTrips = () => {
    return trips.filter(trip => trip.category === 'uncategorized');
  };

  const getTripsByYear = (year: number) => {
    return trips.filter(trip => parseLocalDate(trip.date).getFullYear() === year);
  };

  const getStats = (year?: number) => {
    const filteredTrips = year ? getTripsByYear(year) : trips;
    const businessTrips = filteredTrips.filter(t => t.category === 'business');
    const personalTrips = filteredTrips.filter(t => t.category === 'personal');

    const totalKm = filteredTrips.reduce((sum, t) => sum + t.kilometres, 0);
    const businessKm = businessTrips.reduce((sum, t) => sum + t.kilometres, 0);
    const personalKm = personalTrips.reduce((sum, t) => sum + t.kilometres, 0);

    return {
      totalTrips: filteredTrips.length,
      businessTrips: businessTrips.length,
      personalTrips: personalTrips.length,
      totalKilometres: totalKm,
      businessKilometres: businessKm,
      personalKilometres: personalKm,
      businessPercentage: totalKm > 0 ? (businessKm / totalKm) * 100 : 0,
    };
  };

  return {
    trips,
    loading,
    addTrip,
    updateTrip,
    deleteTrip,
    categorizeTrip,
    getUncategorizedTrips,
    getTripsByYear,
    getStats,
    refetch: fetchTrips,
  };
}
