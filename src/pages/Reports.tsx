import { useState, useCallback } from 'react';
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
import { BusinessActivityView } from '@/components/documents/BusinessActivityView';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { useOdometerGapsDB } from '@/hooks/useOdometerGapsDB';
import { EXPENSE_CATEGORY_LABELS, ExpenseCategory } from '@/types';
import { PLATFORM_LABELS, GAP_CATEGORY_LABELS } from '@/types/documents';
import { generateFullExcelReport } from '@/lib/excelExport';
import { generateShortExcel, generateElaborateExcel } from '@/lib/transactionExcelExport';
import { generateSaladMasterExcel, generateDeliveryExpensesExcel, generateExpensesReceiptExcel } from '@/lib/saladMasterExport';
import { FileText, Download, AlertCircle, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, List, Table, ChefHat, Truck, Receipt, Brain, ScanSearch, Archive } from 'lucide-react';
import { toast } from 'sonner';

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const { trips, loading: tripsLoading, getStats: getTripStats, getTripsByYear } = useTripsDB();
  const { expenses, loading: expensesLoading, getTotalByCategory, getExpensesByYear } = useExpensesDB();
  const { readings: odometerReadings, loading: odometerLoading, getReadingForYear, getBusinessPercentage, getTotalKmForYear } = useOdometerDB();
  const { getDocumentsByYear, getMonthlyBusinessSummary, getRatio } = useDocumentsDB();
  const { getGapForYear } = useOdometerGapsDB();

  const year = parseInt(selectedYear);
  const tripStats = getTripStats(year);
  const odometerReading = getReadingForYear(year);
  const odometerTotalKm = getTotalKmForYear(year);
  const yearDocs = getDocumentsByYear(year);
  const gap = getGapForYear(year);
  const ratio = getRatio(year);

  // Include document KM (verified + estimated) so reports match Business Activity
  const monthlyData = getMonthlyBusinessSummary(year);
  const documentBusinessKm = monthlyData.reduce((sum, month) => sum + month.totalKm, 0);

  // Prefer the performance ratio total KM (Income × Ratio) when available (matches Dashboard estimation)
  const ratioBusinessKm = ratio?.total_km ?? 0;
  const estimatedBusinessKm = ratioBusinessKm > 0 ? ratioBusinessKm : documentBusinessKm;

  // Use the highest defensible business KM source, but cap at odometer total if available
  const uncappedBusinessKm = Math.max(tripStats.businessKilometres, estimatedBusinessKm);
  const effectiveBusinessKm = odometerTotalKm !== null
    ? Math.min(uncappedBusinessKm, odometerTotalKm)
    : uncappedBusinessKm;
  
  // Use odometer-based percentage if available
  const businessPercentage = odometerTotalKm !== null
    ? getBusinessPercentage(year, effectiveBusinessKm)
    : (tripStats.totalKilometres > 0 ? (effectiveBusinessKm / tripStats.totalKilometres) * 100 : 0);

  const categoryTotals = getTotalByCategory(year, true);
  const totalExpenses = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
  const deductibleAmount = totalExpenses * (businessPercentage / 100);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const loading = tripsLoading || expensesLoading || odometerLoading;

  // CRA Compliance checks
  const hasOdometer = odometerReading !== null && odometerReading !== undefined && odometerReading.end_reading !== null;
  const hasDocuments = yearDocs.length > 0;
  const hasNoGap = !gap || gap.gap_status === 'confirmed' || gap.gap_km <= 0;
  const isFullyCompliant = hasOdometer && hasDocuments && hasNoGap;

  const generateReport = () => {
    const trips = getTripsByYear(year);
    const expenses = getExpensesByYear(year);

    if (trips.length === 0 && expenses.length === 0) {
      toast.error('No data to export for this year');
      return;
    }

    const totalKm = odometerTotalKm !== null ? odometerTotalKm : tripStats.totalKilometres;

    // Create enhanced report content
    const reportContent = `
CRA FORM T2125 - VEHICLE EXPENSE SUMMARY
Tax Year: ${year}
Generated: ${new Date().toLocaleDateString()}
Compliance Status: ${isFullyCompliant ? 'FULLY CRA COMPLIANT' : 'REQUIRES ATTENTION'}

============================================
ODOMETER READINGS (ANCHOR DATA)
============================================
${odometerReading 
  ? `Start of Year (Jan 1): ${odometerReading.start_reading.toLocaleString()} km
End of Year (Dec 31): ${odometerReading.end_reading ? odometerReading.end_reading.toLocaleString() : 'Not recorded'} km
Total Annual Kilometres: ${odometerTotalKm !== null ? odometerTotalKm.toLocaleString() : 'N/A'} km`
  : 'No odometer readings recorded for this year'}

${gap && gap.gap_km > 0 ? `
ODOMETER RECONCILIATION:
- Logged Business KM: ${gap.logged_business_km.toFixed(1)} km
- Logged Personal KM: ${gap.logged_personal_km.toFixed(1)} km  
- Gap KM: ${gap.gap_km.toFixed(1)} km (${gap.gap_status === 'confirmed' ? `Confirmed as ${GAP_CATEGORY_LABELS[gap.gap_category]}` : 'Pending confirmation'})
` : ''}

============================================
MILEAGE SUMMARY
============================================
Total Kilometres: ${totalKm.toFixed(1)} km
Business Kilometres: ${effectiveBusinessKm.toFixed(1)} km
Personal Kilometres: ${(totalKm - effectiveBusinessKm).toFixed(1)} km

BUSINESS-USE PERCENTAGE: ${businessPercentage.toFixed(1)}%
${odometerTotalKm !== null ? '(Calculated from odometer readings - CRA compliant)' : '(Calculated from logged trips only)'}

${ratio ? `
============================================
PERFORMANCE RATIO (KM per $ Income)
============================================
Combined Average: ${ratio.km_per_dollar.toFixed(4)} km per $1
Based on ${ratio.source_document_count} verified documents
Total verified: $${ratio.total_income.toFixed(2)} income / ${ratio.total_km.toFixed(1)} km
` : ''}

============================================
MULTI-PLATFORM BUSINESS ACTIVITY
============================================
${monthlyData.filter(m => m.income > 0 || m.totalKm > 0).map(m => 
  `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.month-1]}: $${m.income.toFixed(2)} | ${m.totalKm.toFixed(1)} km${m.estimatedKm > 0 ? ' (inc. estimated)' : ''} | Platforms: ${m.platforms.length > 0 ? m.platforms.map(p => PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] || p).join(', ') : 'None'}`
).join('\n')}

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

INCOME DOCUMENTS SUMMARY
============================================
Total Documents: ${yearDocs.length}
Primary Sources: ${yearDocs.filter(d => d.source_type === 'primary').length}
Secondary Sources: ${yearDocs.filter(d => d.source_type === 'secondary').length}
Documents with verified KM: ${yearDocs.filter(d => d.has_verified_km).length}
Documents with estimated KM: ${yearDocs.filter(d => !d.has_verified_km && d.estimated_km).length}

DETAILED TRIP LOG
============================================
${trips
  .map(
    (t) =>
      `${t.date} | ${t.start_time}-${t.end_time} | ${t.kilometres.toFixed(1)}km | ${t.category.toUpperCase()}${t.company ? ` | ${t.company}` : ''}\n  From: ${t.start_location}\n  To: ${t.end_location}`
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
      <div className="mb-4">
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

      {/* CRA Compliance Status */}
      <Card variant={isFullyCompliant ? 'glow' : 'outline'} className={`mb-4 ${isFullyCompliant ? 'border-success/50' : 'border-warning/50'}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            {isFullyCompliant ? (
              <CheckCircle2 className="w-6 h-6 text-success" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-warning" />
            )}
            <div>
              <p className="font-semibold">
                {isFullyCompliant ? 'CRA Audit Ready' : 'Action Required'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isFullyCompliant 
                  ? 'Your records are complete for this tax year'
                  : 'Complete the items below for full compliance'
                }
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Odometer readings</span>
              {hasOdometer ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Income documents</span>
              {hasDocuments ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Odometer reconciliation</span>
              {hasNoGap ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <AlertCircle className="w-4 h-4 text-warning" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Odometer Readings */}
      <div className="mb-4">
        <OdometerCard year={year} />
      </div>

      {/* Business Activity Summary */}
      {yearDocs.length > 0 && (
        <div className="mb-4">
          <BusinessActivityView year={year} />
        </div>
      )}

      {/* Business Use Summary */}
      <Card variant="glow" className="mb-4">
        <CardContent className="p-6 flex flex-col items-center">
          <BusinessPercentageRing percentage={businessPercentage} size={140} />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {odometerTotalKm !== null 
              ? (estimatedBusinessKm > tripStats.businessKilometres
                ? 'Includes CRA-defensible estimated KM'
                : 'Based on odometer readings (CRA compliant)')
              : 'Based on logged trips only'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-6 w-full text-center">
            <div>
              <p className="text-xs text-muted-foreground">Business</p>
              <p className="text-lg font-bold text-primary">
                {effectiveBusinessKm.toFixed(0)} km
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
      <CategorySummary totals={categoryTotals} className="mb-4" />

      {/* Deductible Summary */}
      <Card variant="elevated" className="mb-4">
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
          {ratio && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Performance Ratio</span>
              <span className="font-semibold font-mono">{ratio.km_per_dollar.toFixed(3)} km/$</span>
            </div>
          )}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="font-semibold text-foreground">Deductible Amount</span>
            <span className="text-xl font-bold text-primary">
              ${deductibleAmount.toFixed(2)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Download Buttons */}
      <div className="space-y-3">
        <Button onClick={generateReport} className="w-full" size="lg">
          <Download className="w-5 h-5 mr-2" />
          Download Text Report
        </Button>
        <Button 
          onClick={async () => {
            const yearTrips = getTripsByYear(year);
            const yearExpenses = getExpensesByYear(year);
            if (yearTrips.length === 0 && yearExpenses.length === 0) {
              toast.error('No data to export for this year');
              return;
            }
            try {
              await generateFullExcelReport(trips, expenses, odometerReadings, year);
              toast.success('Excel report downloaded');
            } catch (error) {
              console.error('Export error:', error);
              toast.error('Failed to generate Excel report');
            }
          }} 
          variant="outline" 
          className="w-full" 
          size="lg"
        >
          <FileSpreadsheet className="w-5 h-5 mr-2" />
          Cookware Excel
        </Button>
        
        {/* Salad Master & Delivery Exports */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={async () => {
              try {
                const odometerInfo = odometerReading && odometerTotalKm !== null ? {
                  startReading: odometerReading.start_reading,
                  endReading: odometerReading.end_reading!,
                  totalKm: odometerTotalKm,
                  businessKm: effectiveBusinessKm,
                  businessPercent: businessPercentage,
                } : undefined;
                await generateSaladMasterExcel(expenses, year, odometerInfo);
                toast.success('Salad Master Excel downloaded');
              } catch (error) {
                console.error('Export error:', error);
                toast.error('Failed to generate Salad Master Excel');
              }
            }} 
            variant="outline" 
            className="w-full" 
            size="default"
          >
            <ChefHat className="w-4 h-4 mr-2" />
            Salad Master
          </Button>
          <Button 
            onClick={async () => {
              try {
                const odometerData = odometerReading && odometerTotalKm !== null ? {
                  startReading: odometerReading.start_reading,
                  endReading: odometerReading.end_reading!,
                  totalKm: odometerTotalKm,
                  businessKm: effectiveBusinessKm,
                  businessPercent: businessPercentage,
                } : undefined;
                await generateDeliveryExpensesExcel(expenses, year, odometerData);
                toast.success('Delivery Expenses Excel downloaded');
              } catch (error) {
                console.error('Export error:', error);
                toast.error('Failed to generate Delivery Excel');
              }
            }} 
            variant="outline" 
            className="w-full" 
            size="default"
          >
            <Truck className="w-4 h-4 mr-2" />
            Delivery T2125
          </Button>
        </div>

        {/* New Export Options */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={async () => {
              const yearExpenses = getExpensesByYear(year);
              if (yearExpenses.length === 0) {
                toast.error('No expenses to export for this year');
                return;
              }
              try {
                await generateShortExcel(yearExpenses, year);
                toast.success('Short Excel downloaded');
              } catch (error) {
                console.error('Export error:', error);
                toast.error('Failed to generate Short Excel');
              }
            }} 
            variant="secondary" 
            className="w-full" 
            size="default"
          >
            <List className="w-4 h-4 mr-2" />
            Short Excel
          </Button>
          <Button 
            onClick={async () => {
              const yearExpenses = getExpensesByYear(year);
              if (yearExpenses.length === 0) {
                toast.error('No expenses to export for this year');
                return;
              }
              try {
                await generateElaborateExcel(yearExpenses, year);
                toast.success('Elaborate Excel downloaded');
              } catch (error) {
                console.error('Export error:', error);
                toast.error('Failed to generate Elaborate Excel');
              }
            }} 
            variant="secondary" 
            className="w-full" 
            size="default"
          >
            <Table className="w-4 h-4 mr-2" />
            Elaborate Excel
          </Button>
        </div>

        {/* Expenses Receipt Export */}
        <Button 
          onClick={async () => {
            try {
              await generateExpensesReceiptExcel(expenses, year);
              toast.success('Expenses Receipt Excel downloaded');
            } catch (error) {
              console.error('Export error:', error);
              toast.error('Failed to generate Expenses Receipt Excel');
            }
          }} 
          variant="secondary" 
          className="w-full" 
          size="lg"
        >
          <Receipt className="w-5 h-5 mr-2" />
          Expenses Receipt (All)
        </Button>

        {/* AI Reclassify Button */}
        <Button 
          onClick={async () => {
            toast.loading('AI is reviewing all expenses...', { id: 'reclassify' });
            try {
              const { supabase } = await import('@/integrations/supabase/client');
              const { data, error } = await supabase.functions.invoke('reclassify-expenses', {
                body: { year },
              });
              if (error) throw error;
              if (data?.success) {
                if (data.changes > 0) {
                  toast.success(`AI reclassified ${data.changes} expenses out of ${data.total_reviewed} reviewed`, { id: 'reclassify', duration: 8000 });
                  // Show details
                  data.details?.forEach((d: any) => {
                    toast.info(`${d.vendor}: ${d.from} → ${d.to}`, { description: d.reason, duration: 6000 });
                  });
                  // Refresh data
                  window.location.reload();
                } else {
                  toast.success('All expenses are correctly categorized!', { id: 'reclassify' });
                }
              } else {
                toast.error(data?.error || 'Reclassification failed', { id: 'reclassify' });
              }
            } catch (error) {
              console.error('Reclassify error:', error);
              toast.error('Failed to reclassify expenses', { id: 'reclassify' });
            }
          }}
          variant="outline"
          className="w-full border-primary/30"
          size="lg"
        >
          <Brain className="w-5 h-5 mr-2" />
          AI Reclassify Categories
        </Button>

        {/* AI Receipt Audit */}
        <Button 
          onClick={async () => {
            const { supabase } = await import('@/integrations/supabase/client');
            let offset = 0;
            const batchSize = 5;
            let totalScanned = 0;
            let totalDiscrepancies = 0;
            let totalMatches = 0;
            let totalErrors = 0;
            let allDiscrepancies: any[] = [];
            
            toast.loading('Starting receipt audit with Claude AI...', { id: 'audit' });

            try {
              let hasMore = true;
              while (hasMore) {
                toast.loading(`Scanning receipts ${offset + 1}-${offset + batchSize}...`, { id: 'audit' });
                
                const { data, error } = await supabase.functions.invoke('audit-receipts', {
                  body: { year, batch_offset: offset, batch_size: batchSize },
                });
                
                if (error) throw error;
                if (!data?.success) {
                  toast.error(data?.error || 'Audit failed', { id: 'audit' });
                  return;
                }

                totalScanned += data.summary.scanned;
                totalMatches += data.summary.matches;
                totalDiscrepancies += data.summary.discrepancies;
                totalErrors += data.summary.errors;

                // Collect discrepancies
                for (const r of data.results) {
                  if (r.status === 'discrepancy') {
                    allDiscrepancies.push(r);
                  }
                }

                toast.loading(`Scanned ${totalScanned}/${data.total} receipts (${totalDiscrepancies} issues found)...`, { id: 'audit' });

                hasMore = data.has_more;
                offset += batchSize;

                // Small delay between batches
                if (hasMore) await new Promise(r => setTimeout(r, 1000));
              }

              // Show final summary
              if (totalDiscrepancies > 0) {
                toast.warning(
                  `Audit complete: ${totalDiscrepancies} discrepancies found in ${totalScanned} receipts`,
                  { id: 'audit', duration: 10000 }
                );
                // Show each discrepancy
                allDiscrepancies.forEach((d: any) => {
                  toast.warning(`${d.vendor_name}`, {
                    description: d.discrepancies.join(' | '),
                    duration: 8000,
                  });
                });
              } else {
                toast.success(
                  `Audit complete! All ${totalScanned} receipts match perfectly ✓`,
                  { id: 'audit', duration: 8000 }
                );
              }

              if (totalErrors > 0) {
                toast.info(`${totalErrors} receipts could not be processed`, { duration: 5000 });
              }
            } catch (error) {
              console.error('Audit error:', error);
              toast.error('Receipt audit failed', { id: 'audit' });
            }
          }}
          variant="outline"
          className="w-full border-warning/30"
          size="lg"
        >
          <ScanSearch className="w-5 h-5 mr-2" />
          AI Audit Receipts (Claude 2nd Opinion)
        </Button>

        {/* Download All Receipts & Statements ZIP */}
        <Button 
          onClick={async () => {
            toast.loading('Collecting all receipts & statements...', { id: 'zip-download' });
            try {
              const { supabase } = await import('@/integrations/supabase/client');
              const JSZip = (await import('jszip')).default;
              const zip = new JSZip();

              // Get all expenses with receipt_url for selected year
              const { data: yearExpenses } = await supabase
                .from('expenses')
                .select('id, date, vendor_name, amount, receipt_url')
                .gte('date', `${year}-01-01`)
                .lte('date', `${year}-12-31`)
                .is('deleted_at', null)
                .not('receipt_url', 'is', null);

              // Get all documents with document_url for selected year
              const { data: yearDocs } = await supabase
                .from('documents')
                .select('id, period_year, period_month, platform, document_url, document_type')
                .eq('period_year', year)
                .not('document_url', 'is', null);

              const allFiles: { path: string; folder: string; name: string }[] = [];

              // Collect expense receipts
              (yearExpenses || []).forEach((e: any) => {
                if (!e.receipt_url) return;
                const filePath = e.receipt_url.startsWith('http') ? null : e.receipt_url;
                if (filePath) {
                  const ext = filePath.split('.').pop() || 'jpg';
                  const safeName = e.vendor_name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
                  allFiles.push({
                    path: filePath,
                    folder: 'receipts',
                    name: `${e.date}_${safeName}_$${e.amount}.${ext}`,
                  });
                }
              });

              // Collect document files (paystubs/statements)
              (yearDocs || []).forEach((d: any) => {
                if (!d.document_url) return;
                const filePath = d.document_url.startsWith('http') ? null : d.document_url;
                if (filePath) {
                  const ext = filePath.split('.').pop() || 'pdf';
                  const month = String(d.period_month).padStart(2, '0');
                  const platform = (d.platform || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
                  allFiles.push({
                    path: filePath,
                    folder: 'statements',
                    name: `${year}-${month}_${platform}_${d.document_type}.${ext}`,
                  });
                }
              });

              if (allFiles.length === 0) {
                toast.error('No uploaded files found for this year', { id: 'zip-download' });
                return;
              }

              toast.loading(`Downloading ${allFiles.length} files...`, { id: 'zip-download' });

              let downloaded = 0;
              let errors = 0;

              // Download in batches of 5
              for (let i = 0; i < allFiles.length; i += 5) {
                const batch = allFiles.slice(i, i + 5);
                const results = await Promise.allSettled(
                  batch.map(async (file) => {
                    const { data, error } = await supabase.storage
                      .from('receipts')
                      .download(file.path);
                    if (error || !data) throw error;
                    return { ...file, blob: data };
                  })
                );

                for (const result of results) {
                  if (result.status === 'fulfilled') {
                    const { folder, name, blob } = result.value;
                    zip.folder(folder)!.file(name, blob);
                    downloaded++;
                  } else {
                    errors++;
                  }
                }

                toast.loading(`Downloaded ${downloaded}/${allFiles.length} files...`, { id: 'zip-download' });
              }

              toast.loading('Creating ZIP file...', { id: 'zip-download' });
              const zipBlob = await zip.generateAsync({ type: 'blob' });
              const url = URL.createObjectURL(zipBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Receipts_Statements_${year}.zip`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              toast.success(
                `ZIP downloaded! ${downloaded} files${errors > 0 ? ` (${errors} failed)` : ''}`,
                { id: 'zip-download', duration: 6000 }
              );
            } catch (error) {
              console.error('ZIP download error:', error);
              toast.error('Failed to create ZIP file', { id: 'zip-download' });
            }
          }}
          variant="outline"
          className="w-full border-accent/30"
          size="lg"
        >
          <Archive className="w-5 h-5 mr-2" />
          Download All Receipts & Statements (ZIP)
        </Button>
      </div>
    </AppLayout>
  );
}
