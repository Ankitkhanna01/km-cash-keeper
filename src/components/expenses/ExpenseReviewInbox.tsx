import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check, CheckCheck, Info, Trash2, X, ChevronRight } from 'lucide-react';
import { ExpenseReview, useExpenseReviews } from '@/hooks/useExpenseReviews';
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

interface ExpenseReviewInboxProps {
  onExpenseDeleted?: () => void;
}

export function ExpenseReviewInbox({ onExpenseDeleted }: ExpenseReviewInboxProps) {
  const { reviews, unresolvedCount, resolveReview, resolveAll, deleteExpenseAndReviews } = useExpenseReviews();
  const [open, setOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ExpenseReview | null>(null);

  const handleResolve = async (review: ExpenseReview) => {
    await resolveReview(review.id);
    toast.success('Marked as resolved');
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

  if (unresolvedCount === 0) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative gap-2">
            <AlertTriangle className="w-4 h-4" />
            Review
            <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unresolvedCount}
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>Expense Review ({unresolvedCount})</span>
              {unresolvedCount > 1 && (
                <Button variant="ghost" size="sm" onClick={handleResolveAll} className="gap-1 text-xs">
                  <CheckCheck className="w-3.5 h-3.5" />
                  Dismiss All
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Issues found after adding expenses. Fix or dismiss at your convenience — your data is already saved.
            </p>

            {reviews.map(review => (
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1 text-xs h-8"
                    onClick={() => handleResolve(review)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Dismiss
                  </Button>
                  {review.expense_id && (review.review_type === 'duplicate') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1 gap-1 text-xs h-8"
                      onClick={() => setDeleteConfirm(review)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Expense
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

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
