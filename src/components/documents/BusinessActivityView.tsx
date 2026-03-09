import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MONTH_NAMES, PLATFORM_LABELS } from '@/types/documents';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { DollarSign, Route, TrendingUp } from 'lucide-react';

interface BusinessActivityViewProps {
  year: number;
}

export function BusinessActivityView({ year }: BusinessActivityViewProps) {
  const { getMonthlyBusinessSummary, getRatio } = useDocumentsDB();
  
  const monthlySummary = getMonthlyBusinessSummary(year);
  const combinedRatio = getRatio(year);
  
  const totalIncome = monthlySummary.reduce((sum, m) => sum + m.income, 0);
  // Use the performance ratio total_km (avoids double-counting from overlapping multi-app km)
  const totalKm = combinedRatio?.total_km ?? monthlySummary.reduce((sum, m) => sum + m.totalKm, 0);

  // Collect all unique platforms
  const allPlatforms = new Set<string>();
  monthlySummary.forEach(m => m.platforms.forEach(p => allPlatforms.add(p)));

  return (
    <div className="space-y-4">
      {/* Annual Summary */}
      <Card variant="glow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Business Activity {year}</span>
            {combinedRatio && (
              <Badge variant="secondary" className="font-mono">
                {combinedRatio.km_per_dollar.toFixed(3)} km/$
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <DollarSign className="w-5 h-5 mx-auto text-success mb-1" />
              <p className="text-lg font-bold">${totalIncome.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Total Income</p>
            </div>
            <div>
              <Route className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-lg font-bold">{totalKm.toFixed(0)} km</p>
              <p className="text-xs text-muted-foreground">
                {combinedRatio ? 'Ratio-based' : 'Total KM'}
              </p>
            </div>
            <div>
              <TrendingUp className="w-5 h-5 mx-auto text-warning mb-1" />
              <p className="text-lg font-bold">{allPlatforms.size}</p>
              <p className="text-xs text-muted-foreground">Platforms</p>
            </div>
          </div>

          {allPlatforms.size > 0 && (
            <div className="flex gap-1 flex-wrap mt-4 justify-center">
              {Array.from(allPlatforms).map(p => (
                <Badge key={p} variant="outline" className="text-xs">
                  {PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] || p}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Breakdown */}
      <Card variant="elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {monthlySummary.map(({ month, income, km, estimatedKm, platforms }) => {
            const hasData = income > 0 || km > 0 || estimatedKm > 0;
            const monthTotalKm = km + estimatedKm;
            
            return (
              <div 
                key={month} 
                className={`flex items-center justify-between py-2 border-b border-border last:border-0 ${
                  !hasData ? 'opacity-40' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium w-16">{MONTH_NAMES[month - 1].slice(0, 3)}</span>
                  {platforms.length > 0 && (
                    <div className="flex gap-1">
                      {platforms.map(p => (
                        <Badge key={p} variant="secondary" className="text-[10px] px-1">
                          {p.charAt(0).toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-success font-medium">
                    ${income.toFixed(0)}
                  </span>
                  <span className="text-primary font-medium w-16 text-right">
                    {monthTotalKm > 0 ? `${monthTotalKm.toFixed(0)} km` : '—'}
                  </span>
                  {estimatedKm > 0 && km === 0 && (
                    <span className="text-xs text-muted-foreground">(est.)</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
