import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Play, Square, MapPin, Plus, Clock, Loader2, Navigation, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calculateTotalDistance } from './AddressAutocomplete';
import { getLocalDateString, getLocalTimeString } from '@/lib/dateUtils';
import { TripPurposeDialog, TripPurpose } from './TripPurposeDialog';
// NearbyPlacesSuggestions disabled for now

interface StopLocation {
  address: string;
  lat: number;
  lon: number;
  time: string;
}

interface Waypoint {
  lat: number;
  lon: number;
  time: string;
}

interface NearbyPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: 'restaurant' | 'residential' | 'other';
}

interface QuickTripRecorderProps {
  onTripComplete: (trip: {
    date: string;
    start_time: string;
    end_time: string;
    start_location: string;
    end_location: string;
    kilometres: number;
    category: 'business' | 'personal' | 'uncategorized';
    waypoints?: Waypoint[];
    notes?: string;
  }) => void;
}

const PURPOSE_LABELS: Record<TripPurpose, string> = {
  pickup: 'Picking up food',
  dropoff: 'Dropping off delivery',
  hotzone: 'Going to hot zone',
  other: 'Other',
};

const STORAGE_KEY = 'quickTripRecording';

interface PersistedTripState {
  isRecording: boolean;
  startLocation: StopLocation | null;
  stops: StopLocation[];
  waypoints: Waypoint[];
  comments: string;
  startTimestamp: number;
}

