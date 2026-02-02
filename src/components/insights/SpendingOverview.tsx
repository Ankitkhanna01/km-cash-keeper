import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Store } from 'lucide-react';
import { useMemo } from 'react';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface SpendingOverviewProps {
  expenses: Expense[];
  year: number;
}

export function SpendingOverview({ expenses, year }: SpendingOverviewProps) {
  const stats = useMemo(() => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const transactionCount = expenses.length;
    const uniqueStores = new Set(expenses.map(e => e.vendor_name.toLowerCase().trim())).size;
    const avgTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

    // Monthly average
    const monthsWithData = new Set(expenses.map(e => e.date.substring(0, 7))).size;
    const monthlyAvg = monthsWithData > 0 ? totalSpent / monthsWithData : 0;

    // Find biggest expense
    const biggestExpense = expenses.reduce(
      (max, e) => (e.amount > max.amount ? e : max),
      { amount: 0, vendor_name: '', date: '' }
    );

    return {
      totalSpent,
      transactionCount,
      uniqueStores,
      avgTransaction,
      monthlyAvg,
      biggestExpense,
    };
  }, [expenses]);

  return (
    <div className="space-y-4">
      {/* Hero stat */}
      <Card variant="elevated" className="bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">Total Spent in {year}</p>
          <p className="text-4xl font-bold text-primary">${stats.totalSpent.toFixed(2)}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Avg ${stats.monthlyAvg.toFixed(0)}/month across {stats.transactionCount} transactions
          </p>
        </CardContent>
      </Card>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card variant="default">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShoppingBag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.transactionCount}</p>
              <p className="text-xs text-muted-foreground">Purchases</p>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Store className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.uniqueStores}</p>
              <p className="text-xs text-muted-foreground">Stores</p>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <DollarSign className="w-5 h-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${stats.avgTransaction.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Avg/Purchase</p>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <TrendingUp className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground truncate max-w-[100px]">
                ${stats.biggestExpense.amount.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground truncate max-w-[100px]">
                {stats.biggestExpense.vendor_name || 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
