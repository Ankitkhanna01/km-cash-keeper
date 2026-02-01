import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { useOdometerGapsDB } from '@/hooks/useOdometerGapsDB';
import { GAP_CATEGORY_LABELS, type GapCategory } from '@/types/documents';

interface OdometerGapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  gapKm: number;
}

export function OdometerGapDialog({ open, onOpenChange, year, gapKm }: OdometerGapDialogProps) {
  const { confirmGap, dismissGap } = useOdometerGapsDB();
  const [category, setCategory] = useState<GapCategory>('personal');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await confirmGap(year, category, notes || undefined);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    setIsSubmitting(true);
    try {
      await dismissGap(year, 'User chose to review later');
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Odometer Gap Detected
          </DialogTitle>
          <DialogDescription>
            Your {year} odometer readings show {gapKm.toFixed(1)} km more than your logged trips.
            For CRA compliance, this gap needs to be categorized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold text-center text-warning">
              {gapKm.toFixed(1)} km
            </p>
            <p className="text-sm text-center text-muted-foreground">
              unaccounted kilometres
            </p>
          </div>

          <div className="space-y-2">
            <Label>How should this gap be categorized?</Label>
            <RadioGroup value={category} onValueChange={(v) => setCategory(v as GapCategory)}>
              {Object.entries(GAP_CATEGORY_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <RadioGroupItem value={key} id={`gap-${key}`} />
                  <Label htmlFor={`gap-${key}`} className="font-normal">
                    {label}
                    {key === 'personal' && (
                      <span className="text-xs text-muted-foreground ml-2">(Recommended)</span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="e.g., Commute to regular job, personal errands..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={handleDismiss}
            disabled={isSubmitting}
          >
            Review Later
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            Confirm as {GAP_CATEGORY_LABELS[category]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
