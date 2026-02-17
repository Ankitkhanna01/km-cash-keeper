import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Receipt, AlertTriangle, FileText, Merge, Plus, Loader2, ImageIcon, X } from 'lucide-react';
import { Expense } from '@/hooks/useExpensesDB';
import { useSecureStorage } from '@/hooks/useSecureStorage';
import { ExpenseCategory } from '@/types';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

interface StatementTransaction {
  date: string;
  description: string;
  amount: number;
  category_hint: string;
}

export interface ReconciliationItem {
  id: string;
  type: 'matched' | 'no_receipt' | 'missing_from_statement';
  statementTxn: StatementTransaction | null;
  receiptExpense: Expense | null;
  amountDiff: number;
}

interface ReconciliationMatchViewProps {
  transactions: StatementTransaction[];
  cardLast4: string | null;
  expenses: Expense[];
  onAddExpense: (data: {
    date: string;
    vendor_name: string;
    amount: number;
    category: ExpenseCategory;
    notes: string | null;
    receipt_url: string | null;
    card_last4?: string | null;
  }) => Promise<unknown>;
  onMerge: (statementTxn: StatementTransaction, receiptExpense: Expense) => Promise<void>;
  onMarkNoReceipt: (statementTxn: StatementTransaction) => Promise<unknown>;
  onDone: () => void;
}

