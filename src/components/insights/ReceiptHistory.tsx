import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Receipt, ChevronDown, ChevronUp, Image, FileText, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  onDeleteExpense?: (id: string) => Promise<void>;
}

interface ParsedItem {
  name: string;
  quantity: string;
  price: string;
}

interface DuplicateGroup {
  key: string;
  expenses: Expense[];
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

// Find potential duplicates based on vendor, date, and amount
function findDuplicates(expenses: Expense[]): Set<string> {
  const duplicateIds = new Set<string>();
  const groups = new Map<string, Expense[]>();

  expenses.forEach(expense => {
    // Create a key based on vendor (normalized), date, and amount
    const vendorKey = expense.vendor_name.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = `${vendorKey}|${expense.date}|${expense.amount.toFixed(2)}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(expense);
  });

  // Mark all expenses in groups with more than one item as duplicates
  groups.forEach((group) => {
    if (group.length > 1) {
      // Sort by created_at, mark all except the oldest as duplicates
      const sorted = [...group].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      // Keep the first one (oldest), flag the rest as duplicates
      sorted.slice(1).forEach(exp => duplicateIds.add(exp.id));
    }
  });

  return duplicateIds;
}

interface ReceiptCardProps {
  expense: Expense;
  onViewReceipt: (url: string) => void;
  onDelete?: (expense: Expense) => void;
  isDuplicate: boolean;
}

function ReceiptCard({ expense, onViewReceipt, onDelete, isDuplicate }: ReceiptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const items = parseNotesToItems(expense.notes);
  const hasItems = items.length > 0;
  const hasReceipt = !!expense.receipt_url;

  const handleViewReceipt = async () => {
    if (!expense.receipt_url) return;
    
    // Check if it's already a signed URL or just a path
    if (expense.receipt_url.startsWith('http')) {
      onViewReceipt(expense.receipt_url);
      return;
    }
    
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
    <div className={`border rounded-lg p-3 space-y-2 ${isDuplicate ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{EXPENSE_CATEGORY_ICONS[expense.category]}</span>
            <span className="font-medium truncate">{expense.vendor_name}</span>
            {isDuplicate && (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Duplicate
              </Badge>
            )}
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
            {isDuplicate && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(expense)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
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

export function ReceiptHistory({ expenses, onDeleteExpense }: ReceiptHistoryProps) {
  const [receiptViewUrl, setReceiptViewUrl] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Only show expenses that have receipts or extracted items
  const receiptsWithData = expenses.filter(e => e.receipt_url || e.notes);
  
  // Find duplicates
  const duplicateIds = useMemo(() => findDuplicates(receiptsWithData), [receiptsWithData]);
  const duplicateCount = duplicateIds.size;

  const handleDelete = async () => {
    if (!expenseToDelete || !onDeleteExpense) return;
    
    setIsDeleting(true);
    try {
      await onDeleteExpense(expenseToDelete.id);
      toast.success('Duplicate receipt deleted');
    } catch (error) {
      toast.error('Failed to delete receipt');
    } finally {
      setIsDeleting(false);
      setExpenseToDelete(null);
    }
  };
  
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
            <div className="ml-auto flex items-center gap-2">
              {duplicateCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant="secondary">
                {receiptsWithData.length} receipts
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {duplicateCount > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {duplicateCount} potential duplicate{duplicateCount > 1 ? 's' : ''} detected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Receipts with the same vendor, date, and amount are flagged. Click the trash icon to delete duplicates.
              </p>
            </div>
          )}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {receiptsWithData.map((expense) => (
                <ReceiptCard 
                  key={expense.id} 
                  expense={expense} 
                  onViewReceipt={setReceiptViewUrl}
                  onDelete={onDeleteExpense ? setExpenseToDelete : undefined}
                  isDuplicate={duplicateIds.has(expense.id)}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!expenseToDelete} onOpenChange={() => setExpenseToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Receipt?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Are you sure you want to delete this expense?</p>
              {expenseToDelete && (
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <p><strong>Vendor:</strong> {expenseToDelete.vendor_name}</p>
                  <p><strong>Date:</strong> {format(parseISO(expenseToDelete.date), 'MMM d, yyyy')}</p>
                  <p><strong>Amount:</strong> ${expenseToDelete.amount.toFixed(2)}</p>
                </div>
              )}
              <p className="text-destructive text-sm">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
