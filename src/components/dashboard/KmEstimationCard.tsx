import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useKmEstimation, MonthEstimate } from '@/hooks/useKmEstimation';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { parseLocalDate } from '@/lib/dateUtils';
import { Calculator, FileText, TrendingUp, ChevronRight, Copy, Check, Info } from 'lucide-react';
import { toast } from 'sonner';

export function KmEstimationCard({ year }: { year: number }) {
  const { trips } = useTripsDB();
  const { documents, ratios } = useDocumentsDB();
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const priorYear = year - 1;

  // Split trips by year
  const currentYearTrips = trips.filter(t => parseLocalDate(t.date).getFullYear() === year);
  const priorYearTrips = trips.filter(t => parseLocalDate(t.date).getFullYear() === priorYear);

  // Build monthly income from documents
  const monthlyIncome = new Map<number, number>();
  documents
    .filter(d => d.period_year === year && d.income_amount && d.income_amount > 0)
    .forEach(d => {
      monthlyIncome.set(d.period_month, (monthlyIncome.get(d.period_month) || 0) + d.income_amount!);
    });

  const currentYearRatios = ratios.filter(r => r.year === year);
  const priorYearRatios = ratios.filter(r => r.year === priorYear);

  const estimation = useKmEstimation({
    currentYearTrips,
    priorYearTrips,
    currentYearRatios,
    priorYearRatios,
    monthlyIncome,
    currentYear: year,
  });

  const hasData = estimation.totalEstimatedKm > 0;

  const handleCopyExplanation = () => {
    navigator.clipboard.writeText(estimation.craExplanation);
    setCopied(true);
    toast.success('CRA explanation copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!hasData) {
    return (
      <Card variant="outline" className="mb-4">
        <CardContent className="p-4 text-center">
          <Calculator className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Add income documents and/or have prior year trips to enable KM estimation
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeMonths = estimation.monthlyEstimates.filter(m => m.combinedEstimate !== null);

  return (
    <>
      <Card variant="elevated" className="mb-4 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              Estimated Business KM
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              CRA Defensible
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-primary/10 rounded-lg p-2 text-center">
              <p className="text-lg font-bold font-mono text-primary">
                {estimation.totalEstimatedKm.toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground">Estimated KM</p>
            </div>
            <div className="bg-muted rounded-lg p-2 text-center">
              <p className="text-lg font-bold font-mono">
                {estimation.totalLoggedKm.toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground">Logged KM</p>
            </div>
            <div className="bg-warning/10 rounded-lg p-2 text-center">
              <p className="text-lg font-bold font-mono text-warning">
                +{estimation.totalGap.toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground">Unlogged Gap</p>
            </div>
          </div>

          {/* Methods used */}
          <div className="flex flex-wrap gap-1">
            {estimation.totalIncomeBasedKm > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                <TrendingUp className="w-3 h-3 mr-1" />
                Income × Ratio
              </Badge>
            )}
            {estimation.totalHistoricalKm > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                <FileText className="w-3 h-3 mr-1" />
                {priorYear} Patterns
              </Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowDetail(true)}
          >
            View Monthly Breakdown
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-primary" />
              KM Estimation — {year}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* CRA Explanation Card */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  CRA-Defensible Methodology
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyExplanation}
                  className="h-6 text-xs"
                >
                  {copied ? (
                    <><Check className="w-3 h-3 mr-1" /> Copied</>
                  ) : (
                    <><Copy className="w-3 h-3 mr-1" /> Copy</>
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Method 1 — Income × Ratio:</strong> Your documented performance ratio ({ratios.find(r => r.platform === 'combined')?.km_per_dollar.toFixed(3) || 'N/A'} km/$) multiplied by monthly income.</p>
                <p><strong>Method 2 — Representative Period:</strong> CRA IC97-R allows using a "representative period" to establish driving patterns. Your {priorYear} trip records serve as baseline.</p>
                <p><strong>Combined:</strong> Both methods are averaged per month for cross-validation.</p>
              </div>
            </div>

            {/* Monthly breakdown */}
            <div className="space-y-2">
              {activeMonths.map(m => (
                <MonthRow key={m.month} estimate={m} priorYear={priorYear} />
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-border pt-3 space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Estimated</span>
                <span className="font-mono">{estimation.totalEstimatedKm.toFixed(0)} km</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Logged</span>
                <span className="font-mono">{estimation.totalLoggedKm.toFixed(0)} km</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-warning">
                <span>Unlogged Gap</span>
                <span className="font-mono">+{estimation.totalGap.toFixed(0)} km</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MonthRow({ estimate, priorYear }: { estimate: MonthEstimate; priorYear: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasGap = estimate.estimatedGap !== null && estimate.estimatedGap > 0;

  return (
    <div
      className="border border-border rounded-lg overflow-hidden"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Summary row */}
      <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium w-12">{estimate.monthName.slice(0, 3)}</span>
          <span className="text-xs text-muted-foreground">
            {estimate.actualTrips} trips / {estimate.actualLoggedKm.toFixed(0)} km
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasGap && (
            <Badge variant="outline" className="text-[10px] text-warning border-warning/30">
              +{estimate.estimatedGap!.toFixed(0)} km gap
            </Badge>
          )}
          <span className="text-sm font-mono font-medium">
            {estimate.combinedEstimate?.toFixed(0) || '—'} km
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/30 text-xs space-y-2 border-t border-border">
          {estimate.incomeBasedKm !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Income ({estimate.ratioSource})
              </span>
              <span className="font-mono">
                ${estimate.incomeUsed?.toFixed(0)} × {estimate.ratioUsed?.toFixed(3)} = {estimate.incomeBasedKm.toFixed(0)} km
              </span>
            </div>
          )}
          {estimate.historicalKm !== null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {priorYear} pattern ({estimate.historicalTrips} trips, {estimate.historicalDaysWorked} days)
              </span>
              <span className="font-mono">{estimate.historicalKm.toFixed(0)} km</span>
            </div>
          )}
          <div className="flex justify-between font-medium pt-1 border-t border-border">
            <span>Combined estimate</span>
            <span className="font-mono">{estimate.combinedEstimate?.toFixed(0)} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Actually logged</span>
            <span className="font-mono">{estimate.actualLoggedKm.toFixed(0)} km ({estimate.actualDaysWorked} days)</span>
          </div>
        </div>
      )}
    </div>
  );
}
