import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { BusinessPercentageRing } from '@/components/dashboard/BusinessPercentageRing';
import { OdometerCard } from '@/components/dashboard/OdometerCard';
import { KmDetailView } from '@/components/dashboard/KmDetailView';
import { KmEstimationCard } from '@/components/dashboard/KmEstimationCard';
import { ExpenseDetailView } from '@/components/dashboard/ExpenseDetailView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { Car, Receipt, Briefcase, TrendingUp, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { trips, loading: tripsLoading, getStats: getTripStats, getUncategorizedTrips } = useTripsDB();
  const { expenses, loading: expensesLoading, getStats: getExpenseStats } = useExpensesDB();
  const { loading: odometerLoading, getBusinessPercentage, getTotalKmForYear } = useOdometerDB();

  const [showBusinessKm, setShowBusinessKm] = useState(false);
  const [showTotalKm, setShowTotalKm] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showDeductible, setShowDeductible] = useState(false);

  const thisYear = new Date().getFullYear();
  const [currentYear, setCurrentYear] = useState(thisYear - 1); // Default to prior tax year (2025)
  const tripStats = getTripStats(currentYear);
  const expenseStats = getExpenseStats(currentYear);
  const uncategorizedTrips = getUncategorizedTrips();

  // Use odometer-based percentage if available, otherwise fall back to trip-based
  const odometerTotalKm = getTotalKmForYear(currentYear);
  const businessPercentage = odometerTotalKm !== null
    ? getBusinessPercentage(currentYear, tripStats.businessKilometres)
    : tripStats.businessPercentage;

  const loading = tripsLoading || expensesLoading || odometerLoading;

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
        title="DriverTax"
        subtitle={`Tax Year ${currentYear}`}
        showUserMenu
      />

      {/* Business Use Percentage */}
      <Card variant="glow" className="mb-6">
        <CardContent className="p-4 sm:p-6 flex flex-col items-center">
          <BusinessPercentageRing percentage={businessPercentage} />
          <p className="text-sm text-muted-foreground mt-4 text-center">
            {odometerTotalKm !== null 
              ? 'Based on odometer readings (CRA compliant)'
              : 'Based on logged trips only — add odometer readings for CRA compliance'}
          </p>
        </CardContent>
      </Card>

      {/* Odometer Tracking */}
      <OdometerCard year={currentYear} />

      {/* KM Estimation */}
      <KmEstimationCard year={currentYear} />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 my-4 sm:my-6">
        <StatCard
          title="Business KM"
          value={tripStats.businessKilometres.toFixed(0)}
          subtitle={`${tripStats.businessTrips} trips`}
          icon={Briefcase}
          variant="primary"
          onClick={() => setShowBusinessKm(true)}
        />
        <StatCard
          title="Total KM"
          value={odometerTotalKm !== null ? odometerTotalKm.toFixed(0) : tripStats.totalKilometres.toFixed(0)}
          subtitle={odometerTotalKm !== null ? 'From odometer' : `${tripStats.totalTrips} trips`}
          icon={Car}
          onClick={() => setShowTotalKm(true)}
        />
        <StatCard
          title="Expenses"
          value={`$${expenseStats.totalAmount.toFixed(0)}`}
          subtitle={`${expenseStats.totalExpenses} items`}
          icon={Receipt}
          variant="warning"
          onClick={() => setShowExpenses(true)}
        />
        <StatCard
          title="Deductible"
          value={`$${(expenseStats.totalAmount * (businessPercentage / 100)).toFixed(0)}`}
          subtitle="Estimated"
          icon={TrendingUp}
          variant="success"
          onClick={() => setShowDeductible(true)}
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

      {/* Detail Dialogs */}
      <KmDetailView
        open={showBusinessKm}
        onOpenChange={setShowBusinessKm}
        trips={trips}
        type="business"
        year={currentYear}
      />
      <KmDetailView
        open={showTotalKm}
        onOpenChange={setShowTotalKm}
        trips={trips}
        type="total"
        year={currentYear}
      />
      <ExpenseDetailView
        open={showExpenses}
        onOpenChange={setShowExpenses}
        expenses={expenses}
        year={currentYear}
        businessPercentage={businessPercentage}
      />
      <ExpenseDetailView
        open={showDeductible}
        onOpenChange={setShowDeductible}
        expenses={expenses}
        year={currentYear}
        businessPercentage={businessPercentage}
        isDeductible
      />
    </AppLayout>
  );
}
