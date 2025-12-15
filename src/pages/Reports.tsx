import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BusinessPercentageRing } from '@/components/dashboard/BusinessPercentageRing';
import { CategorySummary } from '@/components/expenses/CategorySummary';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { EXPENSE_CATEGORY_LABELS, ExpenseCategory } from '@/types';
import { FileText, Download, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const { loading: tripsLoading, getStats: getTripStats, getTripsByYear } = useTripsDB();
  const { loading: expensesLoading, getTotalByCategory, getExpensesByYear } = useExpensesDB();

  const year = parseInt(selectedYear);
  const tripStats = getTripStats(year);
  const categoryTotals = getTotalByCategory(year);
  const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
  const deductibleAmount = totalExpenses * (tripStats.businessPercentage / 100);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const loading = tripsLoading || expensesLoading;

  const generateReport = () => {
    const trips = getTripsByYear(year);
    const expenses = getExpensesByYear(year);

    if (trips.length === 0 && expenses.length === 0) {
      toast.error('No data to export for this year');
      return;
    }

    // Create report content
    const reportContent = `
CRA FORM T2125 - VEHICLE EXPENSE SUMMARY
Tax Year: ${year}
Generated: ${new Date().toLocaleDateString()}

============================================
MILEAGE SUMMARY
============================================
Total Kilometres: ${tripStats.totalKilometres.toFixed(1)} km
Business Kilometres: ${tripStats.businessKilometres.toFixed(1)} km
Personal Kilometres: ${tripStats.personalKilometres.toFixed(1)} km

BUSINESS-USE PERCENTAGE: ${tripStats.businessPercentage.toFixed(1)}%

============================================
EXPENSE SUMMARY (T2125 Categories)
============================================
${Object.entries(categoryTotals)
  .map(([cat, amount]) => `${EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}: $${amount.toFixed(2)}`)
  .join('\n')}

--------------------------------------------
TOTAL EXPENSES: $${totalExpenses.toFixed(2)}
DEDUCTIBLE AMOUNT (${tripStats.businessPercentage.toFixed(1)}%): $${deductibleAmount.toFixed(2)}
============================================

DETAILED TRIP LOG
============================================
${trips
  .map(
    (t) =>
      `${t.date} | ${t.start_time}-${t.end_time} | ${t.kilometres.toFixed(1)}km | ${t.category.toUpperCase()}\n  From: ${t.start_location}\n  To: ${t.end_location}`
  )
  .join('\n\n')}

============================================
DETAILED EXPENSE LOG
============================================
${expenses
  .map(
    (e) =>
      `${e.date} | ${e.vendor_name} | ${EXPENSE_CATEGORY_LABELS[e.category]} | $${e.amount.toFixed(2)}${e.notes ? `\n  Notes: ${e.notes}` : ''}`
  )
  .join('\n\n')}
`.trim();

    // Download as text file
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `T2125_Report_${year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Report downloaded successfully');
  };

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
      <PageHeader title="Tax Reports" subtitle="CRA Form T2125" />

      {/* Year Selector */}
      <div className="mb-6">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                Tax Year {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Business Use Summary */}
      <Card variant="glow" className="mb-6">
        <CardContent className="p-6 flex flex-col items-center">
          <BusinessPercentageRing percentage={tripStats.businessPercentage} size={140} />
          <div className="mt-4 grid grid-cols-2 gap-6 w-full text-center">
            <div>
              <p className="text-xs text-muted-foreground">Business</p>
              <p className="text-lg font-bold text-primary">
                {tripStats.businessKilometres.toFixed(0)} km
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Personal</p>
              <p className="text-lg font-bold text-foreground">
                {tripStats.personalKilometres.toFixed(0)} km
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expense Breakdown */}
      <CategorySummary totals={categoryTotals} className="mb-6" />

      {/* Deductible Summary */}
      <Card variant="elevated" className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            T2125 Deduction Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Vehicle Expenses</span>
            <span className="font-semibold">${totalExpenses.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Business-Use Percentage</span>
            <span className="font-semibold">{tripStats.businessPercentage.toFixed(1)}%</span>
          </div>
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="font-semibold text-foreground">Deductible Amount</span>
            <span className="text-xl font-bold text-primary">
              ${deductibleAmount.toFixed(2)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Alert */}
      <Card variant="outline" className="mb-6 border-warning/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            This report is for reference only. Consult a tax professional for official CRA filings.
          </p>
        </CardContent>
      </Card>

      {/* Download Button */}
      <Button onClick={generateReport} className="w-full" size="lg">
        <Download className="w-5 h-5 mr-2" />
        Download Report
      </Button>
    </AppLayout>
  );
}
