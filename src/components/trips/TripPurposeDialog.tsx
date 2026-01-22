import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Home, MapPin, MoreHorizontal, ArrowLeft } from 'lucide-react';

export type TripPurpose = 'pickup' | 'dropoff' | 'hotzone' | 'other';
export type DeliveryCompany = 'uber' | 'doordash' | 'skip' | null;

interface TripPurposeDialogProps {
  open: boolean;
  onSelect: (purpose: TripPurpose, customReason?: string, company?: DeliveryCompany) => void;
}

const COMPANY_OPTIONS: { value: DeliveryCompany; label: string; color: string }[] = [
  { value: 'uber', label: 'Uber Eats', color: 'text-green-600' },
  { value: 'doordash', label: 'DoorDash', color: 'text-red-500' },
  { value: 'skip', label: 'Skip The Dishes', color: 'text-orange-500' },
];

export function TripPurposeDialog({ open, onSelect }: TripPurposeDialogProps) {
  const [step, setStep] = useState<'purpose' | 'company' | 'other'>('purpose');
  const [selectedPurpose, setSelectedPurpose] = useState<TripPurpose | null>(null);
  const [customReason, setCustomReason] = useState('');

  const handlePurposeSelect = (purpose: TripPurpose) => {
    if (purpose === 'other') {
      setStep('other');
    } else if (purpose === 'pickup' || purpose === 'dropoff') {
      setSelectedPurpose(purpose);
      setStep('company');
    } else {
      // For hotzone, no company needed
      onSelect(purpose);
      resetState();
    }
  };

  const handleCompanySelect = (company: DeliveryCompany) => {
    if (selectedPurpose) {
      onSelect(selectedPurpose, undefined, company);
      resetState();
    }
  };

  const handleOtherSubmit = () => {
    onSelect('other', customReason || 'Other');
    resetState();
  };

  const handleBack = () => {
    setStep('purpose');
    setSelectedPurpose(null);
    setCustomReason('');
  };

  const resetState = () => {
    setStep('purpose');
    setSelectedPurpose(null);
    setCustomReason('');
  };

  const getPurposeLabel = () => {
    if (selectedPurpose === 'pickup') return 'picking up';
    if (selectedPurpose === 'dropoff') return 'dropping off';
    return '';
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          {step === 'purpose' && (
            <>
              <DialogTitle>What was this trip for?</DialogTitle>
              <DialogDescription>
                Select the purpose of this trip for your records.
              </DialogDescription>
            </>
          )}
          {step === 'company' && (
            <>
              <DialogTitle>Which company?</DialogTitle>
              <DialogDescription>
                Select the company you were {getPurposeLabel()} for.
              </DialogDescription>
            </>
          )}
          {step === 'other' && (
            <>
              <DialogTitle>Custom purpose</DialogTitle>
              <DialogDescription>
                Enter a custom reason for this trip.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {step === 'purpose' && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handlePurposeSelect('pickup')}
            >
              <Package className="w-6 h-6 text-orange-500" />
              <span className="text-sm">Picking up food</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handlePurposeSelect('dropoff')}
            >
              <Home className="w-6 h-6 text-green-500" />
              <span className="text-sm">Dropping off</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handlePurposeSelect('hotzone')}
            >
              <MapPin className="w-6 h-6 text-primary" />
              <span className="text-sm">Going to hot zone</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => handlePurposeSelect('other')}
            >
              <MoreHorizontal className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">Other</span>
            </Button>
          </div>
        )}

        {step === 'company' && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 gap-2">
              {COMPANY_OPTIONS.map((company) => (
                <Button
                  key={company.value}
                  variant="outline"
                  className="h-14 justify-start gap-3 px-4"
                  onClick={() => handleCompanySelect(company.value)}
                >
                  <span className={`text-lg font-semibold ${company.color}`}>
                    {company.label}
                  </span>
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="w-full gap-2"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
        )}

        {step === 'other' && (
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
                onClick={handleBack}
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
