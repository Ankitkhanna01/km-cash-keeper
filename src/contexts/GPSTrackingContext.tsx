import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useGPSTracking, TripData } from '@/hooks/useGPSTracking';
import { useTripsDB } from '@/hooks/useTripsDB';
import { TrackingBubble } from '@/components/tracking/TrackingBubble';
import { TripCompletionCard } from '@/components/tracking/TripCompletionCard';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface GPSTrackingContextType {
  isTracking: boolean;
  tripInProgress: boolean;
  showBubble: boolean;
  setShowBubble: (show: boolean) => void;
  startTracking: () => void;
  stopTracking: () => void;
}

const GPSTrackingContext = createContext<GPSTrackingContextType | undefined>(undefined);

export function GPSTrackingProvider({ children }: { children: ReactNode }) {
  const [showBubble, setShowBubble] = useState(false);
  const {
    isTracking,
    tripInProgress,
    completedTrip,
    totalDistance,
    startTracking,
    stopTracking,
    dismissTrip,
    error,
  } = useGPSTracking();
  const { addTrip } = useTripsDB();

  const handleToggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
      toast.success('GPS tracking started');
    }
  }, [isTracking, startTracking, stopTracking]);

  const handleCloseBubble = useCallback(() => {
    if (isTracking) {
      stopTracking();
    }
    setShowBubble(false);
  }, [isTracking, stopTracking]);

  const handleCategorize = useCallback(
    async (category: 'business' | 'personal') => {
      if (!completedTrip) return;

      const tripData = {
        date: format(completedTrip.startTime, 'yyyy-MM-dd'),
        start_time: format(completedTrip.startTime, 'HH:mm'),
        end_time: format(completedTrip.endTime, 'HH:mm'),
        start_location: `${completedTrip.startLocation.latitude.toFixed(6)}, ${completedTrip.startLocation.longitude.toFixed(6)}`,
        end_location: `${completedTrip.endLocation.latitude.toFixed(6)}, ${completedTrip.endLocation.longitude.toFixed(6)}`,
        kilometres: completedTrip.totalKilometres,
        category,
      };

      await addTrip(tripData);
      toast.success(`Trip saved as ${category}`);
      dismissTrip();
    },
    [completedTrip, addTrip, dismissTrip]
  );

  const handleDismissTrip = useCallback(() => {
    dismissTrip();
    toast.info('Trip dismissed');
  }, [dismissTrip]);

  return (
    <GPSTrackingContext.Provider
      value={{
        isTracking,
        tripInProgress,
        showBubble,
        setShowBubble,
        startTracking: handleToggleTracking,
        stopTracking,
      }}
    >
      {children}
      
      {/* Floating tracking bubble */}
      {showBubble && (
        <TrackingBubble
          isTracking={isTracking}
          tripInProgress={tripInProgress}
          totalDistance={totalDistance}
          onToggleTracking={handleToggleTracking}
          onClose={handleCloseBubble}
          error={error}
        />
      )}

      {/* Trip completion modal */}
      {completedTrip && (
        <TripCompletionCard
          trip={completedTrip}
          onCategorize={handleCategorize}
          onDismiss={handleDismissTrip}
        />
      )}
    </GPSTrackingContext.Provider>
  );
}

export function useGPSTrackingContext() {
  const context = useContext(GPSTrackingContext);
  if (!context) {
    throw new Error('useGPSTrackingContext must be used within a GPSTrackingProvider');
  }
  return context;
}
