import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Document, PerformanceRatio, GigPlatform, DocumentType, SourceType } from '@/types/documents';
import type { Json } from '@/integrations/supabase/types';

function mapDbToDocument(d: {
  id: string;
  user_id: string;
  document_type: string;
  source_type: string;
  platform: string | null;
  period_year: number;
  period_month: number;
  income_amount: number | null;
  kilometres: number | null;
  has_verified_km: boolean;
  estimated_km: number | null;
  document_url: string | null;
  raw_ocr_data: Json;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): Document {
  return {
    id: d.id,
    user_id: d.user_id,
    document_type: d.document_type as DocumentType,
    source_type: d.source_type as SourceType,
    platform: d.platform as GigPlatform,
    period_year: d.period_year,
    period_month: d.period_month,
    income_amount: d.income_amount ? Number(d.income_amount) : null,
    kilometres: d.kilometres ? Number(d.kilometres) : null,
    has_verified_km: d.has_verified_km,
    estimated_km: d.estimated_km ? Number(d.estimated_km) : null,
    document_url: d.document_url,
    raw_ocr_data: d.raw_ocr_data as Record<string, unknown> | null,
    notes: d.notes,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

function mapDbToRatio(r: {
  id: string;
  user_id: string;
  year: number;
  platform: string | null;
  km_per_dollar: number;
  source_document_count: number;
  total_km: number;
  total_income: number;
  last_calculated_at: string;
  created_at: string;
}): PerformanceRatio {
  return {
    id: r.id,
    user_id: r.user_id,
    year: r.year,
    platform: (r.platform || 'combined') as GigPlatform | 'combined',
    km_per_dollar: Number(r.km_per_dollar),
    source_document_count: r.source_document_count,
    total_km: Number(r.total_km),
    total_income: Number(r.total_income),
    last_calculated_at: r.last_calculated_at,
    created_at: r.created_at,
  };
}

export function useDocumentsDB() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [ratios, setRatios] = useState<PerformanceRatio[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false });

      if (error) throw error;
      
      setDocuments(data?.map(mapDbToDocument) || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  }, [user]);

  const fetchRatios = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('performance_ratios')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      
      setRatios(data?.map(mapDbToRatio) || []);
    } catch (error) {
      console.error('Error fetching ratios:', error);
    }
  }, [user]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([fetchDocuments(), fetchRatios()]);
      setLoading(false);
    };
    fetchAll();
  }, [fetchDocuments, fetchRatios]);

  const addDocument = async (doc: Omit<Document, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          document_type: doc.document_type,
          source_type: doc.source_type,
          platform: doc.platform,
          period_year: doc.period_year,
          period_month: doc.period_month,
          income_amount: doc.income_amount,
          kilometres: doc.kilometres,
          has_verified_km: doc.has_verified_km,
          estimated_km: doc.estimated_km,
          document_url: doc.document_url,
          raw_ocr_data: doc.raw_ocr_data as Json,
          notes: doc.notes,
        })
        .select()
        .single();

      if (error) throw error;

      const newDoc = mapDbToDocument(data);
      setDocuments(prev => [newDoc, ...prev]);
      
      // Recalculate ratios after adding any document with income
      // (ratios now also use logged trip KM as fallback)
      if (newDoc.income_amount && newDoc.income_amount > 0) {
        // Refetch documents first so recalculateRatios has fresh state
        await fetchDocuments();
        await recalculateRatios();
      }
      
      toast.success('Document added successfully');
      return newDoc;
    } catch (error) {
      console.error('Error adding document:', error);
      toast.error('Failed to add document');
      return null;
    }
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    if (!user) return null;

    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.document_type !== undefined) dbUpdates.document_type = updates.document_type;
      if (updates.source_type !== undefined) dbUpdates.source_type = updates.source_type;
      if (updates.platform !== undefined) dbUpdates.platform = updates.platform;
      if (updates.period_year !== undefined) dbUpdates.period_year = updates.period_year;
      if (updates.period_month !== undefined) dbUpdates.period_month = updates.period_month;
      if (updates.income_amount !== undefined) dbUpdates.income_amount = updates.income_amount;
      if (updates.kilometres !== undefined) dbUpdates.kilometres = updates.kilometres;
      if (updates.has_verified_km !== undefined) dbUpdates.has_verified_km = updates.has_verified_km;
      if (updates.estimated_km !== undefined) dbUpdates.estimated_km = updates.estimated_km;
      if (updates.document_url !== undefined) dbUpdates.document_url = updates.document_url;
      if (updates.raw_ocr_data !== undefined) dbUpdates.raw_ocr_data = updates.raw_ocr_data as Json;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

      const { data, error } = await supabase
        .from('documents')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updated = mapDbToDocument(data);
      setDocuments(prev => prev.map(d => d.id === id ? updated : d));
      
      // Recalculate ratios if KM changed
      if (updates.kilometres !== undefined || updates.has_verified_km !== undefined) {
        await recalculateRatios();
      }
      
      toast.success('Document updated');
      return updated;
    } catch (error) {
      console.error('Error updating document:', error);
      toast.error('Failed to update document');
      return null;
    }
  };

  const deleteDocument = async (id: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDocuments(prev => prev.filter(d => d.id !== id));
      await recalculateRatios();
      toast.success('Document deleted');
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
      return false;
    }
  };

  // Calculate performance ratios from documents with income, using either
  // document-verified KM or logged trip KM for the same year/month
  const recalculateRatios = async () => {
    if (!user) return;

    // Get all documents that have income
    const docsWithIncome = documents.filter(d => 
      d.income_amount !== null && d.income_amount > 0
    );

    if (docsWithIncome.length === 0) return;

    // Fetch logged business trip KM grouped by year/month to use as fallback
    let tripKmByMonth: Map<string, number> = new Map();
    try {
      const { data: tripData } = await supabase
        .from('trips')
        .select('date, kilometres, category')
        .eq('category', 'business');

      if (tripData) {
        for (const trip of tripData) {
          const d = new Date(trip.date + 'T12:00:00');
          const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
          tripKmByMonth.set(key, (tripKmByMonth.get(key) || 0) + Number(trip.kilometres));
        }
      }
    } catch (e) {
      console.error('Error fetching trips for ratio calc:', e);
    }

    // Group by year and platform
    const yearGroups = new Map<number, Map<GigPlatform | 'combined', { km: number; income: number; count: number }>>();

    for (const doc of docsWithIncome) {
      // Determine KM: prefer document-verified KM, then fall back to logged trip KM
      let km = 0;
      if (doc.has_verified_km && doc.kilometres !== null) {
        km = doc.kilometres;
      } else {
        const tripKey = `${doc.period_year}-${doc.period_month}`;
        km = tripKmByMonth.get(tripKey) || 0;
      }

      // Skip if no KM from either source
      if (km <= 0) continue;

      if (!yearGroups.has(doc.period_year)) {
        yearGroups.set(doc.period_year, new Map());
      }
      const platformGroup = yearGroups.get(doc.period_year)!;

      // Per-platform ratio
      if (doc.platform) {
        const existing = platformGroup.get(doc.platform) || { km: 0, income: 0, count: 0 };
        platformGroup.set(doc.platform, {
          km: existing.km + km,
          income: existing.income + (doc.income_amount || 0),
          count: existing.count + 1,
        });
      }

      // Combined ratio
      const combined = platformGroup.get('combined') || { km: 0, income: 0, count: 0 };
      platformGroup.set('combined', {
        km: combined.km + km,
        income: combined.income + (doc.income_amount || 0),
        count: combined.count + 1,
      });
    }

    // Upsert ratios
    try {
      for (const [year, platforms] of yearGroups) {
        for (const [platform, data] of platforms) {
          const kmPerDollar = data.income > 0 ? data.km / data.income : 0;
          
          const { error } = await supabase
            .from('performance_ratios')
            .upsert({
              user_id: user.id,
              year,
              platform,
              km_per_dollar: kmPerDollar,
              source_document_count: data.count,
              total_km: data.km,
              total_income: data.income,
              last_calculated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,year,platform'
            });

          if (error) throw error;
        }
      }
      
      await fetchRatios();
    } catch (error) {
      console.error('Error updating ratios:', error);
    }
  };

  // Apply predictive backfill to documents without KM
  const applyPredictiveBackfill = async () => {
    if (!user) return;

    const docsWithoutKm = documents.filter(d => 
      !d.has_verified_km && 
      d.income_amount !== null && 
      d.income_amount > 0
    );

    if (docsWithoutKm.length === 0) {
      toast.info('No documents need KM estimation');
      return;
    }

    let updated = 0;
    for (const doc of docsWithoutKm) {
      // Try platform-specific ratio first, then combined
      const platformRatio = ratios.find(r => r.year === doc.period_year && r.platform === doc.platform);
      const combinedRatio = ratios.find(r => r.year === doc.period_year && r.platform === 'combined');
      const ratio = platformRatio || combinedRatio;

      if (ratio && ratio.km_per_dollar > 0 && doc.income_amount) {
        const estimatedKm = doc.income_amount * ratio.km_per_dollar;
        await updateDocument(doc.id, { estimated_km: estimatedKm });
        updated++;
      }
    }

    if (updated > 0) {
      toast.success(`Estimated KM for ${updated} documents`);
    } else {
      toast.info('No valid ratios available for estimation');
    }
  };

  // Get documents by year
  const getDocumentsByYear = (year: number) => documents.filter(d => d.period_year === year);

  // Get documents by platform
  const getDocumentsByPlatform = (platform: GigPlatform) => 
    documents.filter(d => d.platform === platform);

  // Get monthly summary for a year (merged across platforms)
  const getMonthlyBusinessSummary = (year: number) => {
    const yearDocs = getDocumentsByYear(year);
    const monthly = new Map<number, { income: number; km: number; estimatedKm: number; platforms: Set<string> }>();

    for (let month = 1; month <= 12; month++) {
      monthly.set(month, { income: 0, km: 0, estimatedKm: 0, platforms: new Set() });
    }

    for (const doc of yearDocs) {
      const entry = monthly.get(doc.period_month)!;
      entry.income += doc.income_amount || 0;
      // Always use estimated_km as it covers all platforms consistently
      entry.estimatedKm += doc.estimated_km || 0;
      if (doc.has_verified_km && doc.kilometres != null) {
        entry.km += doc.kilometres;
      }
      if (doc.platform) entry.platforms.add(doc.platform);
    }

    return Array.from(monthly.entries()).map(([month, data]) => ({
      month,
      income: data.income,
      km: data.km,
      estimatedKm: data.estimatedKm,
      totalKm: data.estimatedKm,
      platforms: Array.from(data.platforms),
    }));
  };

  // Get ratio for a specific year/platform
  const getRatio = (year: number, platform?: GigPlatform) => {
    if (platform) {
      return ratios.find(r => r.year === year && r.platform === platform) ||
             ratios.find(r => r.year === year && r.platform === 'combined');
    }
    return ratios.find(r => r.year === year && r.platform === 'combined');
  };

  return {
    documents,
    ratios,
    loading,
    addDocument,
    updateDocument,
    deleteDocument,
    recalculateRatios,
    applyPredictiveBackfill,
    getDocumentsByYear,
    getDocumentsByPlatform,
    getMonthlyBusinessSummary,
    getRatio,
    refetch: async () => {
      await Promise.all([fetchDocuments(), fetchRatios()]);
    },
  };
}
