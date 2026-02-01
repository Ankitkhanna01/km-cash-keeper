import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, X, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { GigPlatform, DocumentType } from '@/types/documents';

interface PaystubData {
  platform: GigPlatform;
  period_year: number | null;
  period_month: number | null;
  income_amount: number | null;
  kilometres: number | null;
  has_km: boolean;
  document_type: DocumentType;
}

interface PaystubScannerProps {
  onDataExtracted: (data: PaystubData, documentUrl: string | null) => void;
}

export function PaystubScanner({ onDataExtracted }: PaystubScannerProps) {
  const { user } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const uploadDocument = async (file: File): Promise<string | null> => {
    if (!user) return null;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/paystubs/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('receipts')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year expiry

      if (signedError) throw signedError;

      return signedData.signedUrl;
    } catch (error) {
      console.error('Error uploading document:', error);
      return null;
    }
  };

  const processFile = async (file: File) => {
    setIsScanning(true);
    const fileIsPdf = file.type === 'application/pdf';
    setIsPdf(fileIsPdf);
    
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const base64Data = await base64Promise;
      
      if (!fileIsPdf) {
        setPreview(base64Data);
      } else {
        setPreview('pdf');
      }

      const documentUrl = await uploadDocument(file);

      const { data, error } = await supabase.functions.invoke('scan-paystub', {
        body: { image: base64Data, isPdf: fileIsPdf }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success && data?.data) {
        const extractedData: PaystubData = {
          platform: data.data.platform || null,
          period_year: data.data.period_year || null,
          period_month: data.data.period_month || null,
          income_amount: data.data.income_amount || null,
          kilometres: data.data.kilometres || null,
          has_km: data.data.has_km || false,
          document_type: data.data.document_type || 'paystub',
        };
        
        onDataExtracted(extractedData, documentUrl);
        toast.success('Paystub scanned successfully!');
      } else {
        onDataExtracted({
          platform: null,
          period_year: null,
          period_month: null,
          income_amount: null,
          kilometres: null,
          has_km: false,
          document_type: 'paystub',
        }, documentUrl);
        toast.error('Could not extract data, but document was saved');
      }
    } catch (error) {
      console.error('Error scanning paystub:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scan paystub');
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
              alt="Paystub preview"
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
          Uploading & analyzing paystub...
        </p>
      )}
    </div>
  );
}
