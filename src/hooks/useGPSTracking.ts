import { useState, useEffect, useRef, useCallback } from 'react';

export interface GPSPosition {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

export interface TripData {
  startLocation: GPSPosition;
  endLocation: GPSPosition;
  startTime: Date;
  endTime: Date;
  totalKilometres: number;
  positions: GPSPosition[];
}

interface UseGPSTrackingReturn {
  isTracking: boolean;
  currentPosition: GPSPosition | null;
  tripInProgress: boolean;
  completedTrip: TripData | null;
  totalDistance: number;
  startTracking: () => void;
  stopTracking: () => void;
  dismissTrip: () => void;
  error: string | null;
}

const STATIONARY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MOVEMENT_THRESHOLD_METERS = 50; // Minimum movement to consider "moving"
const POSITION_UPDATE_INTERVAL = 5000; // 5 seconds

// Haversine formula for distance calculation
function calculateDistance(pos1: GPSPosition, pos2: GPSPosition): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
  const dLon = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos1.latitude * Math.PI) / 180) *
      Math.cos((pos2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

export function useGPSTracking(): UseGPSTrackingReturn {
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GPSPosition | null>(null);
  const [tripInProgress, setTripInProgress] = useState(false);
  const [completedTrip, setCompletedTrip] = useState<TripData | null>(null);
  const [totalDistance, setTotalDistance] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const positionsRef = useRef<GPSPosition[]>([]);
  const lastMovementTimeRef = useRef<number>(Date.now());
  const tripStartTimeRef = useRef<Date | null>(null);
  const stationaryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStationaryRef = useRef(true);

  const endTrip = useCallback(() => {
    if (positionsRef.current.length < 2) return;

    const positions = positionsRef.current;
    const startPos = positions[0];
    const endPos = positions[positions.length - 1];

    // Calculate total distance
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      total += calculateDistance(positions[i - 1], positions[i]);
    }

    const trip: TripData = {
      startLocation: startPos,
      endLocation: endPos,
      startTime: tripStartTimeRef.current || new Date(startPos.timestamp),
      endTime: new Date(endPos.timestamp),
      totalKilometres: total,
      positions: [...positions],
    };

    setCompletedTrip(trip);
    setTripInProgress(false);
    setTotalDistance(0);
    positionsRef.current = [];
    tripStartTimeRef.current = null;
    isStationaryRef.current = true;
  }, []);

  const checkStationary = useCallback(() => {
    const now = Date.now();
    const timeSinceLastMovement = now - lastMovementTimeRef.current;

    if (timeSinceLastMovement >= STATIONARY_TIMEOUT_MS && tripInProgress) {
      endTrip();
    }
  }, [tripInProgress, endTrip]);

  const handlePositionUpdate = useCallback(
    (position: GeolocationPosition) => {
      const newPos: GPSPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: position.timestamp,
        accuracy: position.coords.accuracy,
      };

      setCurrentPosition(newPos);
      setError(null);

      // Check if we're moving
      if (positionsRef.current.length > 0) {
        const lastPos = positionsRef.current[positionsRef.current.length - 1];
        const distanceMoved = calculateDistance(lastPos, newPos) * 1000; // Convert to meters

        if (distanceMoved > MOVEMENT_THRESHOLD_METERS) {
          lastMovementTimeRef.current = Date.now();

          // Start trip if not already in progress
          if (!tripInProgress && isStationaryRef.current) {
            setTripInProgress(true);
            tripStartTimeRef.current = new Date();
            isStationaryRef.current = false;
            positionsRef.current = [newPos];
            setTotalDistance(0);
          } else if (tripInProgress) {
            positionsRef.current.push(newPos);
            
            // Update total distance
            let total = 0;
            for (let i = 1; i < positionsRef.current.length; i++) {
              total += calculateDistance(positionsRef.current[i - 1], positionsRef.current[i]);
            }
            setTotalDistance(total);
          }
        }
      } else {
        // First position - store it
        positionsRef.current = [newPos];
        lastMovementTimeRef.current = Date.now();
      }
    },
    [tripInProgress]
  );

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    console.error('GPS Error:', err);
    switch (err.code) {
      case err.PERMISSION_DENIED:
        setError('Location permission denied. Please enable location access.');
        break;
      case err.POSITION_UNAVAILABLE:
        setError('Location unavailable. Please check your GPS.');
        break;
      case err.TIMEOUT:
        setError('Location request timed out. Retrying...');
        break;
      default:
        setError('Unable to get location.');
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsTracking(true);
    setError(null);
    positionsRef.current = [];
    lastMovementTimeRef.current = Date.now();
    isStationaryRef.current = true;

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      handlePositionUpdate,
      handlePositionError,
      options
    );

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      options
    );

    // Start stationary check timer
    stationaryTimerRef.current = setInterval(checkStationary, POSITION_UPDATE_INTERVAL);
  }, [handlePositionUpdate, handlePositionError, checkStationary]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (stationaryTimerRef.current) {
      clearInterval(stationaryTimerRef.current);
      stationaryTimerRef.current = null;
    }

    // End any in-progress trip
    if (tripInProgress && positionsRef.current.length >= 2) {
      endTrip();
    }

    setIsTracking(false);
    setTripInProgress(false);
    setTotalDistance(0);
    positionsRef.current = [];
  }, [tripInProgress, endTrip]);

  const dismissTrip = useCallback(() => {
    setCompletedTrip(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (stationaryTimerRef.current) {
        clearInterval(stationaryTimerRef.current);
      }
    };
  }, []);

  // Keep checking for stationary state when trip is in progress
  useEffect(() => {
    if (tripInProgress && !stationaryTimerRef.current) {
      stationaryTimerRef.current = setInterval(checkStationary, POSITION_UPDATE_INTERVAL);
    }
    return () => {
      if (stationaryTimerRef.current && !tripInProgress) {
        clearInterval(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }
    };
  }, [tripInProgress, checkStationary]);

  return {
    isTracking,
    currentPosition,
    tripInProgress,
    completedTrip,
    totalDistance,
    startTracking,
    stopTracking,
    dismissTrip,
    error,
  };
}
