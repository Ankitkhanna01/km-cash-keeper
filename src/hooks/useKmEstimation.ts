import { useMemo } from 'react';
import { Trip } from '@/hooks/useTripsDB';
import { PerformanceRatio } from '@/types/documents';
import { MONTH_NAMES } from '@/types/documents';
import { parseLocalDate } from '@/lib/dateUtils';

export interface MonthEstimate {
  month: number;
  monthName: string;
  // Method 1: Income-based (performance ratio × income)
  incomeBasedKm: number | null;
  incomeUsed: number | null;
  ratioUsed: number | null;
  ratioSource: string | null;
  // Method 2: Historical pattern (last year same month)
  historicalKm: number | null;
  historicalTrips: number | null;
  historicalDaysWorked: number | null;
  // Combined estimate (average of available methods)
  combinedEstimate: number | null;
  // Actual logged this year
  actualLoggedKm: number;
  actualTrips: number;
  actualDaysWorked: number;
  // Gap
  estimatedGap: number | null;
  methodology: string;
}

export interface KmEstimationResult {
  monthlyEstimates: MonthEstimate[];
  totalEstimatedKm: number;
  totalLoggedKm: number;
  totalGap: number;
  totalIncomeBasedKm: number;
  totalHistoricalKm: number;
  methodologySummary: string;
  craExplanation: string;
}

interface UseKmEstimationParams {
  currentYearTrips: Trip[];
  priorYearTrips: Trip[];
  currentYearRatios: PerformanceRatio[];
  priorYearRatios: PerformanceRatio[];
  monthlyIncome: Map<number, number>; // month -> income
  currentYear: number;
}

function getUniqueDays(trips: Trip[]): number {
  return new Set(trips.map(t => t.date)).size;
}

