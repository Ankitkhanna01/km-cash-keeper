import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Locate, Pencil, X, Route } from 'lucide-react';
import { getRouteDistance, decodePolyline } from '@/lib/routeDistance';

interface Waypoint {
  lat: number;
  lon: number;
  time: string;
}

interface StopLocation {
  address: string;
  lat: number;
  lon: number;
  time: string;
}

interface LiveTripMapProps {
  startLocation: StopLocation;
  stops: StopLocation[];
  waypoints: Waypoint[];
  currentLat?: number;
  currentLon?: number;
  onManualWaypointAdd?: (lat: number, lon: number) => void;
}

// Car icon using SVG
const carIcon = L.divIcon({
  html: `<div style="
    width: 32px; height: 32px;
    background: hsl(142, 71%, 45%);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
  ">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L19 21l-7-4-7 4z"/>
    </svg>
  </div>`,
  className: 'car-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const startIcon = L.divIcon({
  html: `<div style="
    width: 24px; height: 24px;
    background: hsl(142, 71%, 45%);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  className: 'start-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const stopIcon = L.divIcon({
  html: `<div style="
    width: 18px; height: 18px;
    background: hsl(221, 83%, 53%);
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  "></div>`,
  className: 'stop-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function LiveTripMap({
  startLocation,
  stops,
  waypoints,
  currentLat,
  currentLon,
  onManualWaypointAdd,
}: LiveTripMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const carMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const manualLineRef = useRef<L.Polyline | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualPoints, setManualPoints] = useState<L.LatLng[]>([]);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snappedDistance, setSnappedDistance] = useState<number | null>(null);
  const snappedLineRef = useRef<L.Polyline | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [startLocation.lat, startLocation.lon],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Start marker
    L.marker([startLocation.lat, startLocation.lon], { icon: startIcon })
      .addTo(map)
      .bindPopup('Start');

    // Car marker
    const carMarker = L.marker([startLocation.lat, startLocation.lon], { icon: carIcon }).addTo(map);
    carMarkerRef.current = carMarker;

    // Route polyline
    const routeLine = L.polyline([[startLocation.lat, startLocation.lon]], {
      color: '#22c55e',
      weight: 4,
      opacity: 0.8,
      dashArray: '8, 6',
    }).addTo(map);
    routeLineRef.current = routeLine;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      carMarkerRef.current = null;
      routeLineRef.current = null;
    };
  }, []);

  // Update route polyline when waypoints change
  useEffect(() => {
    if (!routeLineRef.current || !startLocation) return;

    const points: L.LatLngExpression[] = [
      [startLocation.lat, startLocation.lon],
      ...waypoints.map(w => [w.lat, w.lon] as L.LatLngExpression),
    ];

    routeLineRef.current.setLatLngs(points);
  }, [waypoints, startLocation]);

  // Update car position
  useEffect(() => {
    if (!carMarkerRef.current || !mapRef.current) return;
    if (currentLat == null || currentLon == null) return;

    carMarkerRef.current.setLatLng([currentLat, currentLon]);

    if (autoFollow) {
      mapRef.current.panTo([currentLat, currentLon], { animate: true, duration: 0.5 });
    }
  }, [currentLat, currentLon, autoFollow]);

  // Update stop markers
  useEffect(() => {
    if (!mapRef.current) return;

    stops.forEach((stop, i) => {
      L.marker([stop.lat, stop.lon], { icon: stopIcon })
        .addTo(mapRef.current!)
        .bindPopup(`Stop ${i + 1}`);
    });
  }, [stops]);

  // Handle manual mode clicks
  useEffect(() => {
    if (!mapRef.current) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!isManualMode) return;
      const { lat, lng } = e.latlng;
      setManualPoints(prev => [...prev, e.latlng]);
      onManualWaypointAdd?.(lat, lng);
    };

    mapRef.current.on('click', handleClick);
    return () => {
      mapRef.current?.off('click', handleClick);
    };
  }, [isManualMode, onManualWaypointAdd]);

  // Draw manual correction line
  useEffect(() => {
    if (!mapRef.current) return;

    if (manualLineRef.current) {
      manualLineRef.current.remove();
      manualLineRef.current = null;
    }

    if (manualPoints.length > 0) {
      manualLineRef.current = L.polyline(manualPoints, {
        color: '#f59e0b',
        weight: 4,
        opacity: 0.9,
      }).addTo(mapRef.current);
    }
  }, [manualPoints]);

  // Disable map dragging auto-follow
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    
    const disableFollow = () => setAutoFollow(false);
    map.on('dragstart', disableFollow);
    return () => {
      map.off('dragstart', disableFollow);
    };
  }, []);

  const handleRecenter = () => {
    if (!mapRef.current) return;
    const lat = currentLat ?? startLocation.lat;
    const lon = currentLon ?? startLocation.lon;
    mapRef.current.panTo([lat, lon], { animate: true });
    setAutoFollow(true);
  };

  const toggleManualMode = () => {
    if (isManualMode) {
      setManualPoints([]);
    }
    setIsManualMode(!isManualMode);
  };

  const handleSnapToRoad = async () => {
    if (waypoints.length < 2) {
      return;
    }
    setIsSnapping(true);
    try {
      const coords = [
        { lat: startLocation.lat, lon: startLocation.lon },
        ...waypoints.map(w => ({ lat: w.lat, lon: w.lon })),
      ];
      if (currentLat != null && currentLon != null) {
        coords.push({ lat: currentLat, lon: currentLon });
      }
      const result = await getRouteDistance(coords);
      if (result && mapRef.current) {
        setSnappedDistance(result.distanceKm);
        // Remove old snapped line
        if (snappedLineRef.current) {
          snappedLineRef.current.remove();
        }
        // Draw the road-snapped route if polyline available
        if (result.polyline) {
          const latLngs: L.LatLngExpression[] = decodePolyline(result.polyline).map(([lat, lon]) => [lat, lon]);
          snappedLineRef.current = L.polyline(latLngs, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.85,
          }).addTo(mapRef.current);
          mapRef.current.fitBounds(snappedLineRef.current.getBounds(), { padding: [20, 20] });
        }
        setAutoFollow(false);
      }
    } catch (e) {
      console.error('Snap to road failed:', e);
    } finally {
      setIsSnapping(false);
    }
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-border">
      <div ref={mapContainerRef} className="w-full h-48 z-0" />
      
      {/* Map controls overlay */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-[1000]">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur shadow-md"
          onClick={handleRecenter}
          title="Re-center on my location"
        >
          <Locate className="w-4 h-4" />
        </Button>
        <Button
          variant={isManualMode ? "default" : "secondary"}
          size="icon"
          className={`h-8 w-8 shadow-md ${isManualMode ? '' : 'bg-background/90 backdrop-blur'}`}
          onClick={toggleManualMode}
          title={isManualMode ? "Exit manual mode" : "Tap road to correct route"}
        >
          {isManualMode ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 bg-background/90 backdrop-blur shadow-md"
          onClick={handleSnapToRoad}
          disabled={isSnapping || waypoints.length < 2}
          title="Calculate actual road distance"
        >
          {isSnapping ? (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Route className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Snapped distance display */}
      {snappedDistance !== null && (
        <div className="absolute top-2 left-2 bg-background/90 backdrop-blur rounded px-2 py-1 text-xs font-semibold text-primary z-[1000]">
          🛣️ {snappedDistance} km (road)
        </div>
      )}

      {/* Manual mode banner */}
      {isManualMode && (
        <div className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-white text-xs text-center py-1 px-2 z-[1000]">
          Tap on the road to add route points • {manualPoints.length} point{manualPoints.length !== 1 ? 's' : ''} added
        </div>
      )}
    </div>
  );
}
