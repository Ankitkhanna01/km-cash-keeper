import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Receipt, ChevronDown, ChevronUp, Image, FileText, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Expense {
  id: string;
  date: string;
  vendor_name: string;
  amount: number;
  category: ExpenseCategory;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

interface ReceiptHistoryProps {
  expenses: Expense[];
}

interface ParsedItem {
  name: string;
  quantity: string;
  price: string;
}

function parseNotesToItems(notes: string | null): ParsedItem[] {
  if (!notes) return [];
  
  const lines = notes.split('\n').filter(line => line.trim());
  return lines.map(line => {
    // Pattern: "Item Name (x2) - $5.99" or "Item Name (1.5 kg) - $5.99"
    const match = line.match(/^(.+?)\s*\(([^)]+)\)\s*-\s*\$?([\d.]+)$/);
    if (match) {
      return {
        name: match[1].trim(),
        quantity: match[2].trim(),
        price: `$${parseFloat(match[3]).toFixed(2)}`
      };
    }
    return { name: line, quantity: '1', price: '-' };
  });
}

function ReceiptCard({ expense, onViewReceipt }: { expense: Expense; onViewReceipt: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const items = parseNotesToItems(expense.notes);
  const hasItems = items.length > 0;
  const hasReceipt = !!expense.receipt_url;

  const handleViewReceipt = async () => {
    if (!expense.receipt_url) return;
    
    try {
      const { data } = await supabase.storage
        .from('receipts')
        .createSignedUrl(expense.receipt_url, 3600);
      
      if (data?.signedUrl) {
        onViewReceipt(data.signedUrl);
      }
    } catch (error) {
      console.error('Error getting receipt URL:', error);
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{EXPENSE_CATEGORY_ICONS[expense.category]}</span>
            <span className="font-medium truncate">{expense.vendor_name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span>{format(parseISO(expense.date), 'MMM d, yyyy')}</span>
            <Badge variant="outline" className="text-xs">
              {EXPENSE_CATEGORY_LABELS[expense.category]}
            </Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold">${expense.amount.toFixed(2)}</p>
          <div className="flex gap-1 mt-1">
            {hasReceipt && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleViewReceipt}
              >
                <Image className="h-3.5 w-3.5" />
              </Button>
            )}
            {hasItems && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {expanded && hasItems && (
        <div className="bg-muted/50 rounded-md p-2 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Extracted Items:</p>
          <div className="space-y-1">
            {items.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="truncate flex-1">{item.name}</span>
                <span className="text-muted-foreground mx-2">{item.quantity}</span>
                <span className="font-medium">{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasItems && expense.notes && (
        <p className="text-sm text-muted-foreground truncate">{expense.notes}</p>
      )}
    </div>
  );
}

export function ReceiptHistory({ expenses }: ReceiptHistoryProps) {
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  
  // Only show expenses that have receipts or extracted items
  const receiptsWithData = expenses.filter(e => e.receipt_url || e.notes);
  
  if (receiptsWithData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Receipt History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No scanned receipts yet</p>
            <p className="text-sm">Scan a receipt in Expenses to see extracted details here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Receipt History
            <Badge variant="secondary" className="ml-auto">
              {receiptsWithData.length} receipts
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {receiptsWithData.map((expense) => (
                <ReceiptCard 
                  key={expense.id} 
                  expense={expense} 
                  onViewReceipt={setReceiptViewUrl}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Receipt Image Viewer Dialog */}
      <Dialog open={!!receiptViewUrl} onOpenChange={() => setReceiptViewUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Receipt Image
            </DialogTitle>
          </DialogHeader>
          {receiptViewUrl && (
            <div className="space-y-3">
              <img 
                src={receiptViewUrl} 
                alt="Receipt" 
                className="w-full max-h-[60vh] object-contain rounded-lg border"
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(receiptViewUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Size
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
