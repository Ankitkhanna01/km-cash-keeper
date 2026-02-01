import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaystubScanner } from './PaystubScanner';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { 
  DOCUMENT_TYPE_LABELS, 
  SOURCE_TYPE_LABELS, 
  PLATFORM_LABELS,
  MONTH_NAMES,
  type DocumentType,
  type SourceType,
  type GigPlatform 
} from '@/types/documents';
import { Loader2 } from 'lucide-react';

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDocumentDialog({ open, onOpenChange }: AddDocumentDialogProps) {
  const { addDocument } = useDocumentsDB();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  
  // Form state
  const [documentType, setDocumentType] = useState<DocumentType>('paystub');
  const [sourceType, setSourceType] = useState<SourceType>('primary');
  const [platform, setPlatform] = useState<GigPlatform>('uber');
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear().toString());
  const [periodMonth, setPeriodMonth] = useState((new Date().getMonth() + 1).toString());
  const [incomeAmount, setIncomeAmount] = useState('');
  const [kilometres, setKilometres] = useState('');
  const [hasVerifiedKm, setHasVerifiedKm] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  const resetForm = () => {
    setDocumentType('paystub');
    setSourceType('primary');
    setPlatform('uber');
    setPeriodYear(currentYear.toString());
    setPeriodMonth((new Date().getMonth() + 1).toString());
    setIncomeAmount('');
    setKilometres('');
    setHasVerifiedKm(false);
    setDocumentUrl(null);
    setNotes('');
    setActiveTab('scan');
  };

  const handleScanComplete = (data: {
    platform: GigPlatform;
    period_year: number | null;
    period_month: number | null;
    income_amount: number | null;
    kilometres: number | null;
    has_km: boolean;
    document_type: DocumentType;
  }, url: string | null) => {
    if (data.platform) setPlatform(data.platform);
    if (data.period_year) setPeriodYear(data.period_year.toString());
    if (data.period_month) setPeriodMonth(data.period_month.toString());
    if (data.income_amount) setIncomeAmount(data.income_amount.toString());
    if (data.kilometres) {
      setKilometres(data.kilometres.toString());
      setHasVerifiedKm(true);
    }
    if (data.document_type) setDocumentType(data.document_type);
    setDocumentUrl(url);
  };

  const handleSubmit = async () => {
    if (!incomeAmount || !periodYear || !periodMonth) {
      return;
    }

    setIsSubmitting(true);
    try {
      await addDocument({
        document_type: documentType,
        source_type: sourceType,
        platform,
        period_year: parseInt(periodYear),
        period_month: parseInt(periodMonth),
        income_amount: parseFloat(incomeAmount),
        kilometres: kilometres ? parseFloat(kilometres) : null,
        has_verified_km: hasVerifiedKm && !!kilometres,
        estimated_km: null,
        document_url: documentUrl,
        raw_ocr_data: null,
        notes: notes || null,
      });
      
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding document:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Income Document</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scan' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan">Scan Document</TabsTrigger>
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-4 mt-4">
            <PaystubScanner onDataExtracted={handleScanComplete} />
            
            {documentUrl && (
              <p className="text-sm text-muted-foreground text-center">
                ✓ Document uploaded - review extracted data below
              </p>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Enter document details manually
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-4">
          {/* Source Type Question */}
          <div className="space-y-2">
            <Label>Is this a primary or secondary source?</Label>
            <RadioGroup value={sourceType} onValueChange={(v) => setSourceType(v as SourceType)}>
              {Object.entries(SOURCE_TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <RadioGroupItem value={key} id={`source-${key}`} />
                  <Label htmlFor={`source-${key}`} className="font-normal text-sm">{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Document Type */}
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Platform */}
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform || 'other'} onValueChange={(v) => setPlatform(v as GigPlatform)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={periodYear} onValueChange={setPeriodYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={periodMonth} onValueChange={setPeriodMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i} value={(i + 1).toString()}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Income */}
          <div className="space-y-2">
            <Label>Income Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
            />
          </div>

          {/* Kilometres */}
          <div className="space-y-2">
            <Label>Kilometres (if shown on document)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="Leave empty if not shown"
              value={kilometres}
              onChange={(e) => {
                setKilometres(e.target.value);
                setHasVerifiedKm(!!e.target.value);
              }}
            />
            {!kilometres && (
              <p className="text-xs text-muted-foreground">
                If blank, KM will be estimated from your average performance ratio
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Any additional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full"
            disabled={isSubmitting || !incomeAmount}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Document'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
