import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
}

export function useTripsDB() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrips = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setTrips(data?.map(t => ({
        ...t,
        kilometres: Number(t.kilometres),
        category: t.category as 'business' | 'personal' | 'uncategorized'
      })) || []);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [user]);

  const addTrip = async (tripData: Omit<Trip, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return null;

    try {
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
    return trips.filter(trip => new Date(trip.date).getFullYear() === year);
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
