import { useMemo } from 'react';
import { format, parseISO, startOfMonth, startOfYear } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatDetailDialog, FilterTabs, TabsContent } from './StatDetailDialog';
import { parseLocalDate } from '@/lib/dateUtils';

interface Trip {
  id: string;
  date: string;
  kilometres: number;
  category: string;
  start_location: string;
  end_location: string;
}

interface KmDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trips: Trip[];
  type: 'business' | 'total';
  year: number;
}

export function KmDetailView({ open, onOpenChange, trips, type, year }: KmDetailViewProps) {
  const filteredTrips = useMemo(() => {
    const yearTrips = trips.filter(t => parseLocalDate(t.date).getFullYear() === year);
    if (type === 'business') {
      return yearTrips.filter(t => t.category === 'business');
    }
    return yearTrips;
  }, [trips, type, year]);

  const dailyData = useMemo(() => {
    const grouped: Record<string, { km: number; trips: number }> = {};
    filteredTrips.forEach(trip => {
      const key = trip.date;
      if (!grouped[key]) grouped[key] = { km: 0, trips: 0 };
      grouped[key].km += trip.kilometres;
      grouped[key].trips += 1;
    });
    return Object.entries(grouped)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTrips]);

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { km: number; trips: number }> = {};
    filteredTrips.forEach(trip => {
      const key = format(parseLocalDate(trip.date), 'yyyy-MM');
      if (!grouped[key]) grouped[key] = { km: 0, trips: 0 };
      grouped[key].km += trip.kilometres;
      grouped[key].trips += 1;
    });
    return Object.entries(grouped)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredTrips]);

  const totalKm = filteredTrips.reduce((sum, t) => sum + t.kilometres, 0);
  const maxDailyKm = Math.max(...dailyData.map(d => d.km), 1);
  const maxMonthlyKm = Math.max(...monthlyData.map(d => d.km), 1);

  return (
    <StatDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      title={type === 'business' ? 'Business Kilometres' : 'Total Kilometres'}
    >
      <div className="space-y-4">
        <Card variant="elevated">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{totalKm.toFixed(0)} km</p>
            <p className="text-sm text-muted-foreground">{filteredTrips.length} trips in {year}</p>
          </CardContent>
        </Card>

        <FilterTabs>
          <TabsContent value="daily" className="space-y-2">
            {dailyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No trips recorded</p>
            ) : (
              dailyData.slice(0, 30).map(item => (
                <Card key={item.date} variant="interactive" className="p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">
                      {format(parseLocalDate(item.date), 'EEE, MMM d')}
                    </span>
                    <span className="text-sm font-bold text-primary">{item.km.toFixed(1)} km</span>
                  </div>
                  <Progress value={(item.km / maxDailyKm) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{item.trips} trip{item.trips > 1 ? 's' : ''}</p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="monthly" className="space-y-2">
            {monthlyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No trips recorded</p>
            ) : (
              monthlyData.map(item => (
                <Card key={item.month} variant="interactive" className="p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">
                      {format(parseISO(item.month + '-01'), 'MMMM yyyy')}
                    </span>
                    <span className="text-sm font-bold text-primary">{item.km.toFixed(0)} km</span>
                  </div>
                  <Progress value={(item.km / maxMonthlyKm) * 100} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">{item.trips} trip{item.trips > 1 ? 's' : ''}</p>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="yearly" className="space-y-2">
            <Card variant="elevated" className="p-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">{totalKm.toFixed(0)}</p>
                <p className="text-sm text-muted-foreground">Total kilometres in {year}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold">{filteredTrips.length}</p>
                  <p className="text-xs text-muted-foreground">Total Trips</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {filteredTrips.length > 0 ? (totalKm / filteredTrips.length).toFixed(1) : 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg km/trip</p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </FilterTabs>
      </div>
    </StatDetailDialog>
  );
}
