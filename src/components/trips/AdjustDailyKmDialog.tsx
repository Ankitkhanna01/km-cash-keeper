import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gauge, Sparkles, Loader2, Check, AlertCircle, MapPin, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString } from '@/lib/dateUtils';
import { Checkbox } from '@/components/ui/checkbox';

interface Adjustment {
  id: string;
  adjustment: number;
  reason: string;
}

interface SegmentSuggestion {
  type: 'extend_start' | 'create_gap';
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
  reason: string;
}

interface AdjustDailyKmDialogProps {
  trips: Trip[];
  onAdjustmentsApplied: (updates: Array<{ id: string; kilometres: number; start_location?: string }>) => void;
}

export function AdjustDailyKmDialog({ trips, onAdjustmentsApplied }: AdjustDailyKmDialogProps) {
  const [open, setOpen] = useState(false);
  const [actualKm, setActualKm] = useState('');
  const [loading, setLoading] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null);
  const [segmentSuggestions, setSegmentSuggestions] = useState<SegmentSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Filter today's trips
  const today = getLocalDateString();
  const todaysTrips = trips.filter(t => t.date === today);
  const currentTotal = todaysTrips.reduce((sum, t) => sum + t.kilometres, 0);

  const handleAnalyze = async () => {
    const actualTotal = parseFloat(actualKm);
    if (isNaN(actualTotal) || actualTotal <= 0) {
      toast.error('Please enter a valid kilometre reading');
      return;
    }

    if (todaysTrips.length === 0) {
      toast.error('No trips logged for today');
      return;
    }

    setLoading(true);
    setError(null);
    setAdjustments(null);
    setSegmentSuggestions([]);
    setSelectedSuggestions(new Set());

    try {
      const { data, error: fnError } = await supabase.functions.invoke('adjust-km', {
        body: {
          trips: todaysTrips.map(t => ({
            id: t.id,
            start_location: t.start_location,
            end_location: t.end_location,
            kilometres: t.kilometres,
            start_time: t.start_time,
            end_time: t.end_time,
          })),
          actualTotalKm: actualTotal,
        },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setAdjustments(data.adjustments || []);
      setSegmentSuggestions(data.segmentSuggestions || []);
    } catch (err: any) {
      console.error('Adjust KM error:', err);
      setError(err.message || 'Failed to analyze trips');
      toast.error(err.message || 'Failed to analyze trips');
    } finally {
      setLoading(false);
    }
  };

  const toggleSuggestion = (tripId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(tripId)) {
      newSelected.delete(tripId);
    } else {
      newSelected.add(tripId);
    }
    setSelectedSuggestions(newSelected);
  };

  const handleApplyAdjustments = () => {
    const updates: Array<{ id: string; kilometres: number; start_location?: string }> = [];

    // Apply KM adjustments
    if (adjustments) {
      for (const adj of adjustments) {
        const trip = todaysTrips.find(t => t.id === adj.id);
        if (trip) {
          const newKm = trip.kilometres + adj.adjustment;
          updates.push({ id: adj.id, kilometres: Math.max(0.1, newKm) });
        }
      }
    }

    // Apply selected segment suggestions (extend start location)
    for (const suggestion of segmentSuggestions) {
      if (selectedSuggestions.has(suggestion.tripId)) {
        const existingUpdate = updates.find(u => u.id === suggestion.tripId);
        if (existingUpdate) {
          existingUpdate.start_location = suggestion.fromLocation;
          existingUpdate.kilometres = (existingUpdate.kilometres || 0) + suggestion.estimatedKm;
        } else {
          const trip = todaysTrips.find(t => t.id === suggestion.tripId);
          if (trip) {
            updates.push({
              id: suggestion.tripId,
              kilometres: trip.kilometres + suggestion.estimatedKm,
              start_location: suggestion.fromLocation,
            });
          }
        }
      }
    }

    if (updates.length > 0) {
      onAdjustmentsApplied(updates);
      toast.success('Trip distances updated!');
    } else {
      toast.info('No changes to apply');
    }

    setOpen(false);
    setAdjustments(null);
    setSegmentSuggestions([]);
    setSelectedSuggestions(new Set());
    setActualKm('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setAdjustments(null);
      setSegmentSuggestions([]);
      setSelectedSuggestions(new Set());
      setError(null);
      setActualKm('');
    }
  };

  const difference = parseFloat(actualKm) - currentTotal;
  const hasChanges = (adjustments && adjustments.length > 0) || selectedSuggestions.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Gauge className="w-4 h-4" />
          Adjust Daily KM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Smart KM Adjustment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Today's summary */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-sm text-muted-foreground">Today's logged trips</p>
            <p className="text-2xl font-bold">{currentTotal.toFixed(1)} km</p>
            <p className="text-xs text-muted-foreground">{todaysTrips.length} trip(s)</p>
          </div>

          {/* Input for actual KM */}
          <div className="space-y-2">
            <Label htmlFor="actual-km">Your car's trip meter reading (km)</Label>
            <Input
              id="actual-km"
              type="number"
              step="0.1"
              value={actualKm}
              onChange={(e) => setActualKm(e.target.value)}
              placeholder="Enter actual km driven today"
            />
            {actualKm && !isNaN(parseFloat(actualKm)) && (
              <p className={`text-sm ${difference > 0 ? 'text-green-500' : difference < 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                Difference: {difference > 0 ? '+' : ''}{difference.toFixed(1)} km
              </p>
            )}
          </div>

          {/* Analyze button */}
          {!adjustments && segmentSuggestions.length === 0 && (
            <Button
              onClick={handleAnalyze}
              disabled={loading || !actualKm || todaysTrips.length === 0}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing routes...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze & Redistribute
                </>
              )}
            </Button>
          )}

          {/* Error state */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Segment Suggestions (missed trips) */}
          {segmentSuggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                Potential missed segments detected
              </p>
              <p className="text-xs text-muted-foreground">
                Select any you want to fix (will update trip start location):
              </p>
              <div className="space-y-2">
                {segmentSuggestions.map((suggestion) => {
                  const trip = todaysTrips.find(t => t.id === suggestion.tripId);
                  if (!trip) return null;
                  return (
                    <div 
                      key={suggestion.tripId} 
                      className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20"
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`suggestion-${suggestion.tripId}`}
                          checked={selectedSuggestions.has(suggestion.tripId)}
                          onCheckedChange={() => toggleSuggestion(suggestion.tripId)}
                        />
                        <div className="flex-1 min-w-0">
                          <label 
                            htmlFor={`suggestion-${suggestion.tripId}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            Extend trip start
                          </label>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <span className="truncate">{suggestion.fromLocation.split(',')[0]}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span className="truncate">{trip.start_location.split(',')[0]}</span>
                          </div>
                          <p className="text-xs text-orange-600 mt-1">
                            +{suggestion.estimatedKm.toFixed(1)} km estimated
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KM Adjustments preview */}
          {adjustments && adjustments.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">KM redistribution (based on trip length & duration):</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {adjustments.map((adj) => {
                  const trip = todaysTrips.find(t => t.id === adj.id);
                  if (!trip) return null;
                  return (
                    <div key={adj.id} className="p-2 rounded bg-secondary/30 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="truncate flex-1 mr-2">
                          {trip.start_location.split(',')[0]} → {trip.end_location.split(',')[0]}
                        </span>
                        <span className={adj.adjustment > 0 ? 'text-green-500' : 'text-orange-500'}>
                          {adj.adjustment > 0 ? '+' : ''}{adj.adjustment.toFixed(1)} km
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{adj.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No changes needed */}
          {adjustments && adjustments.length === 0 && segmentSuggestions.length === 0 && (
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <p className="text-sm">Trip distances are already accurate!</p>
            </div>
          )}

          {/* Action buttons */}
          {(adjustments !== null || segmentSuggestions.length > 0) && (
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setAdjustments(null);
                  setSegmentSuggestions([]);
                  setSelectedSuggestions(new Set());
                }} 
                className="flex-1"
              >
                Re-analyze
              </Button>
              <Button 
                onClick={handleApplyAdjustments} 
                className="flex-1 gap-2"
                disabled={!hasChanges}
              >
                <Check className="w-4 h-4" />
                Apply Changes
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