function buildReconciliation(
  transactions: StatementTransaction[],
  expenses: Expense[],
  cardLast4: string | null
): ReconciliationItem[] {
  // Get date range from statement
  const dates = transactions.map(t => new Date(t.date).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  // Expand range by 3 days for fuzzy matching
  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 3);

  // Filter existing expenses by card + date range
  const candidateExpenses = expenses.filter(e => {
    const expDate = new Date(e.date).getTime();
    const inRange = expDate >= minDate.getTime() && expDate <= maxDate.getTime();
    // Card matching: if statement has card info, only match same card or no-card expenses
    if (cardLast4) {
      return inRange && (!e.card_last4 || e.card_last4 === cardLast4);
    }
    return inRange;
  });

  const matchedExpenseIds = new Set<string>();
  const items: ReconciliationItem[] = [];
  let idCounter = 0;

  // For each statement transaction, find best matching receipt expense
  for (const txn of transactions) {
    const nameNorm = txn.description.toLowerCase().replace(/[^a-z0-9]/g, '');

    let bestMatch: Expense | null = null;
    let bestScore = 0;

    for (const exp of candidateExpenses) {
      if (matchedExpenseIds.has(exp.id)) continue;

      const expNameNorm = exp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = nameNorm.includes(expNameNorm) || expNameNorm.includes(nameNorm);
      if (!nameMatch) continue;

      const daysDiff = Math.abs(new Date(txn.date).getTime() - new Date(exp.date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 3) continue;

      const amountClose = Math.abs(txn.amount - exp.amount) < txn.amount * 0.5; // within 50%
      
      // Score: closer date + closer amount = better
      let score = 10 - daysDiff;
      if (amountClose) score += 5;
      if (Math.abs(txn.amount - exp.amount) < 0.50) score += 10;
      if (exp.receipt_url) score += 3; // prefer receipt-backed

      if (score > bestScore) {
        bestScore = score;
        bestMatch = exp;
      }
    }

    if (bestMatch) {
      matchedExpenseIds.add(bestMatch.id);
      items.push({
        id: `match-${idCounter++}`,
        type: 'matched',
        statementTxn: txn,
        receiptExpense: bestMatch,
        amountDiff: txn.amount - bestMatch.amount,
      });
    } else {
      items.push({
        id: `norec-${idCounter++}`,
        type: 'no_receipt',
        statementTxn: txn,
        receiptExpense: null,
        amountDiff: 0,
      });
    }
  }

  // Receipts in the period that weren't matched to any statement transaction
  for (const exp of candidateExpenses) {
    if (matchedExpenseIds.has(exp.id)) continue;
    if (exp.receipt_url) {
      items.push({
        id: `missing-${idCounter++}`,
        type: 'missing_from_statement',
        statementTxn: null,
        receiptExpense: exp,
        amountDiff: 0,
      });
    }
  }

  return items;
}

export function ReconciliationMatchView({
  transactions,
  cardLast4,
  expenses,
  onAddExpense,
  onMerge,
  onMarkNoReceipt,
  onDone,
}: ReconciliationMatchViewProps) {
  const { getSignedUrl } = useSecureStorage();
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);

  useEffect(() => {
    const result = buildReconciliation(transactions, expenses, cardLast4);
    setItems(result);
  }, [transactions, expenses, cardLast4]);

  // Load receipt signed URLs
  useEffect(() => {
    items.forEach(async (item) => {
      const exp = item.receiptExpense;
      if (exp?.receipt_url && !receiptUrls[exp.id]) {
        const url = await getSignedUrl('receipts', exp.receipt_url);
        if (url) setReceiptUrls(prev => ({ ...prev, [exp.id]: url }));
      }
    });
  }, [items, getSignedUrl]);

  const markProcessing = (id: string, on: boolean) => {
    setProcessing(prev => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const markResolved = (id: string) => {
    setResolved(prev => new Set(prev).add(id));
  };

  const handleMerge = async (item: ReconciliationItem) => {
    if (!item.statementTxn || !item.receiptExpense) return;
    markProcessing(item.id, true);
    await onMerge(item.statementTxn, item.receiptExpense);
    markProcessing(item.id, false);
    markResolved(item.id);
  };

  const handleAddNoReceipt = async (item: ReconciliationItem) => {
    if (!item.statementTxn) return;
    markProcessing(item.id, true);
    await onMarkNoReceipt(item.statementTxn);
    markProcessing(item.id, false);
    markResolved(item.id);
  };

  const handleAddAllUnmatched = async () => {
    setIsAddingAll(true);
    const unmatched = items.filter(i => i.type === 'no_receipt' && !resolved.has(i.id));
    for (const item of unmatched) {
      if (item.statementTxn) {
        markProcessing(item.id, true);
        await onMarkNoReceipt(item.statementTxn);
        markProcessing(item.id, false);
        markResolved(item.id);
      }
    }
    setIsAddingAll(false);
  };

  const matchedItems = items.filter(i => i.type === 'matched');
  const noReceiptItems = items.filter(i => i.type === 'no_receipt');
  const missingItems = items.filter(i => i.type === 'missing_from_statement');
  const allResolved = items.every(i => resolved.has(i.id));
  const unresolvedCount = items.filter(i => !resolved.has(i.id)).length;

  return (
    <>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Summary header */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{transactions.length} statement transactions</span>
            {cardLast4 && <Badge variant="secondary" className="text-[10px] font-mono">****{cardLast4}</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" /> {matchedItems.length} matched
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" /> {noReceiptItems.length} no receipt
            </span>
            {missingItems.length > 0 && (
              <span className="flex items-center gap-1">
                <Receipt className="w-3 h-3 text-destructive" /> {missingItems.length} receipt only
              </span>
            )}
          </div>
        </div>

        {/* Matched transactions */}
        {matchedItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" /> Matched ({matchedItems.length})
            </h4>
            {matchedItems.map(item => (
              <MatchedRow
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                isResolved={resolved.has(item.id)}
                receiptUrl={item.receiptExpense ? receiptUrls[item.receiptExpense.id] : undefined}
                onMerge={() => handleMerge(item)}
                onResolve={() => markResolved(item.id)}
                onViewReceipt={(url) => setFullscreenImage(url)}
              />
            ))}
          </div>
        )}

        {/* No receipt transactions */}
        {noReceiptItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-yellow-500" /> No Receipt ({noReceiptItems.length})
              </h4>
              {noReceiptItems.filter(i => !resolved.has(i.id)).length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-6 gap-1"
                  disabled={isAddingAll}
                  onClick={handleAddAllUnmatched}
                >
                  {isAddingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add All
                </Button>
              )}
            </div>
            {noReceiptItems.map(item => (
              <NoReceiptRow
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                isResolved={resolved.has(item.id)}
                onAdd={() => handleAddNoReceipt(item)}
              />
            ))}
          </div>
        )}

        {/* Missing from statement (receipt exists but no statement match) */}
        {missingItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Receipt className="w-3 h-3 text-destructive" /> Receipt Only — Not on Statement ({missingItems.length})
            </h4>
            <p className="text-[10px] text-muted-foreground">
              These receipts were recorded for this card/period but don't appear on the statement.
            </p>
            {missingItems.map(item => (
              <MissingRow
                key={item.id}
                item={item}
                receiptUrl={item.receiptExpense ? receiptUrls[item.receiptExpense.id] : undefined}
                isResolved={resolved.has(item.id)}
                onResolve={() => markResolved(item.id)}
                onViewReceipt={(url) => setFullscreenImage(url)}
              />
            ))}
          </div>
        )}

        {/* Done button */}
        <Button onClick={onDone} className="w-full" size="lg" variant={allResolved ? 'default' : 'outline'}>
          {allResolved ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Done — All Reconciled
            </>
          ) : (
            `Close (${unresolvedCount} unresolved)`
          )}
        </Button>
      </div>

      {/* Fullscreen receipt */}
      <Dialog open={!!fullscreenImage} onOpenChange={() => setFullscreenImage(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-1 bg-black/90">
          {fullscreenImage && (
            <img src={fullscreenImage} alt="Receipt" className="w-full h-full object-contain max-h-[90vh]" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Sub-components ---

function MatchedRow({ item, isProcessing, isResolved, receiptUrl, onMerge, onResolve, onViewReceipt }: {
  item: ReconciliationItem;
  isProcessing: boolean;
  isResolved: boolean;
  receiptUrl?: string;
  onMerge: () => void;
  onResolve: () => void;
  onViewReceipt: (url: string) => void;
}) {
  if (!item.statementTxn || !item.receiptExpense) return null;
  const txn = item.statementTxn;
  const exp = item.receiptExpense;
  const hasDiff = Math.abs(item.amountDiff) > 0.01;

  return (
    <Card className={`p-3 space-y-2 ${isResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Statement side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">Statement</span>
          </div>
          <p className="text-sm font-medium truncate">{txn.description}</p>
          <p className="text-xs text-muted-foreground">{txn.date}</p>
          <p className="text-sm font-bold">${txn.amount.toFixed(2)}</p>
        </div>

        <div className="flex flex-col items-center justify-center shrink-0 pt-3">
          {hasDiff ? (
            <span className="text-[10px] text-yellow-500 font-medium">
              {item.amountDiff > 0 ? '+' : ''}{item.amountDiff.toFixed(2)}
            </span>
          ) : (
            <Check className="w-4 h-4 text-green-500" />
          )}
        </div>

        {/* Receipt side */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-1 mb-0.5 justify-end">
            <span className="text-[10px] text-muted-foreground">Receipt</span>
            <Receipt className="w-3 h-3 text-primary shrink-0" />
          </div>
          <p className="text-sm font-medium truncate">{exp.vendor_name}</p>
          <p className="text-xs text-muted-foreground">{exp.date}</p>
          <p className="text-sm font-bold">${exp.amount.toFixed(2)}</p>
          {receiptUrl && (
            <button
              className="text-[10px] text-primary underline mt-0.5"
              onClick={() => onViewReceipt(receiptUrl)}
            >
              View receipt
            </button>
          )}
        </div>
      </div>

      {/* Amount diff detail */}
      {hasDiff && (
        <div className="bg-yellow-500/10 rounded px-2 py-1 text-[10px] text-yellow-600">
          ${Math.abs(item.amountDiff).toFixed(2)} {item.amountDiff > 0 ? 'more on statement (tip?)' : 'less on statement'}
        </div>
      )}

      {!isResolved && (
        <div className="flex gap-2 pt-1">
          {hasDiff ? (
            <>
              <Button size="sm" className="flex-1 text-xs h-7 gap-1" onClick={onMerge} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Merge className="w-3 h-3" />}
                Merge (use ${txn.amount.toFixed(2)})
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs h-7 gap-1" onClick={onResolve}>
                <Check className="w-3 h-3" /> Keep Both
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="w-full text-xs h-7 gap-1" onClick={onResolve}>
              <Check className="w-3 h-3" /> Confirmed ✓
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function NoReceiptRow({ item, isProcessing, isResolved, onAdd }: {
  item: ReconciliationItem;
  isProcessing: boolean;
  isResolved: boolean;
  onAdd: () => void;
}) {
  if (!item.statementTxn) return null;
  const txn = item.statementTxn;

  return (
    <Card className={`p-3 ${isResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{txn.description}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{txn.date}</span>
            <span className="font-semibold text-foreground">${txn.amount.toFixed(2)}</span>
          </div>
        </div>
        {!isResolved ? (
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 shrink-0" onClick={onAdd} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add (no receipt)
          </Button>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Added</Badge>
        )}
      </div>
    </Card>
  );
}

function MissingRow({ item, receiptUrl, isResolved, onResolve, onViewReceipt }: {
  item: ReconciliationItem;
  receiptUrl?: string;
  isResolved: boolean;
  onResolve: () => void;
  onViewReceipt: (url: string) => void;
}) {
  if (!item.receiptExpense) return null;
  const exp = item.receiptExpense;

  return (
    <Card className={`p-3 border-destructive/20 ${isResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{exp.vendor_name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{exp.date}</span>
            <span className="font-semibold text-foreground">${exp.amount.toFixed(2)}</span>
            {exp.receipt_url && <Receipt className="w-3 h-3 text-primary" />}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {receiptUrl && (
            <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => onViewReceipt(receiptUrl)}>
              View
            </Button>
          )}
          {!isResolved && (
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={onResolve}>
              <Check className="w-3 h-3" /> OK
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
