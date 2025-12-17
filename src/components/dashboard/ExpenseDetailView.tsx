import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { StatDetailDialog, FilterTabs, TabsContent } from './StatDetailDialog';
import { parseLocalDate } from '@/lib/dateUtils';
import { Fuel, Wrench, Shield, FileText, CreditCard, MoreHorizontal } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent as TabsContentUI } from '@/components/ui/tabs';

interface Expense {
  id: string;
  date: string;
  amount: number;
  category: string;
  vendor_name: string;
}

interface ExpenseDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenses: Expense[];
  year: number;
  businessPercentage: number;
  isDeductible?: boolean;
}

const categoryIcons: Record<string, any> = {
  fuel: Fuel,
  repairs: Wrench,
  insurance: Shield,
  licence: FileText,
  interest: CreditCard,
  other: MoreHorizontal,
};

const categoryLabels: Record<string, string> = {
  fuel: 'Fuel',
  repairs: 'Repairs & Maintenance',
  insurance: 'Insurance',
  licence: 'Licence & Registration',
  interest: 'Interest/Leasing',
  other: 'Other',
};

export function ExpenseDetailView({ 
  open, 
  onOpenChange, 
  expenses, 
  year, 
  businessPercentage,
  isDeductible = false 
}: ExpenseDetailViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredExpenses = useMemo(() => {
    let result = expenses.filter(e => parseLocalDate(e.date).getFullYear() === year);
    if (categoryFilter !== 'all') {
      result = result.filter(e => e.category === categoryFilter);
    }
    return result;
  }, [expenses, year, categoryFilter]);

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const deductibleAmount = totalAmount * (businessPercentage / 100);

  const categoryData = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredExpenses.forEach(exp => {
      if (!grouped[exp.category]) grouped[exp.category] = 0;
      grouped[exp.category] += exp.amount;
    });
    return Object.entries(grouped)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  const dailyData = useMemo(() => {
    const grouped: Record<string, { amount: number; items: number }> = {};
    filteredExpenses.forEach(exp => {
      const key = exp.date;
      if (!grouped[key]) grouped[key] = { amount: 0, items: 0 };
      grouped[key].amount += exp.amount;
      grouped[key].items += 1;
    });
    return Object.entries(grouped)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredExpenses]);

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { amount: number; items: number }> = {};
    filteredExpenses.forEach(exp => {
      const key = format(parseLocalDate(exp.date), 'yyyy-MM');
      if (!grouped[key]) grouped[key] = { amount: 0, items: 0 };
      grouped[key].amount += exp.amount;
      grouped[key].items += 1;
    });
    return Object.entries(grouped)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredExpenses]);

  const topVendors = useMemo(() => {
    const grouped: Record<string, { amount: number; count: number }> = {};
    filteredExpenses.forEach(exp => {
      const key = exp.vendor_name;
      if (!grouped[key]) grouped[key] = { amount: 0, count: 0 };
      grouped[key].amount += exp.amount;
      grouped[key].count += 1;
    });
    return Object.entries(grouped)
      .map(([vendor, data]) => ({ vendor, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [filteredExpenses]);

  const maxCategoryAmount = Math.max(...categoryData.map(d => d.amount), 1);
  const maxDailyAmount = Math.max(...dailyData.map(d => d.amount), 1);
  const maxMonthlyAmount = Math.max(...monthlyData.map(d => d.amount), 1);

  return (
    <StatDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isDeductible ? 'Deductible Expenses' : 'All Expenses'}
    >
      <div className="space-y-4">
        <Card variant="elevated">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              ${isDeductible ? deductibleAmount.toFixed(0) : totalAmount.toFixed(0)}
            </p>
            <p className="text-sm text-muted-foreground">
              {filteredExpenses.length} items in {year}
              {isDeductible && ` (${businessPercentage.toFixed(0)}% business use)`}
            </p>
          </CardContent>
        </Card>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={categoryFilter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setCategoryFilter('all')}
          >
            All
          </Badge>
          {Object.keys(categoryLabels).map(cat => (
            <Badge
              key={cat}
              variant={categoryFilter === cat ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setCategoryFilter(cat)}
            >
              {categoryLabels[cat]}
            </Badge>
          ))}
        </div>

        <FilterTabs>
          <TabsContent value="daily" className="space-y-2">
            {dailyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No expenses recorded</p>
            ) : (
              dailyData.slice(0, 30).map(item => (
                <Card key={item.date} variant="interactive" className="p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">
                      {format(parseLocalDate(item.date), 'EEE, MMM d')}
                    </span>
                    <span className="text-sm font-bold text-warning">
                      ${isDeductible ? (item.amount * businessPercentage / 100).toFixed(0) : item.amount.toFixed(0)}
                    </span>
                  </div>
                  <Progress value={(item.amount / maxDailyAmount) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{item.items} item{item.items > 1 ? 's' : ''}</p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="monthly" className="space-y-2">
            {monthlyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No expenses recorded</p>
            ) : (
              monthlyData.map(item => (
                <Card key={item.month} variant="interactive" className="p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">
                      {format(parseISO(item.month + '-01'), 'MMMM yyyy')}
                    </span>
                    <span className="text-sm font-bold text-warning">
                      ${isDeductible ? (item.amount * businessPercentage / 100).toFixed(0) : item.amount.toFixed(0)}
                    </span>
                  </div>
                  <Progress value={(item.amount / maxMonthlyAmount) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{item.items} item{item.items > 1 ? 's' : ''}</p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="yearly" className="space-y-4">
            {/* Category Breakdown */}
            <Card variant="elevated" className="p-4">
              <p className="text-sm font-semibold mb-3">By Category</p>
              <div className="space-y-3">
                {categoryData.map(item => {
                  const Icon = categoryIcons[item.category] || MoreHorizontal;
                  return (
                    <div key={item.category}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{categoryLabels[item.category] || item.category}</span>
                        </div>
                        <span className="text-sm font-semibold">
                          ${isDeductible ? (item.amount * businessPercentage / 100).toFixed(0) : item.amount.toFixed(0)}
                        </span>
                      </div>
                      <Progress value={(item.amount / maxCategoryAmount) * 100} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top Vendors */}
            <Card variant="elevated" className="p-4">
              <p className="text-sm font-semibold mb-3">Top Vendors</p>
              <div className="space-y-2">
                {topVendors.map((item, i) => (
                  <div key={item.vendor} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm truncate max-w-[150px]">{item.vendor}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold">
                        ${isDeductible ? (item.amount * businessPercentage / 100).toFixed(0) : item.amount.toFixed(0)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">({item.count}x)</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </FilterTabs>
      </div>
    </StatDetailDialog>
  );
}
