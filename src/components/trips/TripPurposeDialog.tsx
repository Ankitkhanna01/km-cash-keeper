import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Home, MapPin, MoreHorizontal } from 'lucide-react';

export type TripPurpose = 'pickup' | 'dropoff' | 'hotzone' | 'other';

interface TripPurposeDialogProps {
  open: boolean;
  onSelect: (purpose: TripPurpose, customReason?: string) => void;
}

export function TripPurposeDialog({ open, onSelect }: TripPurposeDialogProps) {
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [customReason, setCustomReason] = useState('');

  const handleSelect = (purpose: TripPurpose) => {
    if (purpose === 'other') {
      setShowOtherInput(true);
    } else {
      onSelect(purpose);
    }
  };

  const handleOtherSubmit = () => {
    onSelect('other', customReason || 'Other');
    setShowOtherInput(false);
    setCustomReason('');
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>What was this trip for?</DialogTitle>
          <DialogDescription>
            Select the purpose of this trip for your records.
          </DialogDescription>
        </DialogHeader>

        {!showOtherInput ? (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handleSelect('pickup')}
            >
              <Package className="w-6 h-6 text-orange-500" />
              <span className="text-sm">Picking up food</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handleSelect('dropoff')}
            >
              <Home className="w-6 h-6 text-green-500" />
              <span className="text-sm">Dropping off</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handleSelect('hotzone')}
            >
              <MapPin className="w-6 h-6 text-primary" />
              <span className="text-sm">Going to hot zone</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handleSelect('other')}
            >
              <MoreHorizontal className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">Other</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <Input
              placeholder="What was the trip for?"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowOtherInput(false)}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={handleOtherSubmit}>
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
