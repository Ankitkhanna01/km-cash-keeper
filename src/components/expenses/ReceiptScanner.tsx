import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, X, FileText } from 'lucide-react';
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
  items: LineItem[];
}

interface PotentialDuplicate {
  vendor_name: string;
  date: string;
  amount: number;
}

interface ReceiptScannerProps {
  onDataExtracted: (data: ReceiptData, itemsNotes: string | null) => void;
  existingExpenses?: Array<{ vendor_name: string; date: string; amount: number }>;
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
        amount: duplicate.amount
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-warning">⚠️ Possible Duplicate Receipt</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This receipt appears to match an existing expense:</p>
              {duplicateWarning && (
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <p><strong>Vendor:</strong> {duplicateWarning.vendor_name}</p>
                  <p><strong>Date:</strong> {duplicateWarning.date}</p>
                  <p><strong>Amount:</strong> ${duplicateWarning.amount.toFixed(2)}</p>
                </div>
              )}
              <p className="text-muted-foreground">
                Are you sure you want to add this as a new expense?
              </p>
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
