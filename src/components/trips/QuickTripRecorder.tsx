import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Square, MapPin, Plus, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { calculateTotalDistance } from './AddressAutocomplete';
import { getLocalDateString, getLocalTimeString } from '@/lib/dateUtils';

interface StopLocation {
  address: string;
  lat: number;
  lon: number;
  time: string;
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
  }) => void;
}

export function QuickTripRecorder({ onTripComplete }: QuickTripRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [startLocation, setStartLocation] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

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

  const formatElapsedTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentLocation = async (): Promise<StopLocation | null> => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return null;
    }

    setGettingLocation(true);

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
    } catch (error: any) {
      console.error('Location error:', error);
      if (error.code === 1) {
        toast.error('Location permission denied');
      } else if (error.code === 2) {
        toast.error('Unable to determine location');
      } else {
        toast.error('Failed to get location');
      }
      return null;
    } finally {
      setGettingLocation(false);
    }
  };

  const handleStartTrip = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setStartLocation(location);
      setStops([]);
      setElapsedTime(0);
      setIsRecording(true);
      toast.success('Trip started!');
    }
  };

  const handleAddStop = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setStops(prev => [...prev, location]);
      toast.success(`Stop ${stops.length + 1} added`);
    }
  };

  const handleEndTrip = async () => {
    const endLocation = await getCurrentLocation();
    if (!endLocation || !startLocation) return;

    // Calculate total distance
    const allCoords = [
      { lat: startLocation.lat, lon: startLocation.lon },
      ...stops.map(s => ({ lat: s.lat, lon: s.lon })),
      { lat: endLocation.lat, lon: endLocation.lon },
    ];

    const kilometres = calculateTotalDistance(allCoords);

    // Build end location string
    const allStopAddresses = [...stops.map(s => s.address), endLocation.address];
    const endLocationStr = allStopAddresses.length > 1
      ? allStopAddresses.join(' → ')
      : endLocation.address;

    onTripComplete({
      date: getLocalDateString(),
      start_time: startLocation.time,
      end_time: endLocation.time,
      start_location: startLocation.address,
      end_location: endLocationStr,
      kilometres,
      category: 'uncategorized',
    });

    // Reset state
    setIsRecording(false);
    setStartLocation(null);
    setStops([]);
    setElapsedTime(0);
    toast.success('Trip recorded!');
  };

  const handleCancelTrip = () => {
    setIsRecording(false);
    setStartLocation(null);
    setStops([]);
    setElapsedTime(0);
    toast.info('Trip cancelled');
  };

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
  );
}
