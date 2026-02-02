import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Receipt, Image, FileText, ExternalLink, Trash2, AlertTriangle, X } from 'lucide-react';
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer';
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
import { useIsMobile } from '@/hooks/use-mobile';

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

function parseNotesToItems(notes: string | null): ParsedItem[] {
  if (!notes) return [];
  
  const lines = notes.split('\n').filter(line => line.trim());
  return lines.map(line => {
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

function findDuplicates(expenses: Expense[]): Set<string> {
  const duplicateIds = new Set<string>();
  const groups = new Map<string, Expense[]>();

  expenses.forEach(expense => {
    const vendorKey = expense.vendor_name.toLowerCase().trim().replace(/\s+/g, ' ');
    const key = `${vendorKey}|${expense.date}|${expense.amount.toFixed(2)}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(expense);
  });

  groups.forEach((group) => {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      sorted.slice(1).forEach(exp => duplicateIds.add(exp.id));
    }
  });

  return duplicateIds;
}

// Mobile-friendly receipt card - tappable with visible price
function ReceiptCard({ 
  expense, 
  isDuplicate, 
  onTap 
}: { 
  expense: Expense; 
  isDuplicate: boolean; 
  onTap: () => void;
}) {
  return (
    <div 
      className={`border rounded-lg p-3 cursor-pointer active:bg-muted/50 transition-colors ${isDuplicate ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}
      onClick={onTap}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl flex-shrink-0">{EXPENSE_CATEGORY_ICONS[expense.category]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{expense.vendor_name}</span>
            {isDuplicate && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Dup
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(expense.date), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="text-right flex-shrink-0 pl-2">
          <p className="font-bold text-xl text-primary">${expense.amount.toFixed(2)}</p>
          <Badge variant="outline" className="text-[10px] mt-1">
            {EXPENSE_CATEGORY_LABELS[expense.category].split(' ')[0]}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// Receipt detail content (shared between Dialog and Drawer)
function ReceiptDetailContent({ 
  expense, 
  receiptImageUrl,
  onViewImage,
  onDelete,
  isLoadingImage
}: { 
  expense: Expense;
  receiptImageUrl: string | null;
  onViewImage: () => void;
  onDelete: () => void;
  isLoadingImage: boolean;
}) {
  const items = parseNotesToItems(expense.notes);
  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{EXPENSE_CATEGORY_ICONS[expense.category]}</span>
          <div>
            <h3 className="font-semibold text-lg">{expense.vendor_name}</h3>
            <p className="text-sm text-muted-foreground">
              {format(parseISO(expense.date), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-2xl">${expense.amount.toFixed(2)}</p>
          <Badge variant="secondary">
            {EXPENSE_CATEGORY_LABELS[expense.category]}
          </Badge>
        </div>
      </div>

      {/* Receipt Image Preview */}
      {expense.receipt_url && (
        <div className="border rounded-lg overflow-hidden">
          {isLoadingImage ? (
            <div className="h-32 bg-muted animate-pulse flex items-center justify-center">
              <span className="text-muted-foreground text-sm">Loading image...</span>
            </div>
          ) : receiptImageUrl ? (
            <div 
              className="cursor-pointer relative group"
              onClick={onViewImage}
            >
              <img 
                src={receiptImageUrl} 
                alt="Receipt" 
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-sm flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  View Full Size
                </span>
              </div>
            </div>
          ) : (
            <div className="h-32 bg-muted flex items-center justify-center">
              <Image className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Extracted Items */}
      {hasItems && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Extracted Items</h4>
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex justify-between items-start gap-2 text-sm">
                <span className="flex-1">{item.name}</span>
                <span className="text-muted-foreground whitespace-nowrap">{item.quantity}</span>
                <span className="font-medium whitespace-nowrap">{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes (if no items) */}
      {!hasItems && expense.notes && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Notes</h4>
          <p className="text-sm bg-muted/50 rounded-lg p-3">{expense.notes}</p>
        </div>
      )}

      {/* Delete Button */}
      <Button 
        variant="destructive" 
        className="w-full" 
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Receipt
      </Button>
    </div>
  );
}

export function ReceiptHistory({ expenses, onDeleteExpense }: ReceiptHistoryProps) {
  const isMobile = useIsMobile();
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const receiptsWithData = expenses.filter(e => e.receipt_url || e.notes);
  const duplicateIds = useMemo(() => findDuplicates(receiptsWithData), [receiptsWithData]);
  const duplicateCount = duplicateIds.size;

  const loadReceiptImage = async (expense: Expense) => {
    if (!expense.receipt_url) return;
    
    setIsLoadingImage(true);
    try {
      if (expense.receipt_url.startsWith('http')) {
        setReceiptImageUrl(expense.receipt_url);
      } else {
        const { data } = await supabase.storage
          .from('receipts')
          .createSignedUrl(expense.receipt_url, 3600);
        if (data?.signedUrl) {
          setReceiptImageUrl(data.signedUrl);
        }
      }
    } catch (error) {
      console.error('Error loading receipt image:', error);
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleSelectExpense = (expense: Expense) => {
    setSelectedExpense(expense);
    setReceiptImageUrl(null);
    loadReceiptImage(expense);
  };

  const handleCloseDetail = () => {
    setSelectedExpense(null);
    setReceiptImageUrl(null);
  };

  const handleViewFullImage = () => {
    if (receiptImageUrl) {
      setFullImageUrl(receiptImageUrl);
    }
  };

  const handleDeleteClick = () => {
    if (selectedExpense) {
      setExpenseToDelete(selectedExpense);
      setSelectedExpense(null);
    }
  };

  const handleFirstConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    setConfirmStep(2);
  };

  const handleFinalDelete = async () => {
    if (!expenseToDelete || !onDeleteExpense) return;
    
    setIsDeleting(true);
    try {
      await onDeleteExpense(expenseToDelete.id);
      toast.success('Receipt deleted successfully');
    } catch (error) {
      toast.error('Failed to delete receipt');
    } finally {
      setIsDeleting(false);
      setExpenseToDelete(null);
      setConfirmStep(1);
    }
  };

  const handleCancelDelete = () => {
    setExpenseToDelete(null);
    setConfirmStep(1);
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

  const DetailWrapper = isMobile ? Drawer : Dialog;
  const DetailContent = isMobile ? DrawerContent : DialogContent;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Receipt History
            <div className="ml-auto flex items-center gap-2">
              {duplicateCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  {duplicateCount}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {receiptsWithData.length}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {duplicateCount > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2 mb-3">
              <p className="text-xs text-destructive font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {duplicateCount} potential duplicate{duplicateCount > 1 ? 's' : ''} - tap to review
              </p>
            </div>
          )}
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-2">
              {receiptsWithData.map((expense) => (
                <ReceiptCard 
                  key={expense.id} 
                  expense={expense} 
                  isDuplicate={duplicateIds.has(expense.id)}
                  onTap={() => handleSelectExpense(expense)}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Receipt Detail - Drawer on mobile, Dialog on desktop */}
      {isMobile ? (
        <Drawer open={!!selectedExpense} onOpenChange={(open) => !open && handleCloseDetail()}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>Receipt Details</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto">
              {selectedExpense && (
                <ReceiptDetailContent
                  expense={selectedExpense}
                  receiptImageUrl={receiptImageUrl}
                  onViewImage={handleViewFullImage}
                  onDelete={handleDeleteClick}
                  isLoadingImage={isLoadingImage}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!selectedExpense} onOpenChange={(open) => !open && handleCloseDetail()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Receipt Details</DialogTitle>
            </DialogHeader>
            {selectedExpense && (
              <ReceiptDetailContent
                expense={selectedExpense}
                receiptImageUrl={receiptImageUrl}
                onViewImage={handleViewFullImage}
                onDelete={handleDeleteClick}
                isLoadingImage={isLoadingImage}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Full Size Image Viewer */}
      <Dialog open={!!fullImageUrl} onOpenChange={() => setFullImageUrl(null)}>
        <DialogContent className="max-w-lg p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Receipt Image</DialogTitle>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10"
            onClick={() => setFullImageUrl(null)}
          >
            <X className="h-4 w-4" />
          </Button>
          {fullImageUrl && (
            <img 
              src={fullImageUrl} 
              alt="Receipt" 
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog - Two Step */}
      <AlertDialog open={!!expenseToDelete} onOpenChange={handleCancelDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStep === 1 ? 'Delete Receipt?' : '⚠️ Final Confirmation'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {confirmStep === 1 ? (
                <>
                  <p>Are you sure you want to delete this expense?</p>
                  {expenseToDelete && (
                    <div className="bg-muted p-3 rounded-lg text-sm">
                      <p><strong>Vendor:</strong> {expenseToDelete.vendor_name}</p>
                      <p><strong>Date:</strong> {format(parseISO(expenseToDelete.date), 'MMM d, yyyy')}</p>
                      <p><strong>Amount:</strong> ${expenseToDelete.amount.toFixed(2)}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-destructive font-medium">
                    This will permanently delete the receipt and expense record.
                  </p>
                  <p>This action <strong>cannot be undone</strong>. Are you absolutely sure?</p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            {confirmStep === 1 ? (
              <Button 
                onClick={handleFirstConfirm}
                variant="destructive"
              >
                Yes, Delete
              </Button>
            ) : (
              <Button 
                onClick={handleFinalDelete} 
                disabled={isDeleting}
                variant="destructive"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
