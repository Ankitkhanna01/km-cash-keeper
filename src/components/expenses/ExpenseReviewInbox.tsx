import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, CheckCheck, Info, Trash2, Merge, ArrowRight, Receipt, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { ExpenseReview, useExpenseReviews } from '@/hooks/useExpenseReviews';
import { Expense } from '@/hooks/useExpensesDB';
import { supabase } from '@/integrations/supabase/client';
import { useSecureStorage } from '@/hooks/useSecureStorage';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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

interface ExpenseReviewInboxProps {
  onExpenseDeleted?: () => void;
}

interface MergeCandidate {
  review: ExpenseReview;
  newExpense: Expense | null;
  existingExpense: Expense | null;
}

export function ExpenseReviewInbox({ onExpenseDeleted }: ExpenseReviewInboxProps) {
  const { reviews, unresolvedCount, resolveReview, resolveAll, deleteExpenseAndReviews, reAnalyzeAll } = useExpenseReviews();
  const { getSignedUrl } = useSecureStorage();
  const [open, setOpen] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ExpenseReview | null>(null);
  const [mergeView, setMergeView] = useState<MergeCandidate | null>(null);
  const [relatedExpenses, setRelatedExpenses] = useState<Record<string, Expense>>({});
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Fetch related expenses for side-by-side view
  useEffect(() => {
    if (!open || reviews.length === 0) return;
    const ids = new Set<string>();
    reviews.forEach(r => {
      if (r.expense_id) ids.add(r.expense_id);
      if (r.related_expense_id) ids.add(r.related_expense_id);
    });
    if (ids.size === 0) return;

    supabase
      .from('expenses')
      .select('*')
      .in('id', Array.from(ids))
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, Expense> = {};
        data.forEach(e => {
          map[e.id] = { ...e, amount: Number(e.amount), category: e.category as Expense['category'] };
        });
        setRelatedExpenses(map);
      });
  }, [open, reviews]);

  // Generate signed URLs for receipts when merge view opens
  useEffect(() => {
    if (!mergeView) return;
    const expenses = [mergeView.newExpense, mergeView.existingExpense].filter(Boolean) as Expense[];
    expenses.forEach(async (exp) => {
      if (exp.receipt_url && !receiptUrls[exp.id]) {
        const url = await getSignedUrl('receipts', exp.receipt_url);
        if (url) {
          setReceiptUrls(prev => ({ ...prev, [exp.id]: url }));
        }
      }
    });
  }, [mergeView, getSignedUrl]);

  const handleResolve = async (review: ExpenseReview) => {
    await resolveReview(review.id);
    toast.success('Marked as resolved');
    setMergeView(null);
  };

  const handleResolveAll = async () => {
    await resolveAll();
    toast.success('All issues resolved');
  };

  const handleDeleteExpense = async (review: ExpenseReview) => {
    if (!review.expense_id) return;
    const success = await deleteExpenseAndReviews(review.expense_id);
    if (success) {
      toast.success('Expense deleted');
      onExpenseDeleted?.();
    } else {
      toast.error('Failed to delete expense');
    }
    setDeleteConfirm(null);
    setMergeView(null);
  };

  const handleMerge = async (review: ExpenseReview, keepId: string, deleteId: string) => {
    const keepExp = relatedExpenses[keepId];
    const deleteExp = relatedExpenses[deleteId];
    if (!keepExp || !deleteExp) return;

    try {
      const updates: Record<string, unknown> = {};
      if (deleteExp.receipt_url && !keepExp.receipt_url) {
        updates.receipt_url = deleteExp.receipt_url;
      }
      if (deleteExp.notes && (!keepExp.notes || deleteExp.notes.length > keepExp.notes.length)) {
        updates.notes = deleteExp.notes;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('expenses').update(updates).eq('id', keepId);
      }

      await supabase.from('expenses').delete().eq('id', deleteId);
      await resolveReview(review.id);

      setRelatedExpenses(prev => {
        const next = { ...prev };
        if (Object.keys(updates).length > 0) {
          next[keepId] = { ...next[keepId], ...updates } as Expense;
        }
        delete next[deleteId];
        return next;
      });

      toast.success('Expenses merged successfully');
      onExpenseDeleted?.();
      setMergeView(null);
    } catch (e) {
      console.error('Error merging:', e);
      toast.error('Failed to merge expenses');
    }
  };

  const openMergeView = (review: ExpenseReview) => {
    setMergeView({
      review,
      newExpense: review.expense_id ? relatedExpenses[review.expense_id] || null : null,
      existingExpense: review.related_expense_id ? relatedExpenses[review.related_expense_id] || null : null,
    });
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
      default: return <Info className="w-4 h-4 text-primary shrink-0" />;
    }
  };

  const reviewTypeBadge = (type: string) => {
    const labels: Record<string, { label: string; className: string }> = {
      duplicate: { label: 'Duplicate', className: 'bg-destructive/20 text-destructive' },
      receipt_match: { label: 'Receipt Link', className: 'bg-primary/20 text-primary' },
      amount_mismatch: { label: 'Large Amount', className: 'bg-yellow-500/20 text-yellow-500' },
      missing_receipt: { label: 'No Receipt', className: 'bg-muted text-muted-foreground' },
      category_check: { label: 'Category', className: 'bg-muted text-muted-foreground' },
    };
    const config = labels[type] || { label: type, className: 'bg-muted text-muted-foreground' };
    return <Badge variant="secondary" className={`text-[10px] ${config.className}`}>{config.label}</Badge>;
  };

  const handleReAnalyze = async () => {
    setReanalyzing(true);
    try {
      const count = await reAnalyzeAll();
      if (count && count > 0) {
        toast.success(`Found ${count} new match${count > 1 ? 'es' : ''} to review`);
        if (!open) setOpen(true);
      } else {
        toast.info('No new matches found');
      }
    } catch {
      toast.error('Failed to re-analyze');
    } finally {
      setReanalyzing(false);
    }
  };

  if (unresolvedCount === 0) {
    // Still show re-analyze button even with no current reviews
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={handleReAnalyze} disabled={reanalyzing}>
        <RefreshCw className={`w-4 h-4 ${reanalyzing ? 'animate-spin' : ''}`} />
        {reanalyzing ? 'Scanning...' : 'Re-scan'}
      </Button>
    );
  }

  const hasMergeable = (review: ExpenseReview) =>
    review.related_expense_id && (review.review_type === 'duplicate' || review.review_type === 'receipt_match');

  const ExpenseCompareCard = ({ expense, label, labelClass, showReceipt }: {
    expense: Expense;
    label: string;
    labelClass: string;
    showReceipt?: boolean;
  }) => {
    const signedUrl = receiptUrls[expense.id];
    const hasReceipt = !!expense.receipt_url;

    return (
      <Card className={`p-3 space-y-2 border-${labelClass}/30`}>
        <Badge variant="secondary" className={`text-[10px] bg-${labelClass}/20 text-${labelClass}`}>
          {label}
        </Badge>
        <p className="text-sm font-medium truncate">{expense.vendor_name}</p>
        <p className="text-lg font-bold">${expense.amount.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground">{expense.date}</p>
        {expense.card_last4 && (
          <p className="text-xs font-mono text-muted-foreground">Card ****{expense.card_last4}</p>
        )}
        <p className="text-[10px] text-muted-foreground capitalize">{expense.category}</p>

        {hasReceipt && (
          <div className="flex items-center gap-1 text-xs text-primary">
            <Receipt className="w-3 h-3" /> Has receipt
          </div>
        )}

        {/* Receipt image preview */}
        {showReceipt && hasReceipt && signedUrl && (
          <div
            className="mt-2 cursor-pointer rounded-md overflow-hidden border border-border"
            onClick={() => setFullscreenImage(signedUrl)}
          >
            <img
              src={signedUrl}
              alt={`Receipt from ${expense.vendor_name}`}
              className="w-full h-28 object-cover"
            />
            <p className="text-[10px] text-center text-muted-foreground py-1">Tap to enlarge</p>
          </div>
        )}
        {showReceipt && hasReceipt && !signedUrl && (
          <div className="mt-2 flex items-center justify-center h-20 rounded-md border border-dashed border-border bg-muted/30">
            <ImageIcon className="w-5 h-5 text-muted-foreground animate-pulse" />
          </div>
        )}

        {expense.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{expense.notes}</p>
        )}
      </Card>
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMergeView(null); }}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative gap-2">
            <AlertTriangle className="w-4 h-4" />
            Review
            <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unresolvedCount}
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>Expense Review ({unresolvedCount})</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={handleReAnalyze} disabled={reanalyzing} className="gap-1 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
                  Re-scan
                </Button>
                {unresolvedCount > 1 && (
                  <Button variant="ghost" size="sm" onClick={handleResolveAll} className="gap-1 text-xs">
                    <CheckCheck className="w-3.5 h-3.5" />
                    Dismiss All
                  </Button>
                )}
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Issues found after adding expenses. Tap Compare to see both entries side-by-side with receipts.
            </p>

            {/* Merge detail view */}
            {mergeView && mergeView.newExpense && mergeView.existingExpense ? (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={() => setMergeView(null)} className="text-xs gap-1 -ml-2">
                  ← Back to list
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <ExpenseCompareCard
                    expense={mergeView.newExpense}
                    label="Statement"
                    labelClass="yellow-500"
                    showReceipt
                  />
                  <ExpenseCompareCard
                    expense={mergeView.existingExpense}
                    label={mergeView.existingExpense.receipt_url ? 'Receipt' : 'Existing'}
                    labelClass="primary"
                    showReceipt
                  />
                </div>

                {/* Amount difference highlight */}
                {mergeView.newExpense.amount !== mergeView.existingExpense.amount && (
                  <Card className="p-3 bg-muted/50">
                    <p className="text-xs text-muted-foreground">Amount difference</p>
                    <p className="text-sm font-semibold">
                      ${Math.abs(mergeView.newExpense.amount - mergeView.existingExpense.amount).toFixed(2)}
                      {mergeView.newExpense.amount > mergeView.existingExpense.amount ? ' more on statement (tip?)' : ' less on statement'}
                    </p>
                  </Card>
                )}

                {/* Action buttons */}
                <div className="space-y-2 pt-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => handleMerge(
                      mergeView.review,
                      mergeView.newExpense!.id,
                      mergeView.existingExpense!.id
                    )}
                  >
                    <Merge className="w-4 h-4" />
                    Keep Statement (${mergeView.newExpense.amount.toFixed(2)})
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => handleMerge(
                      mergeView.review,
                      mergeView.existingExpense!.id,
                      mergeView.newExpense!.id
                    )}
                  >
                    <Merge className="w-4 h-4" />
                    Keep Receipt (${mergeView.existingExpense.amount.toFixed(2)})
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleResolve(mergeView.review)}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Keep Both
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setDeleteConfirm(mergeView.review)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete New
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Review list */
              reviews.map(review => (
                <Card key={review.id} className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    {severityIcon(review.severity)}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {reviewTypeBadge(review.review_type)}
                      </div>
                      <p className="text-sm">{review.message}</p>
                      {review.details && (
                        <p className="text-xs text-muted-foreground">{review.details}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {hasMergeable(review) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1 text-xs h-8"
                        onClick={() => openMergeView(review)}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Compare
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 gap-1 text-xs h-8"
                      onClick={() => handleResolve(review)}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Dismiss
                    </Button>
                    {review.expense_id && review.review_type === 'duplicate' && !hasMergeable(review) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 gap-1 text-xs h-8"
                        onClick={() => setDeleteConfirm(review)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Fullscreen receipt image */}
      <Dialog open={!!fullscreenImage} onOpenChange={() => setFullscreenImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-1 bg-black/90">
          {fullscreenImage && (
            <img
              src={fullscreenImage}
              alt="Receipt"
              className="w-full h-full object-contain max-h-[90vh]"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Duplicate Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this expense. The original will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteConfirm && handleDeleteExpense(deleteConfirm)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
