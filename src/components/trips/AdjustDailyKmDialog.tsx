import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gauge, Loader2, Check, AlertCircle, MapPin, ArrowRight, Route, Scale, Plus, Minus, Wand2, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString, formatDateForDisplay } from '@/lib/dateUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, parse } from 'date-fns';

interface RouteResult {
  id: string;
  calculatedKm: number | null;
  loggedKm: number;
}

interface GapResult {
  tripId: string;
  fromLocation: string;
  toLocation: string;
  estimatedKm: number;
}

interface AdjustDailyKmDialogProps {
  trips: Trip[];
  onAdjustmentsApplied: (updates: Array<{ id: string; kilometres: number; start_location?: string }>) => void;
}

export function AdjustDailyKmDialog({ trips, onAdjustmentsApplied }: AdjustDailyKmDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [actualKm, setActualKm] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeResults, setRouteResults] = useState<RouteResult[]>([]);
  const [gaps, setGaps] = useState<GapResult[]>([]);
  const [selectedGaps, setSelectedGaps] = useState<Set<string>>(new Set());
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());
  const [manualAdjustments, setManualAdjustments] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const selectedTrips = useMemo(() => 
    trips.filter(t => t.date === selectedDateStr),
    [trips, selectedDateStr]
  );
  const currentTotal = selectedTrips.reduce((sum, t) => sum + t.kilometres, 0);

  const handleAnalyze = async () => {
    if (selectedTrips.length === 0) {
      toast.error(`No trips logged for ${formatDateForDisplay(selectedDateStr)}`);
      return;
    }

    setLoading(true);
    setError(null);
    resetState();

    try {
      const { data, error: fnError } = await supabase.functions.invoke('adjust-km', {
        body: {
          trips: selectedTrips.map(t => ({
            id: t.id,
            start_location: t.start_location,
            end_location: t.end_location,
            kilometres: t.kilometres,
            start_time: t.start_time,
            end_time: t.end_time,
          })),
        },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setRouteResults(data.routeResults || []);
      setGaps(data.gaps || []);
      setAnalyzed(true);
      
      // Pre-select route corrections where there's a significant difference
      const routesToSelect = (data.routeResults || [])
        .filter((r: RouteResult) => r.calculatedKm !== null && Math.abs(r.calculatedKm - r.loggedKm) > 0.3)
        .map((r: RouteResult) => r.id);
      setSelectedRoutes(new Set(routesToSelect));
    } catch (err: unknown) {
      console.error('Adjust KM error:', err);
      const message = err instanceof Error ? err.message : 'Failed to analyze trips';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setRouteResults([]);
    setGaps([]);
    setSelectedGaps(new Set());
    setSelectedRoutes(new Set());
    setManualAdjustments({});
    setAnalyzed(false);
  };

  const toggleGap = (tripId: string) => {
    const newSelected = new Set(selectedGaps);
    if (newSelected.has(tripId)) newSelected.delete(tripId);
    else newSelected.add(tripId);
    setSelectedGaps(newSelected);
  };

  const toggleRoute = (tripId: string) => {
    const newSelected = new Set(selectedRoutes);
    if (newSelected.has(tripId)) newSelected.delete(tripId);
    else newSelected.add(tripId);
    setSelectedRoutes(newSelected);
  };

  const adjustManual = (tripId: string, delta: number) => {
    setManualAdjustments(prev => ({
      ...prev,
      [tripId]: (prev[tripId] || 0) + delta,
    }));
  };

  const setManualKm = (tripId: string, value: string) => {
    const trip = selectedTrips.find(t => t.id === tripId);
    if (!trip) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      // Clear manual adjustment
      setManualAdjustments(prev => {
        const newAdj = { ...prev };
        delete newAdj[tripId];
        return newAdj;
      });
    } else {
      // Calculate the base km (after route corrections)
      let baseKm = trip.kilometres;
      if (selectedRoutes.has(tripId)) {
        const route = routeResults.find(r => r.id === tripId);
        if (route?.calculatedKm !== null) {
          baseKm = route.calculatedKm;
        }
      }
      // Gap additions
      const gap = gaps.find(g => g.tripId === tripId);
      if (gap && selectedGaps.has(tripId)) {
        baseKm += gap.estimatedKm;
      }
      
      // Calculate adjustment needed to reach target
      setManualAdjustments(prev => ({
        ...prev,
        [tripId]: numValue - baseKm,
      }));
    }
  };

  // Calculate projected total
  const calculateProjectedTotal = () => {
    let projected = currentTotal;
    
    // Route corrections
    for (const route of routeResults) {
      if (selectedRoutes.has(route.id) && route.calculatedKm !== null) {
        projected += (route.calculatedKm - route.loggedKm);
      }
    }
    
    // Gap additions
    for (const gap of gaps) {
      if (selectedGaps.has(gap.tripId)) {
        projected += gap.estimatedKm;
      }
    }
    
    // Manual adjustments
    for (const [, adj] of Object.entries(manualAdjustments)) {
      projected += adj;
    }
    
    return Math.round(projected * 10) / 10;
  };

  const projectedTotal = analyzed ? calculateProjectedTotal() : currentTotal;
  const targetKm = parseFloat(actualKm) || 0;
  const remainingDiff = targetKm - projectedTotal;

  // Auto-distribute remaining KM proportionally
  const handleAutoDistribute = () => {
    if (selectedTrips.length === 0 || Math.abs(remainingDiff) < 0.1) return;

    const tripWeights = selectedTrips.map(trip => ({
      id: trip.id,
      weight: trip.kilometres,
    }));

    const totalWeight = tripWeights.reduce((sum, t) => sum + t.weight, 0);
    if (totalWeight === 0) return;

    const newAdjustments = { ...manualAdjustments };
    let distributed = 0;

    tripWeights.forEach((tw, index) => {
      if (index === tripWeights.length - 1) {
        // Last trip gets remainder to avoid rounding errors
        newAdjustments[tw.id] = (newAdjustments[tw.id] || 0) + (remainingDiff - distributed);
      } else {
        const share = Math.round((tw.weight / totalWeight) * remainingDiff * 10) / 10;
        newAdjustments[tw.id] = (newAdjustments[tw.id] || 0) + share;
        distributed += share;
      }
    });

    setManualAdjustments(newAdjustments);
    toast.success('KM distributed proportionally');
  };

  // Get the final KM for a trip (after all adjustments)
  const getFinalKm = (trip: Trip) => {
    let km = trip.kilometres;
    
    // Route correction
    if (selectedRoutes.has(trip.id)) {
      const route = routeResults.find(r => r.id === trip.id);
      if (route?.calculatedKm !== null) {
        km = route.calculatedKm;
      }
    }
    
    // Gap addition
    const gap = gaps.find(g => g.tripId === trip.id);
    if (gap && selectedGaps.has(trip.id)) {
      km += gap.estimatedKm;
    }
    
    // Manual adjustment
    if (manualAdjustments[trip.id]) {
      km += manualAdjustments[trip.id];
    }
    
    return Math.round(km * 10) / 10;
  };

  const handleApplyAdjustments = () => {
    const updates: Array<{ id: string; kilometres: number; start_location?: string }> = [];

    for (const trip of selectedTrips) {
      let newKm = trip.kilometres;
      let startLocation: string | undefined;

      // Apply route correction
      if (selectedRoutes.has(trip.id)) {
        const route = routeResults.find(r => r.id === trip.id);
        if (route?.calculatedKm !== null) {
          newKm = route.calculatedKm;
        }
      }

      // Apply gap (extends trip start)
      const gap = gaps.find(g => g.tripId === trip.id);
      if (gap && selectedGaps.has(trip.id)) {
        newKm += gap.estimatedKm;
        startLocation = gap.fromLocation;
      }

      // Apply manual adjustment
      if (manualAdjustments[trip.id]) {
        newKm += manualAdjustments[trip.id];
      }

      // Only add if changed
      if (newKm !== trip.kilometres || startLocation) {
        updates.push({
          id: trip.id,
          kilometres: Math.max(0.1, Math.round(newKm * 10) / 10),
          ...(startLocation && { start_location: startLocation }),
        });
      }
    }

    if (updates.length > 0) {
      onAdjustmentsApplied(updates);
      toast.success(`Updated ${updates.length} trip(s)!`);
    } else {
      toast.info('No changes to apply');
    }

    handleOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetState();
      setError(null);
      setActualKm('');
      setSelectedDate(new Date());
    }
  };

  const difference = targetKm - currentTotal;
  const hasChanges = selectedRoutes.size > 0 || selectedGaps.size > 0 || Object.keys(manualAdjustments).length > 0;

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
            Adjust KM to Match Odometer
          </DialogTitle>
          <DialogDescription id="adjust-km-description">
            Verify routes and distribute KM to match your car's trip meter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Date selector */}
          <div className="space-y-2">
            <Label>Select date to analyze</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Calendar className="w-4 h-4" />
                  {formatDateForDisplay(selectedDateStr)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      resetState();
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Day's summary */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-sm text-muted-foreground">{formatDateForDisplay(selectedDateStr)} logged trips</p>
            <p className="text-2xl font-bold">{currentTotal.toFixed(1)} km</p>
            <p className="text-xs text-muted-foreground">{selectedTrips.length} trip(s)</p>
          </div>

          {/* Input for actual KM */}
          <div className="space-y-2">
            <Label htmlFor="actual-km">Your car's trip meter (km)</Label>
            <Input
              id="actual-km"
              type="number"
              step="0.1"
              value={actualKm}
              onChange={(e) => setActualKm(e.target.value)}
              placeholder="e.g. 47.9"
            />
            {actualKm && !isNaN(targetKm) && (
              <p className={`text-sm ${difference > 0 ? 'text-green-500' : difference < 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                Need to {difference > 0 ? 'add' : 'remove'}: {Math.abs(difference).toFixed(1)} km
              </p>
            )}
          </div>

          {/* Analyze button */}
          {!analyzed && (
            <Button
              onClick={handleAnalyze}
              disabled={loading || selectedTrips.length === 0}
              className="w-full gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Verifying routes...</>
              ) : (
                <><Route className="w-4 h-4" />Verify Routes</>
              )}
            </Button>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Progress indicator */}
          {analyzed && targetKm > 0 && (
            <div className="p-3 rounded-lg bg-secondary/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current:</span>
                <span>{currentTotal.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>After changes:</span>
                <span className={projectedTotal === targetKm ? 'text-green-500' : 'text-primary'}>{projectedTotal.toFixed(1)} km</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Target:</span>
                <span>{targetKm.toFixed(1)} km</span>
              </div>
              {Math.abs(remainingDiff) >= 0.1 && (
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${remainingDiff > 0 ? 'text-orange-500' : 'text-orange-500'}`}>
                    Still need to {remainingDiff > 0 ? 'add' : 'remove'}: {Math.abs(remainingDiff).toFixed(1)} km
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoDistribute}
                    className="gap-1 h-7 text-xs"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto-distribute
                  </Button>
                </div>
              )}
              {Math.abs(remainingDiff) < 0.1 && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Matches target!
                </p>
              )}
            </div>
          )}

          {/* Gaps detected */}
          {gaps.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-500" />
                Gaps between trips
              </p>
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {gaps.map((gap) => (
                  <div key={gap.tripId} className="p-2 rounded bg-orange-500/10 border border-orange-500/20">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`gap-${gap.tripId}`}
                        checked={selectedGaps.has(gap.tripId)}
                        onCheckedChange={() => toggleGap(gap.tripId)}
                      />
                      <label htmlFor={`gap-${gap.tripId}`} className="flex-1 text-xs cursor-pointer">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="truncate max-w-[100px]">{gap.fromLocation.split(',')[0]}</span>
                          <ArrowRight className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[100px]">{gap.toLocation.split(',')[0]}</span>
                        </div>
                        <span className="text-orange-600 font-medium">+{gap.estimatedKm} km</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Route corrections */}
          {routeResults.filter(r => r.calculatedKm !== null && Math.abs(r.calculatedKm - r.loggedKm) > 0.3).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Route className="w-4 h-4 text-primary" />
                Route corrections
              </p>
              <div className="space-y-2 max-h-28 overflow-y-auto">
                {routeResults
                  .filter(r => r.calculatedKm !== null && Math.abs(r.calculatedKm - r.loggedKm) > 0.3)
                  .map((route) => {
                    const trip = selectedTrips.find(t => t.id === route.id);
                    if (!trip) return null;
                    const diff = route.calculatedKm! - route.loggedKm;
                    return (
                      <div key={route.id} className="p-2 rounded bg-secondary/30">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`route-${route.id}`}
                            checked={selectedRoutes.has(route.id)}
                            onCheckedChange={() => toggleRoute(route.id)}
                          />
                          <label htmlFor={`route-${route.id}`} className="flex-1 text-xs cursor-pointer">
                            <span className="truncate block">{trip.start_location.split(',')[0]} → {trip.end_location.split(',')[0]}</span>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{route.loggedKm} km</span>
                              <ArrowRight className="w-3 h-3" />
                              <span className="text-primary">{route.calculatedKm} km</span>
                            </div>
                            <span className={diff > 0 ? 'text-green-500' : 'text-orange-500'}>
                              {diff > 0 ? '+' : ''}{diff.toFixed(1)} km
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Manual distribution */}
          {analyzed && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Scale className="w-4 h-4 text-purple-500" />
                Manual adjustments
              </p>
              <p className="text-xs text-muted-foreground">
                Add/remove KM or type final KM directly:
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedTrips.map((trip) => {
                  const adj = manualAdjustments[trip.id] || 0;
                  const finalKm = getFinalKm(trip);
                  return (
                    <div key={trip.id} className="p-2 rounded bg-secondary/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{trip.start_location.split(',')[0]} → {trip.end_location.split(',')[0]}</p>
                          <p className="text-xs text-muted-foreground">Original: {trip.kilometres} km</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => adjustManual(trip.id, -0.5)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className={`text-xs w-12 text-center font-medium ${adj > 0 ? 'text-green-500' : adj < 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                            {adj > 0 ? '+' : ''}{adj.toFixed(1)}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => adjustManual(trip.id, 0.5)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Direct KM input */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs shrink-0">Final KM:</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={finalKm}
                          onChange={(e) => setManualKm(trip.id, e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {analyzed && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={resetState} className="flex-1">
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
