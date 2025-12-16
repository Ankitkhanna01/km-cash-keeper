import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MapPin } from "lucide-react";

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string, lat?: number, lon?: number) => void;
  onActiveChange?: (active: boolean, instanceKey: string) => void;
  placeholder?: string;
  id?: string;
}

type NearbyLocation = { lat: number; lon: number };

export function AddressAutocomplete({ value, onChange, onActiveChange, placeholder, id }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [nearby, setNearby] = useState<NearbyLocation | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [suppressClicks, setSuppressClicks] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const suppressTimerRef = useRef<number | undefined>(undefined);
  const geoRequestedRef = useRef(false);
  const instanceKeyRef = useRef<string>(
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current);
    };
  }, []);

  // Notify parent when the autocomplete is active, so it can temporarily disable submit buttons.
  useEffect(() => {
    const active = showSuggestions || suppressClicks;
    onActiveChange?.(active, instanceKeyRef.current);
    return () => {
      onActiveChange?.(false, instanceKeyRef.current);
    };
  }, [showSuggestions, suppressClicks, onActiveChange]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedInsideInput = !!containerRef.current?.contains(target);
      const clickedInsideDropdown = !!dropdownRef.current?.contains(target);
      if (!clickedInsideInput && !clickedInsideDropdown) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);


  useLayoutEffect(() => {
    if (!showSuggestions) return;

    const updateRect = () => {
      const rect = inputRef.current?.getBoundingClientRect() ?? null;
      setAnchorRect(rect);
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    document.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      document.removeEventListener("scroll", updateRect, true);
    };
  }, [showSuggestions]);

  const requestNearby = () => {
    if (geoRequestedRef.current || nearby) return;
    geoRequestedRef.current = true;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearby({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        // ignore; nearby bias is optional
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 5000 }
    );
  };

  const searchAddress = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke<AddressSuggestion[]>("geocode", {
          body: {
            q: query,
            countrycodes: "ca",
            limit: 6,
            near: nearby ?? undefined,
          },
        });

        if (error) throw error;

        const results = Array.isArray(data) ? data : [];
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch (error) {
        console.error("Address search error:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    },
    [nearby]
  );

  // Re-search when nearby location becomes available to bias results
  useEffect(() => {
    if (!nearby) return;
    if (inputValue.trim().length < 3) return;
    searchAddress(inputValue);
  }, [nearby, inputValue, searchAddress]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      searchAddress(newValue);
    }, 350);
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    // Prevent the synthetic "ghost click" from hitting elements behind the dropdown (mobile)
    setSuppressClicks(true);
    if (suppressTimerRef.current) window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => setSuppressClicks(false), 450);

    setInputValue(suggestion.display_name);
    onChange(suggestion.display_name, Number(suggestion.lat), Number(suggestion.lon));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            requestNearby();
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder={placeholder}
          className="pr-8"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      {(showSuggestions || suppressClicks) &&
        createPortal(
          <div
            data-address-autocomplete-overlay
            className="fixed inset-0 bg-transparent"
            style={{ zIndex: 9998 }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (showSuggestions) setShowSuggestions(false);
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (showSuggestions) setShowSuggestions(false);
            }}
            onClick={(e) => {
              // Stop the synthesized mobile click from reaching the submit button
              e.preventDefault();
              e.stopPropagation();
            }}
          />,
          document.body
        )}

      {showSuggestions && suggestions.length > 0 && anchorRect &&
        createPortal(
          <div
            ref={dropdownRef}
            data-address-autocomplete-dropdown
            className="rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-auto"
            style={{
              position: "fixed",
              top: Math.round(anchorRect.bottom + 6),
              left: Math.round(anchorRect.left),
              width: Math.round(anchorRect.width),
              zIndex: 9999,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.lat}-${suggestion.lon}-${index}`}
                type="button"
                className="w-full border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground active:bg-accent"
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectSuggestion(suggestion);
                }}
              >
                <div className="flex items-start gap-2 pointer-events-none">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="line-clamp-2">{suggestion.display_name}</span>
                </div>
              </button>
            ))}
            </div>,
            document.body
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

