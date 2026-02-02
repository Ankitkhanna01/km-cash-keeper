import { Card, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface MonthlyTrendsProps {
  expenses: Expense[];
  year: number;
}

export function MonthlyTrends({ expenses, year }: MonthlyTrendsProps) {
  const monthlyData = useMemo(() => {
    // Initialize all months
    const months: Record<string, { amount: number; count: number }> = {};
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      months[key] = { amount: 0, count: 0 };
    }

    // Fill with data
    expenses.forEach(exp => {
      const key = exp.date.substring(0, 7);
      if (months[key]) {
        months[key].amount += exp.amount;
        months[key].count += 1;
      }
    });

    return Object.entries(months)
      .map(([month, data]) => ({
        month,
        name: format(parseISO(month + '-01'), 'MMM'),
        amount: data.amount,
        count: data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [expenses, year]);

  const stats = useMemo(() => {
    const amounts = monthlyData.map(m => m.amount);
    const nonZeroAmounts = amounts.filter(a => a > 0);
    
    const highest = Math.max(...amounts);
    const lowest = Math.min(...nonZeroAmounts, 0);
    const avg = nonZeroAmounts.length > 0 
      ? nonZeroAmounts.reduce((a, b) => a + b, 0) / nonZeroAmounts.length 
      : 0;

    // Find month with highest
    const highestMonth = monthlyData.find(m => m.amount === highest);
    
    // Calculate trend (comparing last 3 months to previous 3)
    const currentMonth = new Date().getMonth();
    const last3 = monthlyData.slice(Math.max(0, currentMonth - 2), currentMonth + 1);
    const prev3 = monthlyData.slice(Math.max(0, currentMonth - 5), Math.max(0, currentMonth - 2));
    
    const last3Avg = last3.reduce((sum, m) => sum + m.amount, 0) / (last3.length || 1);
    const prev3Avg = prev3.reduce((sum, m) => sum + m.amount, 0) / (prev3.length || 1);
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    let trendPercent = 0;
    if (prev3Avg > 0) {
      trendPercent = ((last3Avg - prev3Avg) / prev3Avg) * 100;
      if (trendPercent > 5) trend = 'up';
      else if (trendPercent < -5) trend = 'down';
    }

    return { highest, lowest, avg, highestMonth, trend, trendPercent };
  }, [monthlyData]);

  const maxAmount = Math.max(...monthlyData.map(m => m.amount), 1);
  const currentMonth = new Date().getMonth();

  return (
    <Card variant="elevated">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Monthly Spending</h3>
          </div>
          <div className="flex items-center gap-1">
            {stats.trend === 'up' && (
              <>
                <TrendingUp className="w-4 h-4 text-destructive" />
                <span className="text-xs text-destructive">+{stats.trendPercent.toFixed(0)}%</span>
              </>
            )}
            {stats.trend === 'down' && (
              <>
                <TrendingDown className="w-4 h-4 text-accent-foreground" />
                <span className="text-xs text-accent-foreground">{stats.trendPercent.toFixed(0)}%</span>
              </>
            )}
            {stats.trend === 'stable' && (
              <>
                <Minus className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Stable</span>
              </>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="h-40 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `$${v}`}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {monthlyData.map((entry, index) => (
                  <Cell 
                    key={entry.month}
                    fill={index === currentMonth 
                      ? 'hsl(var(--primary))' 
                      : 'hsl(var(--primary) / 0.3)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="text-center">
            <p className="text-lg font-bold text-primary">${stats.avg.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Avg/Month</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-warning">${stats.highest.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">
              {stats.highestMonth?.name || 'Highest'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-accent-foreground">
              ${(stats.highest - stats.avg).toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">Peak Diff</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
