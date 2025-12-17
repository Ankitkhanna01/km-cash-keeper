import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Search } from "lucide-react";
import { NearbyPlacesSuggestions } from "./NearbyPlacesSuggestions";

export interface AddressComponents {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  amenity?: string;
}

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: AddressComponents;
  name?: string;
  type?: string;
}

export interface AddressResult {
  display_name: string;
  lat: number;
  lon: number;
  address?: AddressComponents;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, lat?: number, lon?: number, address?: AddressComponents) => void;
  onActiveChange?: (active: boolean, instanceKey: string) => void;
  placeholder?: string;
  id?: string;
}

export function AddressAutocomplete({ value, onChange, onActiveChange, placeholder, id }: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [nearby, setNearby] = useState<{ lat: number; lon: number } | null>(null);
  
  // Nearby places state
  const [showNearbyPlaces, setShowNearbyPlaces] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const geoRequestedRef = useRef(false);
  const instanceKeyRef = useRef<string>(
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Notify parent when active
  useEffect(() => {
    onActiveChange?.(showResults || showNearbyPlaces, instanceKeyRef.current);
    return () => {
      onActiveChange?.(false, instanceKeyRef.current);
    };
  }, [showResults, showNearbyPlaces, onActiveChange]);

  // Close results when clicking outside
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        setShowResults(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const requestNearby = () => {
    if (geoRequestedRef.current || nearby) return;
    geoRequestedRef.current = true;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearby({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 5000 }
    );
  };

  const handleSearch = async () => {
    if (!inputValue.trim()) return;

    setIsSearching(true);
    setShowNearbyPlaces(false);
    
    try {
      // Build viewbox if we have nearby location
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(inputValue)}&countrycodes=ca&limit=10&addressdetails=1`;
      
      if (nearby) {
        const viewbox = `${nearby.lon - 0.05},${nearby.lat + 0.05},${nearby.lon + 0.05},${nearby.lat - 0.05}`;
        url += `&viewbox=${viewbox}&bounded=0`;
      }

      const response = await fetch(url);
      const data = await response.json();

      const results: AddressSuggestion[] = data.map((item: any) => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        name: item.name || item.display_name.split(',')[0],
        address: item.address,
        type: item.type,
      }));

      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: AddressSuggestion) => {
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    
    setInputValue(result.display_name);
    onChange(result.display_name, lat, lon, result.address);
    setShowResults(false);
    setSearchResults([]);
    
    // Show nearby places suggestions
    setSelectedCoords({ lat, lon });
    setShowNearbyPlaces(true);
  };

  const handleNearbyPlaceSelect = (place: { name: string; address: string; lat: number; lon: number }) => {
    const displayName = place.name ? `${place.name}, ${place.address}` : place.address;
    setInputValue(displayName);
    onChange(displayName, place.lat, place.lon, {
      amenity: place.name,
      road: place.address,
    });
    setShowNearbyPlaces(false);
    setSelectedCoords(null);
  };

  const handleNearbyPlacesClose = () => {
    setShowNearbyPlaces(false);
    setSelectedCoords(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={requestNearby}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
            placeholder={placeholder || "Search for an address..."}
            className="pr-8"
            autoComplete="off"
          />
          <MapPin className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Search results */}
      {showResults && searchResults.length > 0 && (
        <div className="rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-auto">
          {searchResults.map((result, index) => (
            <button
              key={`${result.lat}-${result.lon}-${index}`}
              type="button"
              className="w-full flex items-center gap-2 p-3 border-b border-border last:border-0 hover:bg-accent text-left transition-colors"
              onClick={() => handleSelectResult(result)}
            >
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm line-clamp-2">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Nearby places suggestions */}
      {showNearbyPlaces && selectedCoords && (
        <NearbyPlacesSuggestions
          lat={selectedCoords.lat}
          lon={selectedCoords.lon}
          onSelect={handleNearbyPlaceSelect}
          onClose={handleNearbyPlacesClose}
        />
      )}
    </div>
  );
}

// Haversine formula to calculate distance between two coordinates
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  // Add ~30% for road distance approximation (straight line vs actual roads)
  return Math.round(distance * 1.3 * 10) / 10;
}

// Calculate total distance for multiple stops
export function calculateTotalDistance(coordinates: Array<{ lat: number; lon: number }>): number {
  if (coordinates.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalDistance += calculateDistance(
      coordinates[i].lat,
      coordinates[i].lon,
      coordinates[i + 1].lat,
      coordinates[i + 1].lon
    );
  }
  return Math.round(totalDistance * 10) / 10;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
