import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { TripCard } from '@/components/trips/TripCard';
import { AddTripDialog } from '@/components/trips/AddTripDialog';
import { useTrips } from '@/hooks/useTrips';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export default function Trips() {
  const { trips, addTrip, categorizeTrip, deleteTrip, getUncategorizedTrips } = useTrips();
  const [activeTab, setActiveTab] = useState('uncategorized');

  const uncategorizedTrips = getUncategorizedTrips();
  const categorizedTrips = trips.filter((t) => t.category !== 'uncategorized');

  const handleCategorize = (id: string, category: 'business' | 'personal') => {
    categorizeTrip(id, category);
    toast.success(`Trip marked as ${category}`);
  };

  const handleDelete = (id: string) => {
    deleteTrip(id);
    toast.success('Trip deleted');
  };

  const handleAddTrip = (tripData: Parameters<typeof addTrip>[0]) => {
    addTrip(tripData);
    toast.success('Trip added successfully');
    setActiveTab('uncategorized');
  };

  return (
    <AppLayout>
      <PageHeader
        title="Mileage Tracker"
        subtitle="CRA-compliant trip log"
        action={<AddTripDialog onAdd={handleAddTrip} />}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="uncategorized" className="relative">
            Review
            {uncategorizedTrips.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-warning text-warning-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {uncategorizedTrips.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Trips</TabsTrigger>
        </TabsList>

        <TabsContent value="uncategorized" className="space-y-3">
          {uncategorizedTrips.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No trips to review</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a new trip to get started
              </p>
            </div>
          ) : (
            uncategorizedTrips.map((trip, index) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onCategorize={handleCategorize}
                showSwipeHint={index === 0}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-3">
          {categorizedTrips.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No categorized trips yet</p>
            </div>
          ) : (
            categorizedTrips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onDelete={handleDelete}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
