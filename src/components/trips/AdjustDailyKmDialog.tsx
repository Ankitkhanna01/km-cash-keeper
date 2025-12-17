import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gauge, Loader2, Check, AlertCircle, MapPin, ArrowRight, Route, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString } from '@/lib/dateUtils';
import { Checkbox } from '@/components/ui/checkbox';

interface Adjustment {
  id: string;
  adjustment: number;
  reason: string;
  calculatedKm?: number;
  loggedKm?: number;
  type: 'route' | 'distribution';
}

interface SegmentSuggestion {
  type: 'extend_start' | 'create_gap';
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
  reason: string;
}

interface Summary {
  currentTotal: number;
  actualTotal: number;
  difference: number;
  calculatedTotal?: number;
  tripsVerified?: number;
  tripsTotal?: number;
  routeAdjustmentSum?: number;
  gapKmTotal?: number;
  remainingDiff?: number;
}

interface AdjustDailyKmDialogProps {
  trips: Trip[];
  onAdjustmentsApplied: (updates: Array<{ id: string; kilometres: number; start_location?: string }>) => void;
}

export function AdjustDailyKmDialog({ trips, onAdjustmentsApplied }: AdjustDailyKmDialogProps) {
  const [open, setOpen] = useState(false);
  const [actualKm, setActualKm] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeAdjustments, setRouteAdjustments] = useState<Adjustment[]>([]);
  const [distributionAdjustments, setDistributionAdjustments] = useState<Adjustment[]>([]);
  const [segmentSuggestions, setSegmentSuggestions] = useState<SegmentSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [selectedRouteAdj, setSelectedRouteAdj] = useState<Set<string>>(new Set());
  const [selectedDistAdj, setSelectedDistAdj] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

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
    resetState();

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

      const routeAdj = data.adjustments || [];
      const distAdj = data.distributionAdjustments || [];
      const segments = data.segmentSuggestions || [];
      
      setRouteAdjustments(routeAdj);
      setDistributionAdjustments(distAdj);
      setSegmentSuggestions(segments);
      setSummary(data.summary || null);
      setAnalyzed(true);
      
      // Pre-select all by default
      setSelectedRouteAdj(new Set(routeAdj.map((a: Adjustment) => a.id)));
      setSelectedDistAdj(new Set(distAdj.map((a: Adjustment) => a.id)));
    } catch (err: any) {
      console.error('Adjust KM error:', err);
      setError(err.message || 'Failed to analyze trips');
      toast.error(err.message || 'Failed to analyze trips');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setRouteAdjustments([]);
    setDistributionAdjustments([]);
    setSegmentSuggestions([]);
    setSelectedSuggestions(new Set());
    setSelectedRouteAdj(new Set());
    setSelectedDistAdj(new Set());
    setSummary(null);
    setAnalyzed(false);
  };

  const toggleSuggestion = (tripId: string) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(tripId)) newSelected.delete(tripId);
    else newSelected.add(tripId);
    setSelectedSuggestions(newSelected);
  };

  const toggleRouteAdj = (tripId: string) => {
    const newSelected = new Set(selectedRouteAdj);
    if (newSelected.has(tripId)) newSelected.delete(tripId);
    else newSelected.add(tripId);
    setSelectedRouteAdj(newSelected);
  };

  const toggleDistAdj = (tripId: string) => {
    const newSelected = new Set(selectedDistAdj);
    if (newSelected.has(tripId)) newSelected.delete(tripId);
    else newSelected.add(tripId);
    setSelectedDistAdj(newSelected);
  };

  const handleApplyAdjustments = () => {
    const updates: Array<{ id: string; kilometres: number; start_location?: string }> = [];
    const appliedIds = new Set<string>();

    // Apply selected route adjustments
    for (const adj of routeAdjustments) {
      if (selectedRouteAdj.has(adj.id)) {
        const trip = todaysTrips.find(t => t.id === adj.id);
        if (trip) {
          const newKm = trip.kilometres + adj.adjustment;
          updates.push({ id: adj.id, kilometres: Math.max(0.1, newKm) });
          appliedIds.add(adj.id);
        }
      }
    }

    // Apply selected distribution adjustments
    for (const adj of distributionAdjustments) {
      if (selectedDistAdj.has(adj.id)) {
        const existingUpdate = updates.find(u => u.id === adj.id);
        if (existingUpdate) {
          existingUpdate.kilometres = Math.max(0.1, existingUpdate.kilometres + adj.adjustment);
        } else {
          const trip = todaysTrips.find(t => t.id === adj.id);
          if (trip) {
            updates.push({ id: adj.id, kilometres: Math.max(0.1, trip.kilometres + adj.adjustment) });
          }
        }
      }
    }

    // Apply selected segment suggestions
    for (const suggestion of segmentSuggestions) {
      if (selectedSuggestions.has(suggestion.tripId)) {
        const existingUpdate = updates.find(u => u.id === suggestion.tripId);
        if (existingUpdate) {
          existingUpdate.start_location = suggestion.fromLocation;
          existingUpdate.kilometres += suggestion.estimatedKm;
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
      toast.success(`Updated ${updates.length} trip(s)!`);
    } else {
      toast.info('No changes selected');
    }

    handleOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetState();
      setError(null);
      setActualKm('');
    }
  };

  const difference = parseFloat(actualKm) - currentTotal;
  const hasChanges = selectedRouteAdj.size > 0 || selectedDistAdj.size > 0 || selectedSuggestions.size > 0;

  // Calculate what total will be after selected changes
  const calculateProjectedTotal = () => {
    let projected = currentTotal;
    
    for (const adj of routeAdjustments) {
      if (selectedRouteAdj.has(adj.id)) projected += adj.adjustment;
    }
    for (const adj of distributionAdjustments) {
      if (selectedDistAdj.has(adj.id)) projected += adj.adjustment;
    }
    for (const seg of segmentSuggestions) {
      if (selectedSuggestions.has(seg.tripId)) projected += seg.estimatedKm;
    }
    
    return projected;
  };

  const projectedTotal = analyzed ? calculateProjectedTotal() : currentTotal;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Gauge className="w-4 h-4" />
          Adjust Daily KM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" aria-describedby="adjust-km-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="w-5 h-5 text-primary" />
            Route-Verified KM Adjustment
          </DialogTitle>
          <DialogDescription id="adjust-km-description">
            Match your logged trips to your car's odometer for CRA compliance.
          </DialogDescription>
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
          {!analyzed && (
            <Button
              onClick={handleAnalyze}
              disabled={loading || !actualKm || todaysTrips.length === 0}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calculating routes...
                </>
              ) : (
                <>
                  <Route className="w-4 h-4" />
                  Calculate Route Distances
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

          {/* Summary info */}
          {summary && summary.tripsVerified !== undefined && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm space-y-1">
              <div className="flex items-center gap-2 text-blue-600">
                <Route className="w-4 h-4" />
                <span className="font-medium">Analysis Complete</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Verified {summary.tripsVerified}/{summary.tripsTotal} trips via OpenStreetMap
              </p>
              {summary.remainingDiff !== undefined && Math.abs(summary.remainingDiff) >= 0.2 && (
                <p className="text-xs text-orange-600">
                  {summary.remainingDiff > 0 ? '+' : ''}{summary.remainingDiff} km from alternate routes
                </p>
              )}
            </div>
          )}

          {/* Projected total after changes */}
          {analyzed && hasChanges && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">After changes:</span>
                <span className="font-bold text-green-600">{projectedTotal.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Target:</span>
                <span>{actualKm} km</span>
              </div>
            </div>
          )}

          {/* Gap Suggestions */}
          {segmentSuggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                Gaps detected ({segmentSuggestions.reduce((s, g) => s + g.estimatedKm, 0).toFixed(1)} km)
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {segmentSuggestions.map((suggestion) => {
                  const trip = todaysTrips.find(t => t.id === suggestion.tripId);
                  if (!trip) return null;
                  return (
                    <div key={suggestion.tripId} className="p-2 rounded bg-orange-500/10 border border-orange-500/20">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`gap-${suggestion.tripId}`}
                          checked={selectedSuggestions.has(suggestion.tripId)}
                          onCheckedChange={() => toggleSuggestion(suggestion.tripId)}
                        />
                        <label htmlFor={`gap-${suggestion.tripId}`} className="flex-1 text-xs cursor-pointer">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span className="truncate max-w-[100px]">{suggestion.fromLocation.split(',')[0]}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[100px]">{trip.start_location.split(',')[0]}</span>
                          </div>
                          <span className="text-orange-600 font-medium">+{suggestion.estimatedKm} km</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Route-based corrections */}
          {routeAdjustments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Route className="w-4 h-4 text-primary" />
                Route corrections ({routeAdjustments.reduce((s, a) => s + a.adjustment, 0).toFixed(1)} km)
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {routeAdjustments.map((adj) => {
                  const trip = todaysTrips.find(t => t.id === adj.id);
                  if (!trip) return null;
                  return (
                    <div key={adj.id} className="p-2 rounded bg-secondary/30">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`route-${adj.id}`}
                          checked={selectedRouteAdj.has(adj.id)}
                          onCheckedChange={() => toggleRouteAdj(adj.id)}
                        />
                        <label htmlFor={`route-${adj.id}`} className="flex-1 text-xs cursor-pointer">
                          <span className="truncate block">{trip.start_location.split(',')[0]} → {trip.end_location.split(',')[0]}</span>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>{adj.loggedKm} km</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-primary">{adj.calculatedKm} km</span>
                          </div>
                          <span className={adj.adjustment > 0 ? 'text-green-500' : 'text-orange-500'}>
                            {adj.adjustment > 0 ? '+' : ''}{adj.adjustment} km
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distribution adjustments (for alternate routes) */}
          {distributionAdjustments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Scale className="w-4 h-4 text-purple-500" />
                Alternate route distribution ({distributionAdjustments.reduce((s, a) => s + a.adjustment, 0).toFixed(1)} km)
              </p>
              <p className="text-xs text-muted-foreground">
                KM from routes not matching standard paths:
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {distributionAdjustments.map((adj) => {
                  const trip = todaysTrips.find(t => t.id === adj.id);
                  if (!trip) return null;
                  return (
                    <div key={`dist-${adj.id}`} className="p-2 rounded bg-purple-500/10 border border-purple-500/20">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`dist-${adj.id}`}
                          checked={selectedDistAdj.has(adj.id)}
                          onCheckedChange={() => toggleDistAdj(adj.id)}
                        />
                        <label htmlFor={`dist-${adj.id}`} className="flex-1 text-xs cursor-pointer">
                          <span className="truncate block">{trip.start_location.split(',')[0]} → {trip.end_location.split(',')[0]}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{trip.kilometres} km</span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="text-purple-600">{(trip.kilometres + adj.adjustment).toFixed(1)} km</span>
                          </div>
                          <span className={adj.adjustment > 0 ? 'text-green-500' : 'text-orange-500'}>
                            {adj.adjustment > 0 ? '+' : ''}{adj.adjustment} km
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No changes needed */}
          {analyzed && routeAdjustments.length === 0 && distributionAdjustments.length === 0 && segmentSuggestions.length === 0 && (
            <div className="p-3 rounded-lg bg-green-500/10 text-green-600 flex items-center gap-2">
              <Check className="w-4 h-4" />
              <p className="text-sm">Trip distances match your odometer!</p>
            </div>
          )}

          {/* Action buttons */}
          {analyzed && (
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={resetState} 
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
                Apply Selected
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
