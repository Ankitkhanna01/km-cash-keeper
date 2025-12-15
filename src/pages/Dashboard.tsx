import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { BusinessPercentageRing } from '@/components/dashboard/BusinessPercentageRing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTrips } from '@/hooks/useTrips';
import { useExpenses } from '@/hooks/useExpenses';
import { Car, Receipt, Briefcase, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { trips, getStats: getTripStats, getUncategorizedTrips } = useTrips();
  const { getStats: getExpenseStats } = useExpenses();

  const currentYear = new Date().getFullYear();
  const tripStats = getTripStats(currentYear);
  const expenseStats = getExpenseStats(currentYear);
  const uncategorizedTrips = getUncategorizedTrips();

  return (
    <AppLayout>
      <PageHeader
        title="DriverTax"
        subtitle={`Tax Year ${currentYear}`}
      />

      {/* Business Use Percentage */}
      <Card variant="glow" className="mb-6">
        <CardContent className="p-6 flex flex-col items-center">
          <BusinessPercentageRing percentage={tripStats.businessPercentage} />
          <p className="text-sm text-muted-foreground mt-4 text-center">
            CRA requires tracking business vs. personal use for vehicle deductions
          </p>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          title="Business KM"
          value={tripStats.businessKilometres.toFixed(0)}
          subtitle={`${tripStats.businessTrips} trips`}
          icon={Briefcase}
          variant="primary"
        />
        <StatCard
          title="Total KM"
          value={tripStats.totalKilometres.toFixed(0)}
          subtitle={`${tripStats.totalTrips} trips`}
          icon={Car}
        />
        <StatCard
          title="Expenses"
          value={`$${expenseStats.totalAmount.toFixed(0)}`}
          subtitle={`${expenseStats.totalExpenses} items`}
          icon={Receipt}
          variant="warning"
        />
        <StatCard
          title="Deductible"
          value={`$${(expenseStats.totalAmount * (tripStats.businessPercentage / 100)).toFixed(0)}`}
          subtitle="Estimated"
          icon={TrendingUp}
          variant="success"
        />
      </div>

      {/* Uncategorized Trips Alert */}
      {uncategorizedTrips.length > 0 && (
        <Card variant="interactive" className="mb-6 border-warning/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-warning">
                  {uncategorizedTrips.length} Uncategorized Trip{uncategorizedTrips.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Swipe to categorize as business or personal
                </p>
              </div>
              <Link to="/trips">
                <Button variant="outline" size="sm">
                  Review
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card variant="elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Link to="/trips">
            <Button variant="secondary" className="w-full justify-start gap-2">
              <Car className="w-4 h-4" />
              Log Trip
            </Button>
          </Link>
          <Link to="/expenses">
            <Button variant="secondary" className="w-full justify-start gap-2">
              <Receipt className="w-4 h-4" />
              Add Expense
            </Button>
          </Link>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
