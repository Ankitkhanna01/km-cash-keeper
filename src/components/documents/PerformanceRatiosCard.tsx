import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { PLATFORM_LABELS } from '@/types/documents';
import { TrendingUp, RefreshCw, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface PerformanceRatiosCardProps {
  year: number;
}

export function PerformanceRatiosCard({ year }: PerformanceRatiosCardProps) {
  const { ratios, recalculateRatios, applyPredictiveBackfill } = useDocumentsDB();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const yearRatios = ratios.filter(r => r.year === year);
  const combinedRatio = yearRatios.find(r => r.platform === 'combined');
  const platformRatios = yearRatios.filter(r => r.platform !== 'combined' && r.platform !== null);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await recalculateRatios();
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      await applyPredictiveBackfill();
    } finally {
      setIsBackfilling(false);
    }
  };

  if (yearRatios.length === 0) {
    return (
      <Card variant="outline">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No performance ratios yet. Add documents with both income and KM to calculate ratios.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Performance Ratios {year}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleRecalculate}
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Combined Ratio */}
        {combinedRatio && (
          <div className="p-3 bg-primary/10 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Combined Average</span>
              <span className="text-lg font-bold font-mono">
                {combinedRatio.km_per_dollar.toFixed(3)} km/$
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Based on {combinedRatio.source_document_count} documents • 
              ${combinedRatio.total_income.toFixed(0)} income • 
              {combinedRatio.total_km.toFixed(0)} km
            </p>
          </div>
        )}

        {/* Per-Platform Ratios */}
        {platformRatios.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              By Platform
            </p>
            {platformRatios.map(ratio => (
              <div key={ratio.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <Badge variant="secondary">
                  {PLATFORM_LABELS[ratio.platform as keyof typeof PLATFORM_LABELS] || ratio.platform}
                </Badge>
                <span className="font-mono font-medium">
                  {ratio.km_per_dollar.toFixed(3)} km/$
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Backfill Button */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleBackfill}
          disabled={isBackfilling}
        >
          {isBackfilling ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Estimating...
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4 mr-2" />
              Estimate KM for Incomplete Documents
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          Uses your average ratios to estimate KM for documents without verified mileage
        </p>
      </CardContent>
    </Card>
  );
}
