import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, FileText, Plus, Receipt, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { Expense } from '@/hooks/useExpensesDB';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  receiptMatch?: Expense; // Cross-reference: receipt on same date + vendor
  added?: boolean; // Track if already added
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
  const [selectedForAdd, setSelectedForAdd] = useState<Set<number>>(new Set());
  const [isAddingAll, setIsAddingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Find expenses that have receipts (receipt_url != null)
  const expensesWithReceipts = expenses.filter(e => e.receipt_url);

  const findClosestMatch = (txn: StatementTransaction): { expense: Expense | null; diff: number } => {
    let bestMatch: Expense | null = null;
    let bestScore = Infinity;

    for (const exp of expenses) {
      const txnDate = new Date(txn.date);
      const expDate = new Date(exp.date);
      const daysDiff = Math.abs(txnDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 3) continue;

      const txnName = txn.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const expName = exp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = txnName.includes(expName) || expName.includes(txnName) ||
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

  // Smart receipt cross-reference: find receipt-backed expense on same date + similar vendor
  const findReceiptMatch = (txn: StatementTransaction): Expense | undefined => {
    for (const exp of expensesWithReceipts) {
      const txnDate = new Date(txn.date);
      const expDate = new Date(exp.date);
      const daysDiff = Math.abs(txnDate.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 1) continue;

      const txnName = txn.description.toLowerCase().replace(/[^a-z0-9]/g, '');
      const expName = exp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (txnName.includes(expName) || expName.includes(txnName)) {
        return exp;
      }
      
      // Check first 4+ char overlap
      if (txnName.length >= 4 && expName.length >= 4) {
        const txnPrefix = txnName.substring(0, Math.min(6, txnName.length));
        const expPrefix = expName.substring(0, Math.min(6, expName.length));
        if (txnPrefix === expPrefix) return exp;
      }
    }
    return undefined;
  };

  const reconcile = (transactions: StatementTransaction[]): MatchResult[] => {
    return transactions.map(txn => {
      const { expense, diff } = findClosestMatch(txn);
      const receiptMatch = findReceiptMatch(txn);

      if (expense && Math.abs(diff) < 0.01) {
        return { transaction: txn, status: 'matched' as const, matchedExpense: expense, difference: 0, receiptMatch };
      }

      if (expense && diff > 0 && diff <= expense.amount * 0.3) {
        return { transaction: txn, status: 'tip_difference' as const, matchedExpense: expense, difference: diff, receiptMatch };
      }

      if (expense && Math.abs(diff) <= 2) {
        return { transaction: txn, status: 'matched' as const, matchedExpense: expense, difference: diff, receiptMatch };
      }

      return { transaction: txn, status: 'unmatched' as const, matchedExpense: expense || undefined, difference: expense ? diff : undefined, receiptMatch };
    });
  };

  const handleUpload = async (file: File) => {
    setIsScanning(true);
    setResults(null);
    setSelectedForAdd(new Set());

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

        // Auto-select all unmatched for bulk add
        const unmatchedIndices = new Set<number>();
        matchResults.forEach((r, i) => {
          if (r.status === 'unmatched') unmatchedIndices.add(i);
        });
        setSelectedForAdd(unmatchedIndices);

        const matched = matchResults.filter(r => r.status === 'matched').length;
        const tips = matchResults.filter(r => r.status === 'tip_difference').length;
        const unmatched = matchResults.filter(r => r.status === 'unmatched').length;
        const receiptLinked = matchResults.filter(r => r.receiptMatch).length;

        toast.success(`Found ${data.transactions.length} transactions: ${matched} matched, ${tips} with tips, ${unmatched} new${receiptLinked > 0 ? `, ${receiptLinked} receipt-linked` : ''}`);
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

  const handleAddFromStatement = async (txn: StatementTransaction, idx: number) => {
    if (!onAddExpense) return;
    await onAddExpense({
      date: txn.date,
      vendor_name: txn.description,
      amount: txn.amount,
      category: mapCategoryHint(txn.category_hint),
      notes: `Added from statement reconciliation`,
      receipt_url: null,
    });
    // Mark as added
    setResults(prev => prev?.map((r, i) => i === idx ? { ...r, added: true } : r) || null);
    setSelectedForAdd(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
    toast.success(`Added ${txn.description}`);
  };

  const handleAddAllSelected = async () => {
    if (!onAddExpense || !results) return;
    setIsAddingAll(true);
    
    let addedCount = 0;
    for (const idx of Array.from(selectedForAdd).sort()) {
      const r = results[idx];
      if (r.added) continue;
      try {
        await onAddExpense({
          date: r.transaction.date,
          vendor_name: r.transaction.description,
          amount: r.transaction.amount,
          category: mapCategoryHint(r.transaction.category_hint),
          notes: `Added from statement reconciliation`,
          receipt_url: null,
        });
        addedCount++;
      } catch (e) {
        console.error(`Failed to add ${r.transaction.description}:`, e);
      }
    }

    // Mark all selected as added
    setResults(prev => prev?.map((r, i) => selectedForAdd.has(i) ? { ...r, added: true } : r) || null);
    setSelectedForAdd(new Set());
    setIsAddingAll(false);
    toast.success(`Added ${addedCount} transactions as expenses`);
  };

  const toggleSelection = (idx: number) => {
    setSelectedForAdd(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const statusIcon = (status: MatchResult['status']) => {
    switch (status) {
      case 'matched': return <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />;
      case 'tip_difference': return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />;
      case 'unmatched': return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    }
  };

  const statusLabel = (r: MatchResult) => {
    if (r.added) return <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-[10px]">✓ Added</Badge>;
    switch (r.status) {
      case 'matched': return <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-[10px]">Matched</Badge>;
      case 'tip_difference': return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400 text-[10px]">Tip +${r.difference?.toFixed(2)}</Badge>;
      case 'unmatched': return <Badge variant="destructive" className="text-[10px]">New</Badge>;
    }
  };

  const matchedCount = results?.filter(r => r.status === 'matched').length || 0;
  const tipCount = results?.filter(r => r.status === 'tip_difference').length || 0;
  const unmatchedCount = results?.filter(r => r.status === 'unmatched' && !r.added).length || 0;
  const addableCount = selectedForAdd.size;

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

        <div className="space-y-3">
          {/* Upload area */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Upload your statement to cross-reference with expenses. Matching receipts are auto-linked.
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

          {/* Summary + Bulk Add */}
          {results && (
            <div className="space-y-2">
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
                    ✕ {unmatchedCount} new
                  </Badge>
                )}
              </div>

              {/* Bulk add button */}
              {addableCount > 0 && onAddExpense && (
                <Button
                  onClick={handleAddAllSelected}
                  disabled={isAddingAll}
                  size="sm"
                  className="w-full gap-2"
                >
                  {isAddingAll ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isAddingAll ? 'Adding...' : `Add ${addableCount} Selected as Expenses`}
                </Button>
              )}
            </div>
          )}

          {/* Results list */}
          <TooltipProvider>
            {results && results.map((r, idx) => (
              <Collapsible key={idx} open={expandedIdx === idx} onOpenChange={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                <Card className={`p-3 ${r.added ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2">
                    {/* Checkbox for unmatched/addable items */}
                    {r.status === 'unmatched' && !r.added && onAddExpense && (
                      <Checkbox
                        checked={selectedForAdd.has(idx)}
                        onCheckedChange={() => toggleSelection(idx)}
                        className="shrink-0"
                      />
                    )}

                    <CollapsibleTrigger className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 w-full">
                        {statusIcon(r.status)}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{r.transaction.description}</p>
                            {/* Receipt cross-reference indicator */}
                            {r.receiptMatch && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-medium">
                                    <Receipt className="w-3 h-3" />
                                    <Link2 className="w-3 h-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[220px]">
                                  <p className="text-xs font-medium">📎 Receipt Match Found</p>
                                  <p className="text-xs text-muted-foreground">
                                    {r.receiptMatch.vendor_name} · ${r.receiptMatch.amount.toFixed(2)} on {r.receiptMatch.date}
                                  </p>
                                  {Math.abs(r.transaction.amount - r.receiptMatch.amount) > 0.01 && (
                                    <p className="text-xs text-yellow-400 mt-0.5">
                                      Δ ${Math.abs(r.transaction.amount - r.receiptMatch.amount).toFixed(2)} difference
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{r.transaction.date}</p>
                        </div>
                        <div className="text-right flex items-center gap-2 shrink-0">
                          <div>
                            <p className="text-sm font-semibold">${r.transaction.amount.toFixed(2)}</p>
                            {statusLabel(r)}
                          </div>
                          {expandedIdx === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent>
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      {/* Receipt cross-reference detail */}
                      {r.receiptMatch && (
                        <div className="bg-primary/5 border border-primary/20 p-2 rounded text-sm space-y-1">
                          <p className="text-primary text-xs font-semibold flex items-center gap-1">
                            <Receipt className="w-3.5 h-3.5" /> Receipt on File
                          </p>
                          <p className="text-foreground"><strong>{r.receiptMatch.vendor_name}</strong></p>
                          <p className="text-muted-foreground text-xs">
                            {r.receiptMatch.date} · ${r.receiptMatch.amount.toFixed(2)} · {EXPENSE_CATEGORY_ICONS[r.receiptMatch.category]} {EXPENSE_CATEGORY_LABELS[r.receiptMatch.category]}
                          </p>
                          {Math.abs(r.transaction.amount - r.receiptMatch.amount) > 0.01 && (
                            <p className="text-yellow-500 text-xs">
                              💡 Statement ${r.transaction.amount > r.receiptMatch.amount ? 'is' : 'was'} ${Math.abs(r.transaction.amount - r.receiptMatch.amount).toFixed(2)} {r.transaction.amount > r.receiptMatch.amount ? 'more' : 'less'} — {r.transaction.amount > r.receiptMatch.amount ? 'tip likely added' : 'partial refund?'}
                            </p>
                          )}
                          {Math.abs(r.transaction.amount - r.receiptMatch.amount) <= 0.01 && (
                            <p className="text-green-500 text-xs">✓ Exact match with receipt</p>
                          )}
                        </div>
                      )}

                      {/* Existing expense match */}
                      {r.matchedExpense && r.matchedExpense !== r.receiptMatch && (
                        <div className="bg-muted/50 p-2 rounded text-sm space-y-1">
                          <p className="text-muted-foreground text-xs uppercase tracking-wide">Closest Expense Match</p>
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
                      )}

                      {!r.matchedExpense && !r.receiptMatch && (
                        <p className="text-sm text-muted-foreground">No matching expense or receipt found in your records.</p>
                      )}

                      {/* Individual add button */}
                      {r.status === 'unmatched' && !r.added && onAddExpense && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => handleAddFromStatement(r.transaction, idx)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add as New Expense
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </TooltipProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