export function QuickTripRecorder({ onTripComplete }: QuickTripRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [startLocation, setStartLocation] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [comments, setComments] = useState('');
  const [showCommentsField, setShowCommentsField] = useState(false);
  const [showPurposeDialog, setShowPurposeDialog] = useState(false);
  const [pendingEndLocation, setPendingEndLocation] = useState<StopLocation | null>(null);
  const lastWaypointTime = useRef<number>(0);
  const startTimestamp = useRef<number>(0);
  
  // Nearby places state
  const [showStartNearby, setShowStartNearby] = useState(false);
  const [showEndNearby, setShowEndNearby] = useState(false);
  const [showStopNearby, setShowStopNearby] = useState(false);
  const [pendingStartCoords, setPendingStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingStartTime, setPendingStartTime] = useState<string>('');
  const [pendingStopLocation, setPendingStopLocation] = useState<StopLocation | null>(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: PersistedTripState = JSON.parse(saved);
        if (state.isRecording && state.startLocation) {
          setIsRecording(true);
          setStartLocation(state.startLocation);
          setStops(state.stops || []);
          setWaypoints(state.waypoints || []);
          setComments(state.comments || '');
          startTimestamp.current = state.startTimestamp;
          lastWaypointTime.current = Date.now();
          // Calculate elapsed time from when trip started
          const elapsed = Math.floor((Date.now() - state.startTimestamp) / 1000);
          setElapsedTime(elapsed);
        }
      }
    } catch (e) {
      console.error('Failed to load trip state:', e);
    }
  }, []);

  // Persist state when recording changes
  useEffect(() => {
    if (isRecording && startLocation) {
      const state: PersistedTripState = {
        isRecording,
        startLocation,
        stops,
        waypoints,
        comments,
        startTimestamp: startTimestamp.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [isRecording, startLocation, stops, waypoints, comments]);

  const clearPersistedState = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && startLocation) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, startLocation]);

  // Auto-capture GPS when app becomes visible during recording
  const captureWaypoint = useCallback(async () => {
    if (!navigator.geolocation) return;
    
    // Throttle: at least 30 seconds between auto-captures
    const now = Date.now();
    if (now - lastWaypointTime.current < 30000) return;
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        });
      });

      const { latitude, longitude } = position.coords;
      lastWaypointTime.current = now;
      
      setWaypoints(prev => [...prev, {
        lat: latitude,
        lon: longitude,
        time: getLocalTimeString(),
      }]);
      
      // Subtle feedback
      toast.success('Route point captured', { duration: 1500 });
    } catch (error) {
      // Silent fail for auto-capture
      console.log('Auto waypoint capture skipped:', error);
    }
  }, []);

  // Listen for visibility changes when recording
  useEffect(() => {
    if (!isRecording) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        captureWaypoint();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRecording, captureWaypoint]);

  const formatElapsedTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentLocation = async (silent = false): Promise<StopLocation | null> => {
    if (!navigator.geolocation) {
      if (!silent) toast.error('Geolocation not supported');
      return null;
    }

    if (!silent) setGettingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: latitude, lon: longitude },
      });

      if (error) throw error;

      const address = data.address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

      return {
        address,
        lat: latitude,
        lon: longitude,
        time: getLocalTimeString(),
      };
    } catch (error: unknown) {
      console.error('Location error:', error);
      if (!silent) {
        const geoError = error as GeolocationPositionError;
        if (geoError.code === 1) {
          toast.error('Location permission denied');
        } else if (geoError.code === 2) {
          toast.error('Unable to determine location');
        } else {
          toast.error('Failed to get location');
        }
      }
      return null;
    } finally {
      if (!silent) setGettingLocation(false);
    }
  };

  const handleStartTrip = async () => {
    const location = await getCurrentLocation();
    if (location) {
      // Nearby places disabled - start recording immediately
      setStartLocation(location);
      startRecording();
    }
  };

  const handleStartNearbySelect = (place: NearbyPlace) => {
    setShowStartNearby(false);
    const location: StopLocation = {
      address: place.name ? `${place.name}, ${place.address}` : place.address,
      lat: place.lat,
      lon: place.lon,
      time: pendingStartTime,
    };
    setStartLocation(location);
    startRecording();
  };

  const handleStartNearbyClose = () => {
    setShowStartNearby(false);
    startRecording();
  };

  const startRecording = () => {
    setStops([]);
    setWaypoints([]);
    setElapsedTime(0);
    setComments('');
    lastWaypointTime.current = Date.now();
    startTimestamp.current = Date.now();
    setIsRecording(true);
    setPendingStartCoords(null);
    toast.success('Trip started! Open app anytime to track your route.');
  };

  const handleAddStop = async () => {
    const location = await getCurrentLocation();
    if (location) {
      // Nearby places disabled - add stop immediately
      setStops(prev => [...prev, location]);
      toast.success(`Stop ${stops.length + 1} added`);
    }
  };

  const handleStopNearbySelect = (place: NearbyPlace) => {
    setShowStopNearby(false);
    const location: StopLocation = {
      address: place.name ? `${place.name}, ${place.address}` : place.address,
      lat: place.lat,
      lon: place.lon,
      time: pendingStopLocation?.time || getLocalTimeString(),
    };
    setStops(prev => [...prev, location]);
    setPendingStopLocation(null);
    toast.success(`Stop ${stops.length + 1} added`);
  };

  const handleStopNearbyClose = () => {
    setShowStopNearby(false);
    if (pendingStopLocation) {
      setStops(prev => [...prev, pendingStopLocation]);
      toast.success(`Stop ${stops.length + 1} added`);
    }
    setPendingStopLocation(null);
  };

  const handleEndTrip = async () => {
    const endLocation = await getCurrentLocation();
    if (!endLocation || !startLocation) return;

    // Nearby places disabled - go directly to purpose dialog
    setPendingEndLocation(endLocation);
    setShowPurposeDialog(true);
  };

  const handleEndNearbySelect = (place: NearbyPlace) => {
    setShowEndNearby(false);
    const location: StopLocation = {
      address: place.name ? `${place.name}, ${place.address}` : place.address,
      lat: place.lat,
      lon: place.lon,
      time: pendingEndLocation?.time || getLocalTimeString(),
    };
    setPendingEndLocation(location);
    setShowPurposeDialog(true);
  };

  const handleEndNearbyClose = () => {
    setShowEndNearby(false);
    setShowPurposeDialog(true);
  };

  const handlePurposeSelected = (purpose: TripPurpose, customReason?: string) => {
    if (!pendingEndLocation || !startLocation) return;

    setShowPurposeDialog(false);

    // Build coordinates including waypoints for more accurate distance
    const allCoords = [
      { lat: startLocation.lat, lon: startLocation.lon },
      ...waypoints.map(w => ({ lat: w.lat, lon: w.lon })),
      ...stops.map(s => ({ lat: s.lat, lon: s.lon })),
      { lat: pendingEndLocation.lat, lon: pendingEndLocation.lon },
    ];

    const kilometres = calculateTotalDistance(allCoords);

    // Build end location string
    const allStopAddresses = [...stops.map(s => s.address), pendingEndLocation.address];
    const endLocationStr = allStopAddresses.length > 1
      ? allStopAddresses.join(' → ')
      : pendingEndLocation.address;

    // Build notes with purpose and comments
    const purposeText = purpose === 'other' && customReason 
      ? customReason 
      : PURPOSE_LABELS[purpose];
    const notesText = comments.trim() 
      ? `${purposeText} | ${comments.trim()}`
      : purposeText;

    onTripComplete({
      date: getLocalDateString(),
      start_time: startLocation.time,
      end_time: pendingEndLocation.time,
      start_location: startLocation.address,
      end_location: endLocationStr,
      kilometres,
      category: 'uncategorized',
      waypoints: waypoints,
      notes: notesText,
    });

    // Reset state and clear persistence
    clearPersistedState();
    setIsRecording(false);
    setStartLocation(null);
    setStops([]);
    setWaypoints([]);
    setElapsedTime(0);
    setComments('');
    setPendingEndLocation(null);
    setShowCommentsField(false);
    toast.success(`Trip recorded with ${waypoints.length} route points!`);
  };

  const handleCancelTrip = () => {
    clearPersistedState();
    setIsRecording(false);
    setStartLocation(null);
    setStops([]);
    setWaypoints([]);
    setElapsedTime(0);
    setComments('');
    setShowCommentsField(false);
    toast.info('Trip cancelled');
  };

  // Nearby places UI disabled

  if (!isRecording) {
    return (
      <Button
        onClick={handleStartTrip}
        disabled={gettingLocation}
        className="w-full h-14 text-lg font-semibold gap-2 bg-green-600 hover:bg-green-700"
      >
        {gettingLocation ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Getting Location...
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Start Trip
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="p-4 space-y-4">
          {/* Timer and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Recording Trip</span>
            </div>
            <div className="flex items-center gap-1 text-lg font-mono">
              <Clock className="w-4 h-4" />
              {formatElapsedTime(elapsedTime)}
            </div>
          </div>

          {/* Waypoints indicator */}
          {waypoints.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
              <Navigation className="w-3 h-3" />
              <span>{waypoints.length} route point{waypoints.length !== 1 ? 's' : ''} captured</span>
            </div>
          )}

          {/* Start Location */}
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Started at {startLocation?.time}</p>
              <p className="line-clamp-1">{startLocation?.address}</p>
            </div>
          </div>

          {/* Stops */}
          {stops.map((stop, index) => (
            <div key={index} className="flex items-start gap-2 text-sm pl-1">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Stop {index + 1} at {stop.time}</p>
                <p className="line-clamp-1">{stop.address}</p>
              </div>
            </div>
          ))}

          {/* Comments toggle and field */}
          {!showCommentsField ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCommentsField(true)}
              className="w-full gap-2 text-muted-foreground"
            >
              <MessageSquare className="w-4 h-4" />
              Add comments
            </Button>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder="Add notes about this trip..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleAddStop}
              disabled={gettingLocation}
              className="gap-1"
            >
              {gettingLocation ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Stop
            </Button>
            <Button
              onClick={handleEndTrip}
              disabled={gettingLocation}
              className="gap-1 bg-red-600 hover:bg-red-700"
            >
              {gettingLocation ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              End Trip
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelTrip}
            className="w-full text-muted-foreground"
          >
            Cancel Trip
          </Button>
        </CardContent>
      </Card>

      <TripPurposeDialog 
        open={showPurposeDialog} 
        onSelect={handlePurposeSelected}
      />
    </>
  );
}
