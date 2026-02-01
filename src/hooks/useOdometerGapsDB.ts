import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { OdometerGap, GapCategory, GapStatus } from '@/types/documents';

function mapDbToGap(g: {
  id: string;
  user_id: string;
  year: number;
  logged_business_km: number;
  logged_personal_km: number;
  odometer_total_km: number;
  gap_km: number;
  gap_status: string;
  gap_category: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): OdometerGap {
  return {
    id: g.id,
    user_id: g.user_id,
    year: g.year,
    logged_business_km: Number(g.logged_business_km),
    logged_personal_km: Number(g.logged_personal_km),
    odometer_total_km: Number(g.odometer_total_km),
    gap_km: Number(g.gap_km),
    gap_status: g.gap_status as GapStatus,
    gap_category: (g.gap_category || 'personal') as GapCategory,
    confirmed_at: g.confirmed_at,
    notes: g.notes,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

export function useOdometerGapsDB() {
  const { user } = useAuth();
  const [gaps, setGaps] = useState<OdometerGap[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGaps = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('odometer_gaps')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      
      setGaps(data?.map(mapDbToGap) || []);
    } catch (error) {
      console.error('Error fetching odometer gaps:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  const calculateGap = async (
    year: number,
    loggedBusinessKm: number,
    loggedPersonalKm: number,
    odometerTotalKm: number
  ) => {
    if (!user) return null;

    const totalLogged = loggedBusinessKm + loggedPersonalKm;
    const gapKm = odometerTotalKm - totalLogged;

    try {
      const { data, error } = await supabase
        .from('odometer_gaps')
        .upsert({
          user_id: user.id,
          year,
          logged_business_km: loggedBusinessKm,
          logged_personal_km: loggedPersonalKm,
          odometer_total_km: odometerTotalKm,
          gap_km: gapKm,
          gap_status: gapKm > 0 ? 'pending' : 'confirmed',
          gap_category: 'personal',
        }, {
          onConflict: 'user_id,year'
        })
        .select()
        .single();

      if (error) throw error;

      const newGap = mapDbToGap(data);

      setGaps(prev => {
        const existing = prev.find(g => g.year === year);
        if (existing) {
          return prev.map(g => g.year === year ? newGap : g);
        }
        return [newGap, ...prev];
      });

      return newGap;
    } catch (error) {
      console.error('Error calculating gap:', error);
      toast.error('Failed to calculate odometer gap');
      return null;
    }
  };

  const confirmGap = async (year: number, category: GapCategory, notes?: string) => {
    if (!user) return null;

    const gap = gaps.find(g => g.year === year);
    if (!gap) return null;

    try {
      const { data, error } = await supabase
        .from('odometer_gaps')
        .update({
          gap_status: 'confirmed',
          gap_category: category,
          confirmed_at: new Date().toISOString(),
          notes,
        })
        .eq('id', gap.id)
        .select()
        .single();

      if (error) throw error;

      const updated = mapDbToGap(data);
      setGaps(prev => prev.map(g => g.year === year ? updated : g));
      toast.success(`Gap confirmed as ${category}`);
      return updated;
    } catch (error) {
      console.error('Error confirming gap:', error);
      toast.error('Failed to confirm gap');
      return null;
    }
  };

  const dismissGap = async (year: number, notes?: string) => {
    if (!user) return null;

    const gap = gaps.find(g => g.year === year);
    if (!gap) return null;

    try {
      const { data, error } = await supabase
        .from('odometer_gaps')
        .update({
          gap_status: 'dismissed',
          notes,
        })
        .eq('id', gap.id)
        .select()
        .single();

      if (error) throw error;

      const updated = mapDbToGap(data);
      setGaps(prev => prev.map(g => g.year === year ? updated : g));
      toast.success('Gap dismissed');
      return updated;
    } catch (error) {
      console.error('Error dismissing gap:', error);
      toast.error('Failed to dismiss gap');
      return null;
    }
  };

  const getGapForYear = (year: number) => gaps.find(g => g.year === year);

  const hasPendingGaps = () => gaps.some(g => g.gap_status === 'pending' && g.gap_km > 0);

  return {
    gaps,
    loading,
    calculateGap,
    confirmGap,
    dismissGap,
    getGapForYear,
    hasPendingGaps,
    refetch: fetchGaps,
  };
}
