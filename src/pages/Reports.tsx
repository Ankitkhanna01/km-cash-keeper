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
import { OdometerCard } from '@/components/dashboard/OdometerCard';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { EXPENSE_CATEGORY_LABELS, ExpenseCategory } from '@/types';
import { FileText, Download, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const { loading: tripsLoading, getStats: getTripStats, getTripsByYear } = useTripsDB();
  const { loading: expensesLoading, getTotalByCategory, getExpensesByYear } = useExpensesDB();
  const { loading: odometerLoading, getReadingForYear, getBusinessPercentage, getTotalKmForYear } = useOdometerDB();

  const year = parseInt(selectedYear);
  const tripStats = getTripStats(year);
  const odometerReading = getReadingForYear(year);
  const odometerTotalKm = getTotalKmForYear(year);
  
  // Use odometer-based percentage if available
  const businessPercentage = odometerTotalKm !== null
    ? getBusinessPercentage(year, tripStats.businessKilometres)
    : tripStats.businessPercentage;

  const categoryTotals = getTotalByCategory(year);
  const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
  const deductibleAmount = totalExpenses * (businessPercentage / 100);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const loading = tripsLoading || expensesLoading || odometerLoading;

  const generateReport = () => {
    const trips = getTripsByYear(year);
    const expenses = getExpensesByYear(year);

    if (trips.length === 0 && expenses.length === 0) {
      toast.error('No data to export for this year');
      return;
    }

    const totalKm = odometerTotalKm !== null ? odometerTotalKm : tripStats.totalKilometres;

    // Create report content
    const reportContent = `
CRA FORM T2125 - VEHICLE EXPENSE SUMMARY
Tax Year: ${year}
Generated: ${new Date().toLocaleDateString()}

============================================
ODOMETER READINGS
============================================
${odometerReading 
  ? `Start of Year (Jan 1): ${odometerReading.start_reading.toLocaleString()} km
End of Year (Dec 31): ${odometerReading.end_reading ? odometerReading.end_reading.toLocaleString() : 'Not recorded'} km
Total Annual Kilometres: ${odometerTotalKm !== null ? odometerTotalKm.toLocaleString() : 'N/A'} km`
  : 'No odometer readings recorded for this year'}

============================================
MILEAGE SUMMARY
============================================
Total Kilometres: ${totalKm.toFixed(1)} km
Business Kilometres: ${tripStats.businessKilometres.toFixed(1)} km
Personal Kilometres: ${(totalKm - tripStats.businessKilometres).toFixed(1)} km

BUSINESS-USE PERCENTAGE: ${businessPercentage.toFixed(1)}%
${odometerTotalKm !== null ? '(Calculated from odometer readings - CRA compliant)' : '(Calculated from logged trips only)'}

============================================
EXPENSE SUMMARY (T2125 Categories)
============================================
${Object.entries(categoryTotals)
  .map(([cat, amount]) => `${EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}: $${amount.toFixed(2)}`)
  .join('\n')}

--------------------------------------------
TOTAL EXPENSES: $${totalExpenses.toFixed(2)}
DEDUCTIBLE AMOUNT (${businessPercentage.toFixed(1)}%): $${deductibleAmount.toFixed(2)}
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

      {/* Odometer Readings */}
      <div className="mb-6">
        <OdometerCard year={year} />
      </div>

      {/* Business Use Summary */}
      <Card variant="glow" className="mb-6">
        <CardContent className="p-6 flex flex-col items-center">
          <BusinessPercentageRing percentage={businessPercentage} size={140} />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {odometerTotalKm !== null 
              ? 'Based on odometer readings' 
              : 'Based on logged trips only'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-6 w-full text-center">
            <div>
              <p className="text-xs text-muted-foreground">Business</p>
              <p className="text-lg font-bold text-primary">
                {tripStats.businessKilometres.toFixed(0)} km
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold text-foreground">
                {odometerTotalKm !== null ? odometerTotalKm.toFixed(0) : tripStats.totalKilometres.toFixed(0)} km
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
            <span className="font-semibold">{businessPercentage.toFixed(1)}%</span>
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
            {!odometerReading 
              ? 'Add odometer readings above for CRA-compliant business-use calculation.'
              : 'This report is for reference only. Consult a tax professional for official CRA filings.'}
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
