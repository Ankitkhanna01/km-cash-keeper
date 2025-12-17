import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { TripCard } from '@/components/trips/TripCard';
import { AddTripDialog } from '@/components/trips/AddTripDialog';
import { QuickTripRecorder } from '@/components/trips/QuickTripRecorder';
import { AdjustDailyKmDialog } from '@/components/trips/AdjustDailyKmDialog';
import { TripTimeline } from '@/components/trips/TripTimeline';
import { useTripsDB, Trip as DBTrip } from '@/hooks/useTripsDB';
import { Trip as ComponentTrip } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Trips() {
  const { trips, loading, addTrip, updateTrip, categorizeTrip, deleteTrip, getUncategorizedTrips } = useTripsDB();
  const [activeTab, setActiveTab] = useState('uncategorized');

  const uncategorizedTrips = getUncategorizedTrips();
  const categorizedTrips = trips.filter((t) => t.category !== 'uncategorized');

  const handleCategorize = async (id: string, category: 'business' | 'personal', notes?: string) => {
    if (notes) {
      await updateTrip(id, { category, notes });
    } else {
      await categorizeTrip(id, category);
    }
    toast.success(`Trip marked as ${category}`);
  };

  const handleDelete = async (id: string) => {
    await deleteTrip(id);
    toast.success('Trip deleted');
  };

  const handleUpdate = async (id: string, updates: Partial<ComponentTrip>) => {
    // Map from component format (camelCase) to DB format (snake_case)
    const dbUpdates: Partial<DBTrip> = {};
    if (updates.kilometres !== undefined) dbUpdates.kilometres = updates.kilometres;
    if (updates.startLocation !== undefined) dbUpdates.start_location = updates.startLocation;
    if (updates.endLocation !== undefined) dbUpdates.end_location = updates.endLocation;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.startTime !== undefined) dbUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) dbUpdates.end_time = updates.endTime;
    
    await updateTrip(id, dbUpdates);
    toast.success('Trip updated');
  };

  const handleAdjustmentsApplied = async (updates: Array<{ id: string; kilometres: number; start_location?: string }>) => {
    for (const update of updates) {
      const tripUpdate: Partial<DBTrip> = { kilometres: update.kilometres };
      if (update.start_location) {
        tripUpdate.start_location = update.start_location;
      }
      await updateTrip(update.id, tripUpdate);
    }
  };

  const handleAddTrip = async (tripData: {
    date: string;
    start_time: string;
    end_time: string;
    start_location: string;
    end_location: string;
    kilometres: number;
    category: 'business' | 'personal' | 'uncategorized';
  }) => {
    const result = await addTrip(tripData);
    if (result) {
      toast.success('Trip added successfully');
      setActiveTab('uncategorized');
    }
  };

  // Convert DB trip format to component format
  const mapTripForCard = (trip: DBTrip): ComponentTrip => ({
    id: trip.id,
    date: trip.date,
    startTime: trip.start_time,
    endTime: trip.end_time,
    startLocation: trip.start_location,
    endLocation: trip.end_location,
    kilometres: trip.kilometres,
    category: trip.category,
    createdAt: trip.created_at,
    notes: trip.notes,
  });

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
        title="Mileage Tracker"
        subtitle="CRA-compliant trip log"
        action={<AddTripDialog onAdd={handleAddTrip} />}
      />

      {/* Quick Trip Recorder */}
      <div className="mb-4 space-y-3">
        <QuickTripRecorder onTripComplete={handleAddTrip} />
        <div className="flex justify-end">
          <AdjustDailyKmDialog trips={trips} onAdjustmentsApplied={handleAdjustmentsApplied} />
        </div>
      </div>

      {/* Trip Timeline */}
      <div className="mb-4">
        <TripTimeline 
          trips={trips} 
          onUpdate={async (id, updates) => {
            const dbUpdates: Partial<DBTrip> = { ...updates };
            await updateTrip(id, dbUpdates);
            toast.success('Trip updated');
          }}
          onCreate={async (tripData) => {
            await addTrip(tripData);
            toast.success('Trip created from gap');
          }}
        />
      </div>

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
              <p className="text-sm text-muted-foreground mt-1">Add a new trip to get started</p>
            </div>
          ) : (
            uncategorizedTrips.map((trip, index) => (
              <TripCard
                key={trip.id}
                trip={mapTripForCard(trip)}
                onCategorize={handleCategorize}
                onUpdate={handleUpdate}
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
              <TripCard key={trip.id} trip={mapTripForCard(trip)} onDelete={handleDelete} onUpdate={handleUpdate} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
