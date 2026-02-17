import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Receipt, AlertTriangle, FileText, Merge, Plus, Loader2, Zap, Image as ImageIcon } from 'lucide-react';
import { Expense } from '@/hooks/useExpensesDB';
import { useSecureStorage } from '@/hooks/useSecureStorage';
import { ExpenseCategory } from '@/types';
import { toast } from 'sonner';
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
  isExactMatch: boolean;
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
  const dates = transactions.map(t => new Date(t.date).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 3);

  // Exclude statement-sourced expenses — they ARE the statement transactions
  const candidateExpenses = expenses.filter(e => {
    const isFromStatement = e.notes?.toLowerCase().includes('from statement') ||
                            e.notes?.toLowerCase().includes('statement verified') ||
                            e.notes?.toLowerCase().includes('statement —');
    if (isFromStatement) return false;

    const expDate = new Date(e.date).getTime();
    const inRange = expDate >= minDate.getTime() && expDate <= maxDate.getTime();
    if (cardLast4) {
      return inRange && (!e.card_last4 || e.card_last4 === cardLast4);
    }
    return inRange;
  });

  const matchedExpenseIds = new Set<string>();
  const items: ReconciliationItem[] = [];
  let idCounter = 0;

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

      let score = 10 - daysDiff;
      if (Math.abs(txn.amount - exp.amount) < 0.50) score += 15;
      else if (Math.abs(txn.amount - exp.amount) < txn.amount * 0.5) score += 5;
      if (exp.receipt_url) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = exp;
      }
    }

    if (bestMatch) {
      matchedExpenseIds.add(bestMatch.id);
      const diff = txn.amount - bestMatch.amount;
      items.push({
        id: `match-${idCounter++}`,
        type: 'matched',
        statementTxn: txn,
        receiptExpense: bestMatch,
        amountDiff: diff,
        isExactMatch: Math.abs(diff) < 0.01,
      });
    } else {
      items.push({
        id: `norec-${idCounter++}`,
        type: 'no_receipt',
        statementTxn: txn,
        receiptExpense: null,
        amountDiff: 0,
        isExactMatch: false,
      });
    }
  }

  for (const exp of candidateExpenses) {
    if (matchedExpenseIds.has(exp.id)) continue;
    items.push({
      id: `missing-${idCounter++}`,
      type: 'missing_from_statement',
      statementTxn: null,
      receiptExpense: exp,
      amountDiff: 0,
      isExactMatch: false,
    });
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
  const [autoMergeStatus, setAutoMergeStatus] = useState<'pending' | 'running' | 'done'>('pending');
  const autoMergeRan = useRef(false);

  useEffect(() => {
    const result = buildReconciliation(transactions, expenses, cardLast4);
    setItems(result);
    autoMergeRan.current = false;
    setAutoMergeStatus('pending');
  }, [transactions, expenses, cardLast4]);

  // Load receipt signed URLs
  useEffect(() => {
    const loadUrls = async () => {
      for (const item of items) {
        const exp = item.receiptExpense;
        if (exp?.receipt_url && !receiptUrls[exp.id]) {
          const url = await getSignedUrl('receipts', exp.receipt_url);
          if (url) setReceiptUrls(prev => ({ ...prev, [exp.id]: url }));
        }
      }
    };
    loadUrls();
  }, [items, getSignedUrl]);

  // Auto-merge exact matches on first load
  useEffect(() => {
    if (autoMergeRan.current || items.length === 0 || autoMergeStatus !== 'pending') return;
    const exactMatches = items.filter(i => i.type === 'matched' && i.isExactMatch);
    if (exactMatches.length === 0) {
      setAutoMergeStatus('done');
      return;
    }

    autoMergeRan.current = true;
    setAutoMergeStatus('running');

    const runAutoMerge = async () => {
      let merged = 0;
      for (const item of exactMatches) {
        if (!item.statementTxn || !item.receiptExpense) continue;
        setProcessing(prev => new Set(prev).add(item.id));
        try {
          await onMerge(item.statementTxn, item.receiptExpense);
          setResolved(prev => new Set(prev).add(item.id));
          merged++;
        } catch (e) {
          console.error('Auto-merge failed:', e);
        }
        setProcessing(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      }
      setAutoMergeStatus('done');
      if (merged > 0) {
        toast.success(`✓ Auto-merged ${merged} exact match${merged > 1 ? 'es' : ''}`);
      }
    };

    runAutoMerge();
  }, [items, autoMergeStatus, onMerge]);

  const handleMerge = async (item: ReconciliationItem) => {
    if (!item.statementTxn || !item.receiptExpense) return;
    setProcessing(prev => new Set(prev).add(item.id));
    await onMerge(item.statementTxn, item.receiptExpense);
    setProcessing(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    setResolved(prev => new Set(prev).add(item.id));
  };

  const handleAddNoReceipt = async (item: ReconciliationItem) => {
    if (!item.statementTxn) return;
    setProcessing(prev => new Set(prev).add(item.id));
    await onMarkNoReceipt(item.statementTxn);
    setProcessing(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    setResolved(prev => new Set(prev).add(item.id));
  };

  const handleConfirmAllNoReceipt = async () => {
    setIsAddingAll(true);
    for (const item of items.filter(i => i.type === 'no_receipt' && !resolved.has(i.id))) {
      if (item.statementTxn) {
        setProcessing(prev => new Set(prev).add(item.id));
        await onMarkNoReceipt(item.statementTxn);
        setProcessing(prev => { const n = new Set(prev); n.delete(item.id); return n; });
        setResolved(prev => new Set(prev).add(item.id));
      }
    }
    setIsAddingAll(false);
    toast.success('All confirmed');
  };

  const matchedItems = items.filter(i => i.type === 'matched');
  const exactMatches = matchedItems.filter(i => i.isExactMatch);
  const diffMatches = matchedItems.filter(i => !i.isExactMatch);
  const noReceiptItems = items.filter(i => i.type === 'no_receipt');
  const missingItems = items.filter(i => i.type === 'missing_from_statement');
  const unresolvedCount = items.filter(i => !resolved.has(i.id)).length;
  const allResolved = unresolvedCount === 0;

  return (
    <>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        {/* Summary */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">{transactions.length} transactions</span>
            {cardLast4 && <Badge variant="secondary" className="text-[10px] font-mono">****{cardLast4}</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
            {matchedItems.length > 0 && (
              <span className="flex items-center gap-1">
                <Receipt className="w-3 h-3 text-green-500" /> {matchedItems.length} with receipt
              </span>
            )}
            {noReceiptItems.length > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-yellow-500" /> {noReceiptItems.length} no receipt
              </span>
            )}
            {missingItems.length > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-destructive" /> {missingItems.length} receipt only
              </span>
            )}
          </div>

          {/* Auto-merge status */}
          {autoMergeStatus === 'running' && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Auto-merging {exactMatches.length} exact matches...
            </div>
          )}
          {autoMergeStatus === 'done' && exactMatches.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <Check className="w-3 h-3" />
              {exactMatches.length} exact match{exactMatches.length > 1 ? 'es' : ''} auto-merged
            </div>
          )}
        </div>

        {/* SECTION 1: Matched with amount differences — NEED ATTENTION */}
        {diffMatches.length > 0 && (
          <Section
            icon={<AlertTriangle className="w-3 h-3 text-yellow-500" />}
            title={`Amount Differences (${diffMatches.length})`}
            subtitle="Statement matched a receipt but amounts differ — likely tips or adjustments"
          >
            {diffMatches.map(item => (
              <MatchedCard
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                isResolved={resolved.has(item.id)}
                receiptUrl={item.receiptExpense ? receiptUrls[item.receiptExpense.id] : undefined}
                onMerge={() => handleMerge(item)}
                onResolve={() => setResolved(prev => new Set(prev).add(item.id))}
                onViewReceipt={setFullscreenImage}
              />
            ))}
          </Section>
        )}

        {/* SECTION 2: Exact matches — auto-merged */}
        {exactMatches.length > 0 && (
          <Section
            icon={<Check className="w-3 h-3 text-green-500" />}
            title={`Exact Matches (${exactMatches.length})`}
            subtitle="Same vendor, date, and amount — auto-merged"
          >
            {exactMatches.map(item => (
              <MatchedCard
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                isResolved={resolved.has(item.id)}
                receiptUrl={item.receiptExpense ? receiptUrls[item.receiptExpense.id] : undefined}
                onMerge={() => handleMerge(item)}
                onResolve={() => setResolved(prev => new Set(prev).add(item.id))}
                onViewReceipt={setFullscreenImage}
              />
            ))}
          </Section>
        )}

        {/* SECTION 3: No receipt */}
        {noReceiptItems.length > 0 && (
          <Section
            icon={<AlertTriangle className="w-3 h-3 text-yellow-500" />}
            title={`No Receipt (${noReceiptItems.length})`}
            subtitle="Statement transactions with no matching receipt"
            action={
              noReceiptItems.filter(i => !resolved.has(i.id)).length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-6 gap-1"
                  disabled={isAddingAll}
                  onClick={handleConfirmAllNoReceipt}
                >
                  {isAddingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Confirm All
                </Button>
              ) : undefined
            }
          >
            {noReceiptItems.map(item => (
              <NoReceiptCard
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                isResolved={resolved.has(item.id)}
                onConfirm={() => handleAddNoReceipt(item)}
              />
            ))}
          </Section>
        )}

        {/* SECTION 4: Receipt only — not on statement */}
        {missingItems.length > 0 && (
          <Section
            icon={<Receipt className="w-3 h-3 text-destructive" />}
            title={`Receipt Only (${missingItems.length})`}
            subtitle="Receipts recorded for this period but not on the statement — could be a different card"
          >
            {missingItems.map(item => (
              <MissingCard
                key={item.id}
                item={item}
                receiptUrl={item.receiptExpense ? receiptUrls[item.receiptExpense.id] : undefined}
                isResolved={resolved.has(item.id)}
                onResolve={() => setResolved(prev => new Set(prev).add(item.id))}
                onViewReceipt={setFullscreenImage}
              />
            ))}
          </Section>
        )}

        {/* Done */}
        <Button onClick={onDone} className="w-full" size="lg" variant={allResolved ? 'default' : 'outline'}>
          {allResolved ? (
            <><Check className="w-4 h-4 mr-2" /> Done — All Reconciled</>
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

// --- Layout helpers ---

function Section({ icon, title, subtitle, action, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          {icon} {title}
        </h4>
        {action}
      </div>
      <p className="text-[10px] text-muted-foreground -mt-1">{subtitle}</p>
      {children}
    </div>
  );
}

// --- Card components ---

function MatchedCard({ item, isProcessing, isResolved, receiptUrl, onMerge, onResolve, onViewReceipt }: {
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
  const hasReceipt = !!exp.receipt_url;

  return (
    <Card className={`p-3 space-y-2 ${isResolved ? 'opacity-40 pointer-events-none' : ''} ${hasDiff ? 'border-yellow-500/30' : 'border-green-500/30'}`}>
      {/* Side-by-side */}
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-start">
        {/* Statement */}
        <div className="min-w-0">
          <Badge variant="secondary" className="text-[9px] mb-1 bg-muted">Statement</Badge>
          <p className="text-xs font-semibold truncate">{txn.description}</p>
          <p className="text-[10px] text-muted-foreground">{txn.date}</p>
          <p className="text-sm font-bold">${txn.amount.toFixed(2)}</p>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center pt-5">
          {isResolved ? (
            <Badge variant="secondary" className="text-[9px] bg-green-500/20 text-green-600">
              <Check className="w-2.5 h-2.5 mr-0.5" />Merged
            </Badge>
          ) : isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : hasDiff ? (
            <Badge variant="secondary" className="text-[9px] bg-yellow-500/20 text-yellow-600">
              {item.amountDiff > 0 ? '+' : ''}{item.amountDiff.toFixed(2)}
            </Badge>
          ) : (
            <Check className="w-5 h-5 text-green-500" />
          )}
        </div>

        {/* Receipt */}
        <div className="min-w-0 text-right">
          <Badge variant="secondary" className="text-[9px] mb-1 bg-primary/10 text-primary">
            {hasReceipt ? '📎 Receipt' : 'Existing'}
          </Badge>
          <p className="text-xs font-semibold truncate">{exp.vendor_name}</p>
          <p className="text-[10px] text-muted-foreground">{exp.date}</p>
          <p className="text-sm font-bold">${exp.amount.toFixed(2)}</p>
        </div>
      </div>

      {/* Receipt image preview */}
      {hasReceipt && receiptUrl && (
        <div
          className="cursor-pointer rounded-md overflow-hidden border border-border"
          onClick={() => onViewReceipt(receiptUrl)}
        >
          <img
            src={receiptUrl}
            alt={`Receipt: ${exp.vendor_name}`}
            className="w-full h-24 object-cover"
          />
          <p className="text-[9px] text-center text-muted-foreground py-0.5">Tap to view full receipt</p>
        </div>
      )}
      {hasReceipt && !receiptUrl && (
        <div className="flex items-center justify-center h-16 rounded-md border border-dashed border-border bg-muted/30">
          <ImageIcon className="w-5 h-5 text-muted-foreground animate-pulse" />
        </div>
      )}

      {/* Tip / amount diff callout */}
      {hasDiff && !isResolved && (
        <div className="bg-yellow-500/10 rounded px-2 py-1 text-[10px] text-yellow-600">
          ${Math.abs(item.amountDiff).toFixed(2)} {item.amountDiff > 0 ? 'more on statement (tip?)' : 'less on statement'}
        </div>
      )}

      {/* Actions for diffs only — exact matches are auto-merged */}
      {hasDiff && !isResolved && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs h-7 gap-1" onClick={onMerge} disabled={isProcessing}>
            <Merge className="w-3 h-3" /> Merge ${txn.amount.toFixed(2)}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs h-7 gap-1" onClick={onResolve}>
            <Check className="w-3 h-3" /> Keep Both
          </Button>
        </div>
      )}
    </Card>
  );
}

function NoReceiptCard({ item, isProcessing, isResolved, onConfirm }: {
  item: ReconciliationItem;
  isProcessing: boolean;
  isResolved: boolean;
  onConfirm: () => void;
}) {
  if (!item.statementTxn) return null;
  const txn = item.statementTxn;

  return (
    <Card className={`p-2.5 ${isResolved ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{txn.description}</p>
          <p className="text-xs text-muted-foreground">
            {txn.date} · <span className="font-semibold text-foreground">${txn.amount.toFixed(2)}</span>
          </p>
        </div>
        {!isResolved ? (
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 shrink-0" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            No receipt
          </Button>
        ) : (
          <Badge variant="secondary" className="text-[10px]">✓</Badge>
        )}
      </div>
    </Card>
  );
}

function MissingCard({ item, receiptUrl, isResolved, onResolve, onViewReceipt }: {
  item: ReconciliationItem;
  receiptUrl?: string;
  isResolved: boolean;
  onResolve: () => void;
  onViewReceipt: (url: string) => void;
}) {
  if (!item.receiptExpense) return null;
  const exp = item.receiptExpense;

  return (
    <Card className={`p-2.5 border-destructive/20 ${isResolved ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-3">
        {receiptUrl && (
          <div
            className="w-10 h-10 rounded overflow-hidden border border-border shrink-0 cursor-pointer"
            onClick={() => onViewReceipt(receiptUrl)}
          >
            <img src={receiptUrl} alt={exp.vendor_name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{exp.vendor_name}</p>
          <p className="text-xs text-muted-foreground">
            {exp.date} · <span className="font-semibold text-foreground">${exp.amount.toFixed(2)}</span>
          </p>
        </div>
        {!isResolved && (
          <Button size="sm" variant="ghost" className="text-xs h-7 shrink-0" onClick={onResolve}>
            <Check className="w-3 h-3" />
          </Button>
        )}
      </div>
    </Card>
  );
}
