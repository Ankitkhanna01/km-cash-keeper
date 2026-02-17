import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText, GitCompare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { Expense } from '@/hooks/useExpensesDB';
import { ExpenseCategory } from '@/types';
import { ReconciliationMatchView } from './ReconciliationMatchView';
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

interface PastStatementBatch {
  cardLast4: string | null;
  dateRange: string;
  count: number;
  transactions: StatementTransaction[];
  expenses: Expense[];
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

const mapCategoryHint = (hint: string): ExpenseCategory => {
  const map: Record<string, ExpenseCategory> = {
    fuel: 'fuel', restaurant: 'other', grocery: 'other',
    insurance: 'insurance', repairs: 'repairs', subscription: 'other', other: 'other'
  };
  return map[hint] || 'other';
};

function detectPastBatches(expenses: Expense[]): PastStatementBatch[] {
  // Find expenses added from statement
  const statementExpenses = expenses.filter(e =>
    e.notes?.toLowerCase().includes('from statement')
  );
  if (statementExpenses.length === 0) return [];

  // Group by card_last4 + approximate month
  const groups = new Map<string, Expense[]>();
  for (const exp of statementExpenses) {
    const month = exp.date.substring(0, 7); // YYYY-MM
    const key = `${exp.card_last4 || 'unknown'}_${month}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(exp);
  }

  const batches: PastStatementBatch[] = [];
  for (const [key, exps] of groups) {
    const sorted = exps.sort((a, b) => a.date.localeCompare(b.date));
    const cardLast4 = sorted[0].card_last4;
    const firstDate = sorted[0].date;
    const lastDate = sorted[sorted.length - 1].date;

    batches.push({
      cardLast4,
      dateRange: `${firstDate} to ${lastDate}`,
      count: exps.length,
      expenses: exps,
      transactions: exps.map(e => ({
        date: e.date,
        description: e.vendor_name,
        amount: e.amount,
        category_hint: e.category,
      })),
    });
  }

  return batches.sort((a, b) => b.count - a.count);
}

export function StatementReconciliation({ expenses, onAddExpense, onBulkAdded }: StatementReconciliationProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'upload' | 'reconcile'>('menu');
  const [isScanning, setIsScanning] = useState(false);
  const [transactions, setTransactions] = useState<StatementTransaction[] | null>(null);
  const [statementCardLast4, setStatementCardLast4] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [pastBatches, setPastBatches] = useState<PastStatementBatch[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const batches = detectPastBatches(expenses);
      setPastBatches(batches);
      // If no past batches, go straight to upload
      if (batches.length === 0) setMode('upload');
      else setMode('menu');
    }
  }, [open, expenses]);

  const handleUpload = async (file: File) => {
    setIsScanning(true);
    setTransactions(null);
    setAddedIds([]);

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
        setMode('reconcile');
        toast.success(`Found ${data.transactions.length} transactions — matching against receipts...`);
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

  const handleReconcileExisting = (batch: PastStatementBatch) => {
    setTransactions(batch.transactions);
    setStatementCardLast4(batch.cardLast4);
    setMode('reconcile');
  };

  const handleMerge = async (statementTxn: StatementTransaction, receiptExpense: Expense) => {
    try {
      // Find the statement expense that matches this txn
      const statementExp = expenses.find(e =>
        e.notes?.toLowerCase().includes('from statement') &&
        e.vendor_name === statementTxn.description &&
        e.date === statementTxn.date &&
        Math.abs(e.amount - statementTxn.amount) < 0.01
      );

      if (statementExp) {
        // Merge: update receipt expense with statement amount, then delete statement expense
        await supabase
          .from('expenses')
          .update({
            amount: statementTxn.amount,
            notes: receiptExpense.notes
              ? `${receiptExpense.notes} | Statement verified: $${statementTxn.amount.toFixed(2)}`
              : `Statement verified: $${statementTxn.amount.toFixed(2)}`,
            card_last4: statementCardLast4 || receiptExpense.card_last4,
          })
          .eq('id', receiptExpense.id);

        // Delete the statement duplicate
        await supabase.from('expenses').delete().eq('id', statementExp.id);
        toast.success(`Merged & removed duplicate: ${statementTxn.description}`);
      } else {
        // No matching statement expense found — just update the receipt expense
        await supabase
          .from('expenses')
          .update({
            amount: statementTxn.amount,
            notes: receiptExpense.notes
              ? `${receiptExpense.notes} | Statement: $${statementTxn.amount.toFixed(2)}`
              : `Statement verified: $${statementTxn.amount.toFixed(2)}`,
            card_last4: statementCardLast4 || receiptExpense.card_last4,
          })
          .eq('id', receiptExpense.id);
        toast.success(`Merged: ${statementTxn.description}`);
      }
    } catch (e) {
      console.error('Merge error:', e);
      toast.error('Failed to merge');
    }
  };

  const handleMarkNoReceipt = async (statementTxn: StatementTransaction) => {
    // For existing statement imports, just mark as "confirmed no receipt"
    const statementExp = expenses.find(e =>
      e.notes?.toLowerCase().includes('from statement') &&
      e.vendor_name === statementTxn.description &&
      e.date === statementTxn.date &&
      Math.abs(e.amount - statementTxn.amount) < 0.01
    );

    if (statementExp) {
      // Already exists, update note to confirm
      await supabase
        .from('expenses')
        .update({ notes: 'Statement — confirmed, no receipt' })
        .eq('id', statementExp.id);
      return statementExp;
    }

    // New statement — add as expense
    if (!onAddExpense) return;
    const result = await onAddExpense({
      date: statementTxn.date,
      vendor_name: statementTxn.description,
      amount: statementTxn.amount,
      category: mapCategoryHint(statementTxn.category_hint),
      notes: 'Added from statement (no receipt)',
      receipt_url: null,
      card_last4: statementCardLast4,
    });
    if (result && typeof result === 'object' && 'id' in result) {
      setAddedIds(prev => [...prev, (result as { id: string }).id]);
    }
    return result;
  };

  const handleDone = () => {
    if (addedIds.length > 0) {
      onBulkAdded?.(addedIds);
    }
    setTransactions(null);
    setAddedIds([]);
    setMode('menu');
    setOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) handleDone(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          Import Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'reconcile' ? 'Statement Reconciliation' : 'Import Statement'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Menu — choose upload new or reconcile existing */}
          {mode === 'menu' && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a new statement or reconcile a previously imported one against your receipts.
              </p>

              <Button
                onClick={() => { setMode('upload'); fileInputRef.current?.click(); }}
                disabled={isScanning}
                className="w-full gap-2"
                variant="outline"
                size="lg"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload New Statement
                  </>
                )}
              </Button>

              {pastBatches.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Reconcile Past Import
                  </h4>
                  {pastBatches.map((batch, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="w-full justify-start gap-3 h-auto py-3"
                      onClick={() => handleReconcileExisting(batch)}
                    >
                      <GitCompare className="w-5 h-5 text-primary shrink-0" />
                      <div className="text-left">
                        <p className="text-sm font-medium">
                          {batch.count} transactions
                          {batch.cardLast4 && <span className="font-mono text-muted-foreground ml-1">****{batch.cardLast4}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{batch.dateRange}</p>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Upload mode (no past batches) */}
          {mode === 'upload' && !transactions && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a statement to match transactions against your receipts.
              </p>
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
              {pastBatches.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setMode('menu')}>
                  ← Back
                </Button>
              )}
            </>
          )}

          {/* Reconciliation view */}
          {mode === 'reconcile' && transactions && onAddExpense && (
            <ReconciliationMatchView
              transactions={transactions}
              cardLast4={statementCardLast4}
              expenses={expenses}
              onAddExpense={onAddExpense}
              onMerge={handleMerge}
              onMarkNoReceipt={handleMarkNoReceipt}
              onDone={handleDone}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
