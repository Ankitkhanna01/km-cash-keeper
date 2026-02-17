import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, FileText, Plus, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { Expense } from '@/hooks/useExpensesDB';
import { ExpenseCategory } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category_hint: string;
}

interface StatementReconciliationProps {
  expenses: Expense[];
  onAddExpense?: (data: {
    date: string;
    vendor_name: string;
    amount: number;
    category: ExpenseCategory;
    notes: string | null;
    receipt_url: string | null;
    card_last4?: string | null;
  }) => Promise<unknown>;
  onBulkAdded?: (newExpenseIds: string[]) => void;
}

export function StatementReconciliation({ expenses, onAddExpense, onBulkAdded }: StatementReconciliationProps) {
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [transactions, setTransactions] = useState<StatementTransaction[] | null>(null);
  const [statementCardLast4, setStatementCardLast4] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapCategoryHint = (hint: string): ExpenseCategory => {
    const map: Record<string, ExpenseCategory> = {
      fuel: 'fuel', restaurant: 'other', grocery: 'other',
      insurance: 'insurance', repairs: 'repairs', subscription: 'other', other: 'other'
    };
    return map[hint] || 'other';
  };

  const handleUpload = async (file: File) => {
    setIsScanning(true);
    setTransactions(null);
    setAddedCount(0);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      const requestBody = { image: base64Data };
      const { data, error } = await enqueueAIRequest(
        'scan-statement',
        requestBody,
        () => supabase.functions.invoke('scan-statement', { body: requestBody })
      );

      if (error) throw new Error(error.message || 'Failed to scan statement');
      if (data?.error) throw new Error(data.error);

      if (data?.success && data.transactions && data.transactions.length > 0) {
        setTransactions(data.transactions);
        setStatementCardLast4(data.card_last4 || null);
        toast.success(`Found ${data.transactions.length} transactions — ready to add`);
      } else {
        toast.error('No transactions found in this document');
      }
    } catch (err) {
      console.error('Statement scan error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to process statement');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddAll = async () => {
    if (!onAddExpense || !transactions) return;
    setIsAdding(true);

    const newExpenseIds: string[] = [];
    let added = 0;

    for (const txn of transactions) {
      try {
        const result = await onAddExpense({
          date: txn.date,
          vendor_name: txn.description,
          amount: txn.amount,
          category: mapCategoryHint(txn.category_hint),
          notes: 'Added from statement',
          receipt_url: null,
          card_last4: statementCardLast4,
        });
        if (result && typeof result === 'object' && 'id' in result) {
          newExpenseIds.push((result as { id: string }).id);
        }
        added++;
        setAddedCount(added);
      } catch (e) {
        console.error(`Failed to add ${txn.description}:`, e);
      }
    }

    setIsAdding(false);
    toast.success(`✓ Added ${added} expenses. Analyzing for issues...`);
    
    // Trigger background analysis
    onBulkAdded?.(newExpenseIds);

    // Reset after short delay
    setTimeout(() => {
      setTransactions(null);
      setAddedCount(0);
      setOpen(false);
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const totalAmount = transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          Import Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Statement / PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload any statement, bank PDF, or document. All transactions will be added instantly — issues are flagged for review later.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Upload button */}
          {!transactions && (
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="w-full gap-2"
              variant="outline"
              size="lg"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Extracting transactions...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload PDF or Image
                </>
              )}
            </Button>
          )}

          {/* Transactions found — one button to add all */}
          {transactions && !isAdding && addedCount === 0 && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-4 text-center space-y-1">
                <p className="text-3xl font-bold">{transactions.length}</p>
                <p className="text-sm text-muted-foreground">transactions found</p>
                <p className="text-lg font-semibold text-primary">${totalAmount.toFixed(2)} total</p>
                {statementCardLast4 && (
                  <p className="text-xs font-mono text-muted-foreground">Card ****{statementCardLast4}</p>
                )}
              </div>

              {/* Quick preview of first few */}
              <div className="max-h-32 overflow-y-auto space-y-1">
              {transactions.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground px-1 gap-2">
                    <span className="shrink-0 text-[10px]">{t.date}</span>
                    <span className="truncate flex-1">{t.description}</span>
                    <span className="shrink-0">${t.amount.toFixed(2)}</span>
                  </div>
                ))}
                {transactions.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{transactions.length - 5} more...
                  </p>
                )}
              </div>

              <Button
                onClick={handleAddAll}
                className="w-full gap-2"
                size="lg"
              >
                <Plus className="w-5 h-5" />
                Add All {transactions.length} Expenses
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => { setTransactions(null); setAddedCount(0); }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Adding progress */}
          {isAdding && (
            <div className="text-center space-y-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm font-medium">
                Adding expenses... {addedCount}/{transactions?.length}
              </p>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(addedCount / (transactions?.length || 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Done */}
          {!isAdding && addedCount > 0 && (
            <div className="text-center space-y-2 py-4">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
              <p className="text-sm font-medium">
                {addedCount} expenses added!
              </p>
              <p className="text-xs text-muted-foreground">
                Analyzing for duplicates & issues...
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
