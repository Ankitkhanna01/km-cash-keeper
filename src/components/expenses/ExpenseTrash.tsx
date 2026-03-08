import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useExpensesDB, Expense } from '@/hooks/useExpensesDB';
import { toast } from 'sonner';
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

export function ExpenseTrash() {
  const { trashedExpenses, fetchTrashed, restoreExpense, permanentlyDeleteExpense, emptyTrash } = useExpensesDB();
  const [expanded, setExpanded] = useState(false);
  const [emptyConfirm, setEmptyConfirm] = useState(false);

  // Always fetch trashed count on mount
  useEffect(() => {
    fetchTrashed();
  }, []);

  useEffect(() => {
    if (expanded) {
      fetchTrashed();
    }
  }, [expanded]);

  const handleRestore = async (id: string) => {
    const success = await restoreExpense(id);
    if (success) {
      toast.success('Expense restored');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    const success = await permanentlyDeleteExpense(id);
    if (success) {
      toast.success('Permanently deleted');
    }
  };

  const handleEmptyTrash = async () => {
    await emptyTrash();
    toast.success('Trash emptied');
    setEmptyConfirm(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Recently Deleted</span>
        {trashedExpenses.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {trashedExpenses.length}
          </Badge>
        )}
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {trashedExpenses.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No deleted expenses</p>
          ) : (
            <>
              {trashedExpenses.map(expense => (
                <Card key={expense.id} className="p-3 opacity-70">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{expense.vendor_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>${expense.amount.toFixed(2)}</span>
                        <span>·</span>
                        <span>{expense.date}</span>
                        {expense.deleted_at && (
                          <>
                            <span>·</span>
                            <span>Deleted {formatDate(expense.deleted_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleRestore(expense.id)}
                        title="Restore"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handlePermanentDelete(expense.id)}
                        title="Delete permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs text-destructive hover:text-destructive"
                onClick={() => setEmptyConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Empty Trash
              </Button>
            </>
          )}
        </div>
      )}

      <AlertDialog open={emptyConfirm} onOpenChange={setEmptyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {trashedExpenses.length} expense{trashedExpenses.length !== 1 ? 's' : ''}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={handleEmptyTrash}
            >
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
