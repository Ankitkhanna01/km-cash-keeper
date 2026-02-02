import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { Loader2 } from 'lucide-react';
import { SpendingOverview } from '@/components/insights/SpendingOverview';
import { StoreAnalytics } from '@/components/insights/StoreAnalytics';
import { ItemPatterns } from '@/components/insights/ItemPatterns';
import { MonthlyTrends } from '@/components/insights/MonthlyTrends';
import { CategoryBreakdown } from '@/components/insights/CategoryBreakdown';
import { ReceiptHistory } from '@/components/insights/ReceiptHistory';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Insights() {
  const { expenses, loading } = useExpensesDB();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Get available years from expenses
  const years = [...new Set(expenses.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const yearExpenses = expenses.filter(e => new Date(e.date).getFullYear() === selectedYear);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Spending Insights"
        subtitle="Where your money goes"
        action={
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="receipts">Receipt History</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6 pb-4">
          <SpendingOverview expenses={yearExpenses} year={selectedYear} />
          <MonthlyTrends expenses={yearExpenses} year={selectedYear} />
          <CategoryBreakdown expenses={yearExpenses} />
          <StoreAnalytics expenses={yearExpenses} />
          <ItemPatterns expenses={yearExpenses} />
        </TabsContent>

        <TabsContent value="receipts" className="pb-4">
          {/* Show ALL receipts, not just filtered by year */}
          <ReceiptHistory expenses={expenses} />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
