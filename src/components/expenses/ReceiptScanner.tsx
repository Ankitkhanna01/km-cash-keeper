import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, X, FileText, ImageOff, ZoomIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { ExpenseCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

// Helper component to load and display an existing receipt image from storage
function ExistingReceiptImage({ receiptUrl }: { receiptUrl: string | null }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptUrl) return;
    supabase.storage
      .from('receipts')
      .createSignedUrl(receiptUrl, 300)
      .then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
  }, [receiptUrl]);

  if (!receiptUrl) {
    return (
      <div className="w-full h-28 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground gap-1">
        <ImageOff className="w-4 h-4" />
        No receipt
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="w-full h-28 flex items-center justify-center bg-muted rounded">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <img src={signedUrl} alt="Existing receipt" className="w-full h-28 object-cover rounded cursor-zoom-in" />;
}

// Zoomable image wrapper
function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div className="relative group cursor-zoom-in" onClick={() => setZoomed(true)}>
        <img src={src} alt={alt} className={className} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      </div>
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center">
          <img src={src} alt={alt} className="max-w-full max-h-[85vh] object-contain rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// Zoomable existing receipt (fetches signed URL then renders zoomable)
function ZoomableExistingReceipt({ receiptUrl }: { receiptUrl: string | null }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!receiptUrl) return;
    supabase.storage
      .from('receipts')
      .createSignedUrl(receiptUrl, 300)
      .then(({ data }) => {
        if (data?.signedUrl) setSignedUrl(data.signedUrl);
      });
  }, [receiptUrl]);

  if (!receiptUrl) {
    return (
      <div className="w-full h-28 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground gap-1">
        <ImageOff className="w-4 h-4" />
        No receipt
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="w-full h-28 flex items-center justify-center bg-muted rounded">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <ZoomableImage src={signedUrl} alt="Existing receipt" className="w-full h-28 object-cover rounded" />;
}

interface LineItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

interface ReceiptData {
  vendor_name: string | null;
  date: string | null;
  amount: number | null;
  category: ExpenseCategory;
  receipt_url: string | null;
  card_last4: string | null;
  items: LineItem[];
}

interface PotentialDuplicate {
  vendor_name: string;
  date: string;
  amount: number;
  receipt_url: string | null;
}

interface ReceiptScannerProps {
  onDataExtracted: (data: ReceiptData, itemsNotes: string | null) => void;
  existingExpenses?: Array<{ vendor_name: string; date: string; amount: number; receipt_url?: string | null }>;
}

export function ReceiptScanner({ onDataExtracted, existingExpenses = [] }: ReceiptScannerProps) {
  const { user } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [pendingData, setPendingData] = useState<{ receiptData: ReceiptData; itemsNotes: string | null } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<PotentialDuplicate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Check for potential duplicates
  const checkForDuplicate = (data: ReceiptData): PotentialDuplicate | null => {
    if (!data.vendor_name || !data.date || !data.amount) return null;

    const duplicate = existingExpenses.find(expense => {
      const sameVendor = expense.vendor_name.toLowerCase().includes(data.vendor_name!.toLowerCase()) ||
        data.vendor_name!.toLowerCase().includes(expense.vendor_name.toLowerCase());
      const sameDate = expense.date === data.date;
      const sameAmount = Math.abs(expense.amount - data.amount!) < 0.01;
      
      return sameVendor && sameDate && sameAmount;
    });

    if (duplicate) {
      return {
        vendor_name: duplicate.vendor_name,
        date: duplicate.date,
        amount: duplicate.amount,
        receipt_url: duplicate.receipt_url || null,
      };
    }
    return null;
  };

  // Format items with units for notes
  const formatItemsAsNotes = (items: LineItem[]): string | null => {
    if (items.length === 0) return null;
    
    return items.map(item => {
      const unitDisplay = item.unit === 'ea' || item.unit === 'each' 
        ? `x${item.quantity}` 
        : `${item.quantity} ${item.unit}`;
      return `${item.name} (${unitDisplay}) - $${item.price.toFixed(2)}`;
    }).join('\n');
  };

  // Store only the file path, not the signed URL
  const uploadReceipt = async (file: File): Promise<string | null> => {
    if (!user) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      return fileName;
    } catch (error) {
      console.error('Error uploading receipt:', error);
      return null;
    }
  };

  const processFile = async (file: File) => {
    setIsScanning(true);
    const fileIsPdf = file.type === 'application/pdf';
    setIsPdf(fileIsPdf);
    
    try {
      // Convert to base64 for OCR
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const base64Data = await base64Promise;
      
      // For images, show preview; for PDFs, show icon
      if (!fileIsPdf) {
        setPreview(base64Data);
      } else {
        setPreview('pdf');
      }

      // Upload receipt to storage
      const receiptUrl = await uploadReceipt(file);

      // Call the edge function for OCR (through rate-limited queue with caching)
      const requestBody = { image: base64Data, isPdf: fileIsPdf };
      const { data, error } = await enqueueAIRequest(
        'scan-receipt',
        requestBody,
        () => supabase.functions.invoke('scan-receipt', { body: requestBody })
      );

      if (error) {
        // supabase SDK wraps non-2xx as generic error, check if body has details
        const errorMsg = typeof error === 'object' && error.message 
          ? error.message 
          : 'Receipt scanning failed. Please try again later.';
        throw new Error(errorMsg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        const itemsData = data.data.items || [];
        const itemsNotes = formatItemsAsNotes(itemsData);

        const extractedData: ReceiptData = {
          vendor_name: data.data.vendor_name || null,
          date: data.data.date || null,
          amount: data.data.amount || null,
          category: data.data.category || 'other',
          receipt_url: receiptUrl,
          card_last4: data.data.card_last4 || null,
          items: itemsData,
        };
        
        // Check for duplicates before proceeding
        const duplicate = checkForDuplicate(extractedData);
        if (duplicate) {
          setPendingData({ receiptData: extractedData, itemsNotes });
          setDuplicateWarning(duplicate);
        } else {
          onDataExtracted(extractedData, itemsNotes);
          toast.success('Receipt scanned successfully!');
        }
      } else {
        // Even if OCR fails, still provide the receipt URL
        onDataExtracted({
          vendor_name: null,
          date: null,
          amount: null,
          category: 'other',
          receipt_url: receiptUrl,
          card_last4: null,
          items: [],
        }, null);
        toast.error('Could not extract data, but receipt was saved');
      }
    } catch (error) {
      console.error('Error scanning receipt:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scan receipt');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const clearPreview = () => {
    setPreview(null);
    setIsPdf(false);
  };

  const handleConfirmDuplicate = () => {
    if (pendingData) {
      onDataExtracted(pendingData.receiptData, pendingData.itemsNotes);
      toast.success('Receipt added despite duplicate warning');
    }
    setDuplicateWarning(null);
    setPendingData(null);
  };

  const handleCancelDuplicate = () => {
    setDuplicateWarning(null);
    setPendingData(null);
    clearPreview();
    toast.info('Receipt upload cancelled');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isScanning}
          className="flex-1"
        >
          {isScanning ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Camera className="w-4 h-4 mr-2" />
          )}
          Camera
        </Button>
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="flex-1"
        >
          {isScanning ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          Upload
        </Button>
      </div>

      {preview && (
        <div className="relative">
          {isPdf ? (
            <div className="w-full h-32 flex items-center justify-center rounded-lg border border-border bg-muted">
              <FileText className="w-12 h-12 text-muted-foreground" />
            </div>
          ) : (
            <img
              src={preview}
              alt="Receipt preview"
              className="w-full h-32 object-cover rounded-lg border border-border"
            />
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6"
            onClick={clearPreview}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {isScanning && (
        <p className="text-xs text-muted-foreground text-center">
          Uploading & analyzing receipt...
        </p>
      )}

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={!!duplicateWarning} onOpenChange={() => {}}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-warning">⚠️ Possible Duplicate Receipt</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This receipt appears to match an existing expense:</p>
                {duplicateWarning && pendingData && (
                  <div className="grid grid-cols-2 gap-3">
                    {/* New receipt (just scanned) */}
                    <div className="border border-border rounded-lg p-2 space-y-2">
                      <p className="text-xs font-semibold text-center text-primary">New Receipt</p>
                      {preview && !isPdf ? (
                        <img src={preview} alt="New receipt" className="w-full h-28 object-cover rounded" />
                      ) : preview === 'pdf' ? (
                        <div className="w-full h-28 flex items-center justify-center bg-muted rounded">
                          <FileText className="w-8 h-8 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="w-full h-28 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground">No image</div>
                      )}
                      <div className="text-xs space-y-0.5">
                        <p className="font-medium truncate">{pendingData.receiptData.vendor_name || 'Unknown'}</p>
                        <p>{pendingData.receiptData.date || '—'}</p>
                        <p className="font-semibold">${pendingData.receiptData.amount?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                    {/* Existing receipt */}
                    <div className="border border-border rounded-lg p-2 space-y-2">
                      <p className="text-xs font-semibold text-center text-destructive">Existing Expense</p>
                      <ExistingReceiptImage receiptUrl={duplicateWarning.receipt_url} />
                      <div className="text-xs space-y-0.5">
                        <p className="font-medium truncate">{duplicateWarning.vendor_name}</p>
                        <p>{duplicateWarning.date}</p>
                        <p className="font-semibold">${duplicateWarning.amount.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-muted-foreground text-sm">
                  Are you sure you want to add this as a new expense?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDuplicate}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDuplicate}>
              Add Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
