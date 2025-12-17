import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gauge, Sparkles, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString } from '@/lib/dateUtils';

interface Adjustment {
  id: string;
  adjustment: number;
  reason: string;
}

interface AdjustDailyKmDialogProps {
  trips: Trip[];
  onAdjustmentsApplied: (updates: Array<{ id: string; kilometres: number }>) => void;
}

export function AdjustDailyKmDialog({ trips, onAdjustmentsApplied }: AdjustDailyKmDialogProps) {
  const [open, setOpen] = useState(false);
  const [actualKm, setActualKm] = useState('');
  const [loading, setLoading] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null);
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

      setAdjustments(data.adjustments);
    } catch (err: any) {
      console.error('Adjust KM error:', err);
      setError(err.message || 'Failed to analyze trips');
      toast.error(err.message || 'Failed to analyze trips');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAdjustments = () => {
    if (!adjustments) return;

    const updates = adjustments.map(adj => {
      const trip = todaysTrips.find(t => t.id === adj.id);
      const newKm = (trip?.kilometres || 0) + adj.adjustment;
      return { id: adj.id, kilometres: Math.max(0.1, newKm) };
    });

    onAdjustmentsApplied(updates);
    setOpen(false);
    setAdjustments(null);
    setActualKm('');
    toast.success('Trip distances updated!');
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setAdjustments(null);
      setError(null);
      setActualKm('');
    }
  };

  const difference = parseFloat(actualKm) - currentTotal;

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
            AI KM Adjustment
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
          {!adjustments && (
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

          {/* Adjustments preview */}
          {adjustments && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Suggested adjustments:</p>
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

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setAdjustments(null)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleApplyAdjustments} className="flex-1 gap-2">
                  <Check className="w-4 h-4" />
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
