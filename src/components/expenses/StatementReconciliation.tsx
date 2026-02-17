import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText } from 'lucide-react';
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

export function StatementReconciliation({ expenses, onAddExpense, onBulkAdded }: StatementReconciliationProps) {
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [transactions, setTransactions] = useState<StatementTransaction[] | null>(null);
  const [statementCardLast4, setStatementCardLast4] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleMerge = async (statementTxn: StatementTransaction, receiptExpense: Expense) => {
    // Update the existing receipt expense with statement amount (statement is authoritative)
    try {
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
    } catch (e) {
      console.error('Merge error:', e);
      toast.error('Failed to merge');
    }
  };

  const handleMarkNoReceipt = async (statementTxn: StatementTransaction) => {
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
            {transactions ? 'Statement Reconciliation' : 'Import Statement / PDF'}
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

          {/* Upload button — before scan */}
          {!transactions && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a statement to match transactions against your receipts. Same card + date range = automatic matching.
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
            </>
          )}

          {/* Reconciliation view — after scan */}
          {transactions && onAddExpense && (
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
