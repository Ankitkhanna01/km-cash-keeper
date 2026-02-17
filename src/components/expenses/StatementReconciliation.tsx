import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { Expense } from '@/hooks/useExpensesDB';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category_hint: string;
}

interface MatchResult {
  transaction: StatementTransaction;
  status: 'matched' | 'tip_difference' | 'unmatched';
  matchedExpense?: Expense;
  difference?: number;
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
  }) => Promise<unknown>;
}

export function StatementReconciliation({ expenses, onAddExpense }: StatementReconciliationProps) {
  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const findClosestMatch = (txn: StatementTransaction): { expense: Expense | null; diff: number } => {
    let bestMatch: Expense | null = null;
    let bestScore = Infinity;

    for (const exp of expenses) {
      // Date check: same date or within 1 day
      const txnDate = new Date(txn.date);
      const expDate = new Date(exp.date);
      const daysDiff = Math.abs(txnDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 3) continue;

      // Name similarity: simple substring match
      const txnName = txn.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const expName = exp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = txnName.includes(expName) || expName.includes(txnName) ||
        // Check for partial word matches (at least 4 chars)
        txnName.split('').filter((_, i) => txnName.substring(i, i + 4) === expName.substring(0, 4)).length > 0;

      if (!nameMatch && daysDiff > 0) continue;

      const amountDiff = Math.abs(txn.amount - exp.amount);
      const score = daysDiff * 10 + amountDiff + (nameMatch ? 0 : 50);

      if (score < bestScore) {
        bestScore = score;
        bestMatch = exp;
      }
    }

    return { expense: bestMatch, diff: bestMatch ? txn.amount - bestMatch.amount : 0 };
  };

  const reconcile = (transactions: StatementTransaction[]): MatchResult[] => {
    return transactions.map(txn => {
      const { expense, diff } = findClosestMatch(txn);

      if (expense && Math.abs(diff) < 0.01) {
        return { transaction: txn, status: 'matched' as const, matchedExpense: expense, difference: 0 };
      }

      if (expense && diff > 0 && diff <= expense.amount * 0.3) {
        // Likely tip added (up to 30% of original)
        return { transaction: txn, status: 'tip_difference' as const, matchedExpense: expense, difference: diff };
      }

      if (expense && Math.abs(diff) <= 2) {
        // Within $2 rounding tolerance
        return { transaction: txn, status: 'matched' as const, matchedExpense: expense, difference: diff };
      }

      return { transaction: txn, status: 'unmatched' as const, matchedExpense: expense || undefined, difference: expense ? diff : undefined };
    });
  };

  const handleUpload = async (file: File) => {
    setIsScanning(true);
    setResults(null);

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

      if (data?.success && data.transactions) {
        const matchResults = reconcile(data.transactions);
        setResults(matchResults);

        const matched = matchResults.filter(r => r.status === 'matched').length;
        const tips = matchResults.filter(r => r.status === 'tip_difference').length;
        const unmatched = matchResults.filter(r => r.status === 'unmatched').length;

        toast.success(`Found ${data.transactions.length} transactions: ${matched} matched, ${tips} with tips, ${unmatched} unmatched`);
      }
    } catch (err) {
      console.error('Statement scan error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to process statement');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const mapCategoryHint = (hint: string): ExpenseCategory => {
    const map: Record<string, ExpenseCategory> = {
      fuel: 'fuel', restaurant: 'other', grocery: 'other',
      insurance: 'insurance', repairs: 'repairs', subscription: 'other', other: 'other'
    };
    return map[hint] || 'other';
  };

  const handleAddFromStatement = async (txn: StatementTransaction) => {
    if (!onAddExpense) return;
    await onAddExpense({
      date: txn.date,
      vendor_name: txn.description,
      amount: txn.amount,
      category: mapCategoryHint(txn.category_hint),
      notes: `Added from statement reconciliation`,
      receipt_url: null,
    });
    toast.success(`Added ${txn.description} as expense`);
  };

  const statusIcon = (status: MatchResult['status']) => {
    switch (status) {
      case 'matched': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'tip_difference': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unmatched': return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const statusLabel = (r: MatchResult) => {
    switch (r.status) {
      case 'matched': return <Badge variant="secondary" className="bg-green-500/20 text-green-400">Matched</Badge>;
      case 'tip_difference': return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Tip +${r.difference?.toFixed(2)}</Badge>;
      case 'unmatched': return <Badge variant="destructive">Unmatched</Badge>;
    }
  };

  const matchedCount = results?.filter(r => r.status === 'matched').length || 0;
  const tipCount = results?.filter(r => r.status === 'tip_difference').length || 0;
  const unmatchedCount = results?.filter(r => r.status === 'unmatched').length || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          Reconcile Statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credit Card Statement Reconciliation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Upload your credit card statement (PDF) to cross-reference with your recorded expenses.
              Restaurant tips and small differences will be flagged.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="w-full gap-2"
              variant="outline"
            >
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isScanning ? 'Analyzing statement...' : 'Upload Statement PDF'}
            </Button>
          </div>

          {/* Summary */}
          {results && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-green-500/20 text-green-400">
                ✓ {matchedCount} matched
              </Badge>
              {tipCount > 0 && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
                  ⚠ {tipCount} with tips
                </Badge>
              )}
              {unmatchedCount > 0 && (
                <Badge variant="destructive">
                  ✕ {unmatchedCount} unmatched
                </Badge>
              )}
            </div>
          )}

          {/* Results list */}
          {results && results.map((r, idx) => (
            <Collapsible key={idx} open={expandedIdx === idx} onOpenChange={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
              <Card className="p-3">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center gap-3 w-full">
                    {statusIcon(r.status)}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{r.transaction.description}</p>
                      <p className="text-xs text-muted-foreground">{r.transaction.date}</p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="text-sm font-semibold">${r.transaction.amount.toFixed(2)}</p>
                        {statusLabel(r)}
                      </div>
                      {expandedIdx === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {r.matchedExpense ? (
                      <div className="bg-muted/50 p-2 rounded text-sm space-y-1">
                        <p className="text-muted-foreground text-xs uppercase tracking-wide">Closest Match</p>
                        <p><strong>{r.matchedExpense.vendor_name}</strong></p>
                        <p>{r.matchedExpense.date} · ${r.matchedExpense.amount.toFixed(2)} · {EXPENSE_CATEGORY_ICONS[r.matchedExpense.category]} {EXPENSE_CATEGORY_LABELS[r.matchedExpense.category]}</p>
                        {r.status === 'tip_difference' && r.difference && (
                          <p className="text-yellow-400 text-xs">
                            💡 Statement is ${r.difference.toFixed(2)} more — likely a tip was added
                          </p>
                        )}
                        {r.status === 'unmatched' && r.difference !== undefined && (
                          <p className="text-red-400 text-xs">
                            Difference: ${Math.abs(r.difference).toFixed(2)} {r.difference > 0 ? 'more' : 'less'} than recorded
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No matching expense found in your records.</p>
                    )}
                    {r.status === 'unmatched' && onAddExpense && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => handleAddFromStatement(r.transaction)}
                      >
                        Add as New Expense
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
