import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, X, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ExpenseCategory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface ReceiptData {
  vendor_name: string | null;
  date: string | null;
  amount: number | null;
  category: ExpenseCategory;
  receipt_url: string | null;
}

interface ReceiptScannerProps {
  onDataExtracted: (data: ReceiptData) => void;
}

export function ReceiptScanner({ onDataExtracted }: ReceiptScannerProps) {
  const { user } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Store only the file path, not the signed URL - signed URLs should be generated on-demand
  const uploadReceipt = async (file: File): Promise<string | null> => {
    if (!user) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Return only the file path - signed URLs will be generated on-demand when viewing
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

      // Call the edge function for OCR
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { image: base64Data, isPdf: fileIsPdf }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        const extractedData: ReceiptData = {
          vendor_name: data.data.vendor_name || null,
          date: data.data.date || null,
          amount: data.data.amount || null,
          category: data.data.category || 'other',
          receipt_url: receiptUrl,
        };
        
        onDataExtracted(extractedData);
        toast.success('Receipt scanned successfully!');
      } else {
        // Even if OCR fails, still provide the receipt URL
        onDataExtracted({
          vendor_name: null,
          date: null,
          amount: null,
          category: 'other',
          receipt_url: receiptUrl,
        });
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
    </div>
  );
}
