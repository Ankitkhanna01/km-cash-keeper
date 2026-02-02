import { Card, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS, ExpenseCategory } from '@/types';
import { PieChart as PieChartIcon } from 'lucide-react';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface CategoryBreakdownProps {
  expenses: Expense[];
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--muted-foreground))',
];

export function CategoryBreakdown({ expenses }: CategoryBreakdownProps) {
  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    
    expenses.forEach(exp => {
      if (!totals[exp.category]) totals[exp.category] = 0;
      totals[exp.category] += exp.amount;
    });

    const total = Object.values(totals).reduce((sum, v) => sum + v, 0);

    return Object.entries(totals)
      .map(([category, amount]) => ({
        category: category as ExpenseCategory,
        name: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory] || category,
        icon: EXPENSE_CATEGORY_ICONS[category as ExpenseCategory] || '📦',
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const total = categoryData.reduce((sum, c) => sum + c.amount, 0);

  if (categoryData.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="p-6 text-center">
          <PieChartIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No category data yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <PieChartIcon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Spending by Category</h3>
        </div>

        <div className="flex gap-4">
          {/* Pie chart */}
          <div className="w-32 h-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={50}
                  paddingAngle={2}
                  dataKey="amount"
                >
                  {categoryData.map((entry, index) => (
                    <Cell 
                      key={entry.category} 
                      fill={COLORS[index % COLORS.length]}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            {categoryData.map((cat, index) => (
              <div key={cat.category} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm truncate max-w-[100px]">{cat.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">${cat.amount.toFixed(0)}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({cat.percentage.toFixed(0)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-lg font-bold text-primary">${total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
