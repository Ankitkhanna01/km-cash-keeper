import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Search, Store, Home, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isValidCoordinate, isValidSearchQuery } from "@/lib/coordinateUtils";

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
  name: string;
  lat: number;
  lon: number;
  address?: AddressComponents;
  type: 'restaurant' | 'residential' | 'other';
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

const RESULTS_PER_PAGE = 5;

export function AddressAutocomplete({ value, onChange, onActiveChange, placeholder, id }: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AddressSuggestion[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [page, setPage] = useState(0);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const geoRequestedRef = useRef(0);
  const searchIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const instanceKeyRef = useRef<string>(
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Notify parent when active
  useEffect(() => {
    onActiveChange?.(showResults, instanceKeyRef.current);
    return () => {
      onActiveChange?.(false, instanceKeyRef.current);
    };
  }, [showResults, onActiveChange]);

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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const requestLocation = () => {
    // Refresh the fix if it is older than 2 minutes so the search stays
    // anchored to where the driver actually is right now.
    if (Date.now() - geoRequestedRef.current < 2 * 60 * 1000) return;
    geoRequestedRef.current = Date.now();

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30 * 1000, timeout: 10000 }
    );
  };

  const getPlaceType = (type?: string): 'restaurant' | 'residential' | 'other' => {
    if (!type) return 'other';
    if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court'].includes(type)) {
      return 'restaurant';
    }
    if (['house', 'residential', 'apartments', 'building', 'detached', 'terrace'].includes(type)) {
      return 'residential';
    }
    return 'other';
  };

  // Calculate distance between two coordinates (Haversine)
  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const searchAddress = async (query: string) => {
    if (!query || !isValidSearchQuery(query)) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    setPage(0);

    const requestId = ++searchIdRef.current;
    const isStale = () => requestId !== searchIdRef.current;

    try {
      // Use edge function for better Canadian address support
      const { data, error } = await supabase.functions.invoke('geocode', {
        body: {
          q: query,
          limit: 20,
          countrycodes: 'ca',
          near: userLocation && isValidCoordinate(userLocation.lat, userLocation.lon) 
            ? { lat: userLocation.lat, lon: userLocation.lon }
            : undefined,
        },
      });

      if (isStale()) return;

      if (error) {
        console.error("Geocode error:", error);
        setSearchResults([]);
        setShowResults(false);
        return;
      }

      let results: AddressSuggestion[] = (data || []).map((item: any) => ({
        display_name: item.display_name,
        name: item.formatted_name || item.name || item.display_name.split(',')[0],
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        address: item.address,
        type: getPlaceType(item.type),
      }));

      // Sort by distance from user location (nearest first)
      if (userLocation) {
        results = results.sort((a, b) => {
          const distA = getDistanceKm(userLocation.lat, userLocation.lon, a.lat, a.lon);
          const distB = getDistanceKm(userLocation.lat, userLocation.lon, b.lat, b.lon);
          return distA - distB;
        });
      }

      if (isStale()) return;
      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (err) {
      console.error("Search failed:", err);
      if (isStale()) return;
      setSearchResults([]);
      setShowResults(false);
    } finally {
      if (!isStale()) setIsSearching(false);
    }
  };

  const handleSelectResult = (result: AddressSuggestion) => {
    const displayName = result.name !== result.display_name 
      ? `${result.name}, ${result.display_name.split(',').slice(1).join(',').trim()}`
      : result.display_name;
    
    setInputValue(displayName);
    onChange(displayName, result.lat, result.lon, result.address);
    setShowResults(false);
    setSearchResults([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    // Invalidate any in-flight search so an older response can't repopulate the list
    searchIdRef.current++;

    // Debounced autocomplete search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (newValue.trim().length >= 3) {
      debounceRef.current = setTimeout(() => {
        searchAddress(newValue.trim());
      }, 400);
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    setShowResults(false);
    setSearchResults([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'restaurant':
        return <Store className="w-4 h-4 text-orange-500 shrink-0" />;
      case 'residential':
        return <Home className="w-4 h-4 text-green-500 shrink-0" />;
      default:
        return <MapPin className="w-4 h-4 text-primary shrink-0" />;
    }
  };

  const displayedResults = searchResults.slice(page * RESULTS_PER_PAGE, (page + 1) * RESULTS_PER_PAGE);
  const hasNext = (page + 1) * RESULTS_PER_PAGE < searchResults.length;
  const hasPrev = page > 0;

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={id}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={requestLocation}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress(inputValue.trim()))}
            placeholder={placeholder || "Search for an address..."}
            className="pr-16"
            autoComplete="off"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {inputValue && (
              <button type="button" onClick={handleClear} className="p-1 hover:bg-accent rounded">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => searchAddress(inputValue.trim())}
          disabled={isSearching}
        >
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Search results */}
      {showResults && searchResults.length > 0 && (
        <div className="rounded-md border border-border bg-popover shadow-lg p-2 space-y-1">
          <p className="text-xs text-muted-foreground px-2">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
          </p>
          
          {displayedResults.map((result, index) => (
            <button
              key={`${result.lat}-${result.lon}-${index}`}
              type="button"
              className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left transition-colors"
              onClick={() => handleSelectResult(result)}
            >
              {getIcon(result.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{result.name}</p>
                <p className="text-xs text-muted-foreground truncate">{result.display_name}</p>
              </div>
            </button>
          ))}

          {searchResults.length > RESULTS_PER_PAGE && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setPage(p => p - 1)}
                disabled={!hasPrev}
                className="gap-1 h-7"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {page * RESULTS_PER_PAGE + 1}-{Math.min((page + 1) * RESULTS_PER_PAGE, searchResults.length)} of {searchResults.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNext}
                className="gap-1 h-7"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
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
