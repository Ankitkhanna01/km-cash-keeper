import { Card, CardContent } from '@/components/ui/card';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import { cn } from '@/lib/utils';

interface CategorySummaryProps {
  totals: Record<ExpenseCategory, number>;
  className?: string;
}

export function CategorySummary({ totals, className }: CategorySummaryProps) {
  const categories = Object.keys(totals) as ExpenseCategory[];
  const total = Object.values(totals).reduce((sum, val) => sum + val, 0);

  return (
    <Card variant="elevated" className={cn('animate-fade-in', className)}>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Expense Breakdown (T2125)
        </h3>
        <div className="space-y-2">
          {categories.map((category) => {
            const amount = totals[category];
            const percentage = total > 0 ? (amount / total) * 100 : 0;

            return (
              <div key={category} className="flex items-center gap-3">
                <span className="text-lg shrink-0">
                  {EXPENSE_CATEGORY_ICONS[category]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground truncate">
                      {EXPENSE_CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-bold text-primary">${total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
