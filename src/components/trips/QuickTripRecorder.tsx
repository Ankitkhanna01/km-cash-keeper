import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Play, Square, MapPin, Plus, Clock, Loader2, Navigation, MessageSquare, Check, Pencil, SkipForward } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calculateTotalDistance } from './AddressAutocomplete';
import { getLocalDateString, getLocalTimeString } from '@/lib/dateUtils';
import { TripPurposeDialog, TripPurpose, DeliveryCompany } from './TripPurposeDialog';
import { NearbyPlacesSuggestions } from './NearbyPlacesSuggestions';
import { EndLocationPicker } from './EndLocationPicker';
import { LiveTripMap } from './LiveTripMap';
import { getOSRMRouteDistance } from '@/lib/routeDistance';

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
    company?: string | null;
    start_lat?: number;
    start_lon?: number;
    end_lat?: number;
    end_lon?: number;
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
  const [isEditingComments, setIsEditingComments] = useState(false);
  const [showPurposeDialog, setShowPurposeDialog] = useState(false);
  const [pendingEndLocation, setPendingEndLocation] = useState<StopLocation | null>(null);
  const lastWaypointTime = useRef<number>(0);
  const startTimestamp = useRef<number>(0);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lon: number } | null>(null);
  
  // Nearby places state
  const [showStartNearby, setShowStartNearby] = useState(false);
  const [showEndNearby, setShowEndNearby] = useState(false);
  const [showStopNearby, setShowStopNearby] = useState(false);
  const [pendingStartCoords, setPendingStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingStartTime, setPendingStartTime] = useState<string>('');
  const [pendingStopLocation, setPendingStopLocation] = useState<StopLocation | null>(null);
  
  // End location nearby places state (shown after purpose selection)
  const [showEndLocationPicker, setShowEndLocationPicker] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState<TripPurpose | null>(null);
  const [selectedCustomReason, setSelectedCustomReason] = useState<string | undefined>();
  const [selectedCompany, setSelectedCompany] = useState<DeliveryCompany>(null);

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

  // Continuous GPS tracking while recording
  useEffect(() => {
    if (!isRecording || !startLocation || !navigator.geolocation) return;

    let watchId: number;
    let lastLat = startLocation.lat;
    let lastLon = startLocation.lon;
    
    // Calculate distance between two points (in meters)
    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371000; // Earth's radius in meters
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const handlePosition = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      
      // Always update current position for map
      setCurrentPosition({ lat: latitude, lon: longitude });
      
      // Only add waypoint if moved more than 50 meters from last point
      const distance = getDistance(lastLat, lastLon, latitude, longitude);
      if (distance > 50) {
        lastLat = latitude;
        lastLon = longitude;
        
        setWaypoints(prev => {
          // Prevent duplicates
          const lastWp = prev[prev.length - 1];
          if (lastWp && Math.abs(lastWp.lat - latitude) < 0.0001 && Math.abs(lastWp.lon - longitude) < 0.0001) {
            return prev;
          }
          return [...prev, {
            lat: latitude,
            lon: longitude,
            time: getLocalTimeString(),
          }];
        });
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.log('GPS tracking error:', error.message);
    };

    // Start watching position with high accuracy
    watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 10000, // Accept positions up to 10 seconds old
      }
    );

    console.log('Started continuous GPS tracking');

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        console.log('Stopped GPS tracking');
      }
    };
  }, [isRecording, startLocation]);

  // Auto-capture GPS when app becomes visible during recording (backup method)
  const captureWaypoint = useCallback(async () => {
    if (!navigator.geolocation) return;
    
    // Throttle: at least 30 seconds between manual captures
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
      
      setWaypoints(prev => {
        // Check if this point is already captured by continuous tracking
        const lastWp = prev[prev.length - 1];
        if (lastWp && Math.abs(lastWp.lat - latitude) < 0.0005 && Math.abs(lastWp.lon - longitude) < 0.0005) {
          return prev; // Skip duplicate
        }
        return [...prev, {
          lat: latitude,
          lon: longitude,
          time: getLocalTimeString(),
        }];
      });
    } catch (error) {
      // Silent fail for auto-capture
      console.log('Auto waypoint capture skipped:', error);
    }
  }, []);

  // Listen for visibility changes when recording (backup for when continuous tracking pauses)
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

  const handlePurposeSelected = (purpose: TripPurpose, customReason?: string, company?: DeliveryCompany) => {
    if (!pendingEndLocation || !startLocation) return;

    setShowPurposeDialog(false);
    
    // Store purpose, company, and show end location picker
    setSelectedPurpose(purpose);
    setSelectedCustomReason(customReason);
    setSelectedCompany(company || null);
    setShowEndLocationPicker(true);
  };

  const handleEndLocationConfirmed = async (finalEndLocation: StopLocation, shouldChainTrip: boolean = false) => {
    console.log('handleEndLocationConfirmed called', { shouldChainTrip, selectedPurpose, finalEndLocation: finalEndLocation.address });
    if (!startLocation || !selectedPurpose) {
      console.log('Missing data', { startLocation: !!startLocation, selectedPurpose });
      return;
    }

    setShowEndLocationPicker(false);

    // Build coordinates including waypoints for more accurate distance
    const allCoords = [
      { lat: startLocation.lat, lon: startLocation.lon },
      ...waypoints.map(w => ({ lat: w.lat, lon: w.lon })),
      ...stops.map(s => ({ lat: s.lat, lon: s.lon })),
      { lat: finalEndLocation.lat, lon: finalEndLocation.lon },
    ];

    // Try OSRM for real driving distance, fall back to haversine
    let kilometres: number;
    const osrmResult = await getOSRMRouteDistance(allCoords);
    if (osrmResult) {
      kilometres = osrmResult.distanceKm;
      console.log(`OSRM route distance: ${kilometres} km (haversine would be ${calculateTotalDistance(allCoords)} km)`);
    } else {
      kilometres = calculateTotalDistance(allCoords);
      console.log(`Using haversine fallback: ${kilometres} km`);
    }

    // Build end location string
    const allStopAddresses = [...stops.map(s => s.address), finalEndLocation.address];
    const endLocationStr = allStopAddresses.length > 1
      ? allStopAddresses.join(' → ')
      : finalEndLocation.address;

    // Build notes with purpose and comments
    const purposeText = selectedPurpose === 'other' && selectedCustomReason 
      ? selectedCustomReason 
      : PURPOSE_LABELS[selectedPurpose];
    const notesText = comments.trim() 
      ? `${purposeText} | ${comments.trim()}`
      : purposeText;

    onTripComplete({
      date: getLocalDateString(),
      start_time: startLocation.time,
      end_time: finalEndLocation.time,
      start_location: startLocation.address,
      end_location: endLocationStr,
      kilometres,
      category: 'uncategorized',
      waypoints: waypoints,
      notes: notesText,
      company: selectedCompany,
      start_lat: startLocation.lat,
      start_lon: startLocation.lon,
      end_lat: finalEndLocation.lat,
      end_lon: finalEndLocation.lon,
    });

    // Check if we should chain a new trip (for pickup/dropoff)
    console.log('Checking chain trip', { shouldChainTrip, selectedPurpose, isPickupOrDropoff: selectedPurpose === 'pickup' || selectedPurpose === 'dropoff' });
    if (shouldChainTrip && (selectedPurpose === 'pickup' || selectedPurpose === 'dropoff')) {
      console.log('Starting chained trip from:', finalEndLocation.address);
      // Start a new trip from the same location
      const newStartLocation: StopLocation = {
        address: finalEndLocation.address,
        lat: finalEndLocation.lat,
        lon: finalEndLocation.lon,
        time: getLocalTimeString(),
      };
      
      setStartLocation(newStartLocation);
      setStops([]);
      setWaypoints([]);
      setElapsedTime(0);
      setComments('');
      setPendingEndLocation(null);
      setShowCommentsField(false);
      setSelectedPurpose(null);
      setSelectedCustomReason(undefined);
      lastWaypointTime.current = Date.now();
      startTimestamp.current = Date.now();
      setIsRecording(true);
      
      // Persist the new trip state
      const state: PersistedTripState = {
        isRecording: true,
        startLocation: newStartLocation,
        stops: [],
        waypoints: [],
        comments: '',
        startTimestamp: startTimestamp.current,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      
      toast.success('Trip recorded! New trip started from same location.');
    } else {
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
      setSelectedPurpose(null);
      setSelectedCustomReason(undefined);
      setSelectedCompany(null);
      toast.success(`Trip recorded with ${waypoints.length} route points!`);
    }
  };

  const handleSkipEndLocationPicker = () => {
    if (pendingEndLocation) {
      handleEndLocationConfirmed(pendingEndLocation, false);
    }
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
    setSelectedPurpose(null);
    setSelectedCustomReason(undefined);
    setSelectedCompany(null);
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

          {/* GPS Tracking indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            <Navigation className="w-3 h-3 text-green-500 animate-pulse" />
            <span>GPS tracking active</span>
            {waypoints.length > 0 && (
              <span className="text-primary font-medium">• {waypoints.length} point{waypoints.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Live Map */}
          {startLocation && (
            <LiveTripMap
              startLocation={startLocation}
              stops={stops}
              waypoints={waypoints}
              currentLat={currentPosition?.lat}
              currentLon={currentPosition?.lon}
              onManualWaypointAdd={(lat, lon) => {
                setWaypoints(prev => [...prev, {
                  lat,
                  lon,
                  time: getLocalTimeString(),
                }]);
              }}
            />
          )}

          {/* Start Location */}
          <div className="space-y-1">
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Started at {startLocation?.time}</p>
                <p className="line-clamp-2">{startLocation?.address}</p>
              </div>
            </div>
            {startLocation && (
              <NearbyPlacesSuggestions
                lat={startLocation.lat}
                lon={startLocation.lon}
                baseAddress={startLocation.address}
                onSelect={(place) => {
                  setStartLocation({
                    ...startLocation,
                    address: place.name ? `${place.name}, ${place.address}` : place.address,
                    lat: place.lat,
                    lon: place.lon,
                  });
                  toast.success('Start location updated');
                }}
                className="ml-6"
              />
            )}
          </div>

          {/* Stops */}
          {stops.map((stop, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-start gap-2 text-sm pl-1">
                <div className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Stop {index + 1} at {stop.time}</p>
                  <p className="line-clamp-2">{stop.address}</p>
                </div>
              </div>
              <NearbyPlacesSuggestions
                lat={stop.lat}
                lon={stop.lon}
                baseAddress={stop.address}
                onSelect={(place) => {
                  const newStops = [...stops];
                  newStops[index] = {
                    ...stop,
                    address: place.name ? `${place.name}, ${place.address}` : place.address,
                    lat: place.lat,
                    lon: place.lon,
                  };
                  setStops(newStops);
                  toast.success(`Stop ${index + 1} updated`);
                }}
                className="ml-4"
              />
            </div>
          ))}

          {/* Comments toggle and field */}
          {!showCommentsField ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCommentsField(true);
                setIsEditingComments(true);
              }}
              className="w-full gap-2 text-muted-foreground"
            >
              <MessageSquare className="w-4 h-4" />
              Add comments
            </Button>
          ) : isEditingComments ? (
            <div className="flex gap-2 items-start">
              <Textarea
                placeholder="Add notes about this trip..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="min-h-[60px] text-sm flex-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditingComments(false)}
                className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-100"
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 items-start">
              <div className="flex-1 text-sm text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                {comments || <span className="italic">No comments</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditingComments(true)}
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-3 h-3" />
              </Button>
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

      {showEndLocationPicker && pendingEndLocation && selectedPurpose && (
        <EndLocationPicker
          open={showEndLocationPicker}
          endLocation={pendingEndLocation}
          purpose={selectedPurpose}
          onSelect={(place, chainTrip) => {
            const updatedLocation: StopLocation = {
              address: place.name ? `${place.name}, ${place.address}` : place.address,
              lat: place.lat,
              lon: place.lon,
              time: pendingEndLocation.time,
            };
            handleEndLocationConfirmed(updatedLocation, chainTrip);
          }}
          onSkip={handleSkipEndLocationPicker}
        />
      )}
    </>
  );
}