function getMonthTrips(trips: Trip[], month: number, year: number): Trip[] {
  return trips.filter(t => {
    const d = parseLocalDate(t.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });
}

export function useKmEstimation({
  currentYearTrips,
  priorYearTrips,
  currentYearRatios,
  priorYearRatios,
  monthlyIncome,
  currentYear,
}: UseKmEstimationParams): KmEstimationResult {
  return useMemo(() => {
    const priorYear = currentYear - 1;
    const businessTrips = currentYearTrips.filter(t => t.category === 'business');
    const priorBusinessTrips = priorYearTrips.filter(t => t.category === 'business');

    // Get combined ratio (prefer current year, fallback to prior year)
    const combinedRatio =
      currentYearRatios.find(r => r.platform === 'combined') ||
      priorYearRatios.find(r => r.platform === 'combined');

    const currentMonth = new Date().getMonth() + 1;

    const monthlyEstimates: MonthEstimate[] = [];

    for (let month = 1; month <= 12; month++) {
      // Skip future months
      if (month > currentMonth) {
        monthlyEstimates.push({
          month,
          monthName: MONTH_NAMES[month - 1],
          incomeBasedKm: null,
          incomeUsed: null,
          ratioUsed: null,
          ratioSource: null,
          historicalKm: null,
          historicalTrips: null,
          historicalDaysWorked: null,
          combinedEstimate: null,
          actualLoggedKm: 0,
          actualTrips: 0,
          actualDaysWorked: 0,
          estimatedGap: null,
          methodology: 'Future month',
        });
        continue;
      }

      // Actual logged data this year
      const thisMonthTrips = getMonthTrips(businessTrips, month, currentYear);
      const actualKm = thisMonthTrips.reduce((s, t) => s + t.kilometres, 0);
      const actualTrips = thisMonthTrips.length;
      const actualDays = getUniqueDays(thisMonthTrips);

      // Method 1: Income-based estimation
      let incomeBasedKm: number | null = null;
      let incomeUsed: number | null = null;
      let ratioUsed: number | null = null;
      let ratioSource: string | null = null;

      const income = monthlyIncome.get(month) || 0;
      if (income > 0 && combinedRatio && combinedRatio.km_per_dollar > 0) {
        incomeBasedKm = Math.round(income * combinedRatio.km_per_dollar * 10) / 10;
        incomeUsed = income;
        ratioUsed = combinedRatio.km_per_dollar;
        ratioSource = `${combinedRatio.year} combined (${combinedRatio.source_document_count} docs)`;
      }

      // Method 2: Historical pattern (same month last year)
      const priorMonthTrips = getMonthTrips(priorBusinessTrips, month, priorYear);
      const historicalKm = priorMonthTrips.reduce((s, t) => s + t.kilometres, 0) || null;
      const historicalTrips = priorMonthTrips.length || null;
      const historicalDays = priorMonthTrips.length > 0 ? getUniqueDays(priorMonthTrips) : null;

      // Combined estimate: average of available methods
      const methods: number[] = [];
      if (incomeBasedKm !== null) methods.push(incomeBasedKm);
      if (historicalKm !== null) methods.push(historicalKm);
      const combinedEstimate = methods.length > 0
        ? Math.round(methods.reduce((a, b) => a + b, 0) / methods.length * 10) / 10
        : null;

      // Gap = estimated - actual
      const estimatedGap = combinedEstimate !== null
        ? Math.max(0, Math.round((combinedEstimate - actualKm) * 10) / 10)
        : null;

      // Build methodology description
      const methodParts: string[] = [];
      if (incomeBasedKm !== null) methodParts.push(`Income × Ratio = ${incomeBasedKm} km`);
      if (historicalKm !== null) methodParts.push(`${priorYear} pattern = ${historicalKm} km`);
      const methodology = methodParts.length > 0
        ? methodParts.join(' + ')
        : 'No data available';

      monthlyEstimates.push({
        month,
        monthName: MONTH_NAMES[month - 1],
        incomeBasedKm,
        incomeUsed,
        ratioUsed,
        ratioSource,
        historicalKm,
        historicalTrips,
        historicalDaysWorked: historicalDays,
        combinedEstimate,
        actualLoggedKm: actualKm,
        actualTrips,
        actualDaysWorked: actualDays,
        estimatedGap,
        methodology,
      });
    }

    const completedMonths = monthlyEstimates.filter(m => m.combinedEstimate !== null);
    const totalEstimatedKm = completedMonths.reduce((s, m) => s + (m.combinedEstimate || 0), 0);
    const totalLoggedKm = monthlyEstimates.reduce((s, m) => s + m.actualLoggedKm, 0);
    const totalGap = Math.max(0, totalEstimatedKm - totalLoggedKm);
    const totalIncomeBasedKm = completedMonths.reduce((s, m) => s + (m.incomeBasedKm || 0), 0);
    const totalHistoricalKm = completedMonths.reduce((s, m) => s + (m.historicalKm || 0), 0);

    const methodologySummary = [
      combinedRatio
        ? `Performance Ratio: ${combinedRatio.km_per_dollar.toFixed(3)} km/$ (${combinedRatio.year}, ${combinedRatio.source_document_count} source documents)`
        : null,
      priorBusinessTrips.length > 0
        ? `Historical Baseline: ${priorYear} trip logs (${priorBusinessTrips.length} business trips, ${priorBusinessTrips.reduce((s, t) => s + t.kilometres, 0).toFixed(0)} km total)`
        : null,
    ].filter(Boolean).join('\n');

    const craExplanation = `KM Estimation Methodology — CRA Defensible\n\n` +
      `This estimate uses two CRA-accepted approaches applied in combination:\n\n` +
      `1. INCOME-BASED PROJECTION\n` +
      `   Calculated using the taxpayer's documented Performance Ratio ` +
      `(kilometres driven per dollar earned), derived from ${combinedRatio?.source_document_count || 0} ` +
      `verified paystub/income documents. ` +
      `For each month, the earned income is multiplied by the historical ratio ` +
      `to project expected business kilometres.\n` +
      `   Ratio used: ${combinedRatio?.km_per_dollar.toFixed(3) || 'N/A'} km/$\n\n` +
      `2. REPRESENTATIVE PERIOD SAMPLING (IC97-R)\n` +
      `   CRA accepts the use of a "representative period" to establish ` +
      `business-use patterns. The taxpayer's ${priorYear} trip records serve as ` +
      `the representative baseline, containing ${priorBusinessTrips.length} documented ` +
      `business trips over ${getUniqueDays(priorBusinessTrips)} working days.\n\n` +
      `3. COMBINED ESTIMATE\n` +
      `   The final estimate averages both methods for each month, providing ` +
      `cross-validated figures. Where both methods produce similar results, ` +
      `this strengthens the CRA defensibility of the claimed amount.\n\n` +
      `Total Estimated Business KM: ${totalEstimatedKm.toFixed(0)} km\n` +
      `Total Actually Logged KM: ${totalLoggedKm.toFixed(0)} km\n` +
      `Estimated Unlogged Gap: ${totalGap.toFixed(0)} km`;

    return {
      monthlyEstimates,
      totalEstimatedKm,
      totalLoggedKm,
      totalGap,
      totalIncomeBasedKm,
      totalHistoricalKm,
      methodologySummary,
      craExplanation,
    };
  }, [currentYearTrips, priorYearTrips, currentYearRatios, priorYearRatios, monthlyIncome, currentYear]);
}
