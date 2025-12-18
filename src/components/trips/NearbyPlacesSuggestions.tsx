import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Building2, Home, Store, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface NearbyPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: 'restaurant' | 'residential' | 'business' | 'other';
  distance?: number;
}

interface NearbyPlacesSuggestionsProps {
  lat: number;
  lon: number;
  onSelect: (place: NearbyPlace) => void;
  className?: string;
  baseAddress?: string; // For completing unit numbers like "306" → "306-3420 Quadra St"
}

export function NearbyPlacesSuggestions({ lat, lon, onSelect, className = '', baseAddress = '' }: NearbyPlacesSuggestionsProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout>();

  // Initial fetch of nearby places
  useEffect(() => {
    let cancelled = false;

    const fetchNearby = async () => {
      setLoading(true);
      setError(false);
      
      try {
        const { data, error: fnError } = await supabase.functions.invoke('nearby-places', {
          body: { lat, lon, radius: 150 },
        });

        if (cancelled) return;

        if (fnError) {
          console.error('Nearby places error:', fnError);
          setError(true);
        } else if (data?.places) {
          setPlaces(data.places);
        }
      } catch (e) {
        console.error('Failed to fetch nearby places:', e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchNearby();
    return () => { cancelled = true; };
  }, [lat, lon]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke('nearby-places', {
          body: { lat, lon, radius: 300, query: searchQuery },
        });

        if (!fnError && data?.places) {
          setSearchResults(data.places);
        }
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchDebounce.current);
  }, [searchQuery, lat, lon]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'restaurant':
        return <Store className="w-3 h-3" />;
      case 'residential':
        return <Home className="w-3 h-3" />;
      case 'business':
        return <Building2 className="w-3 h-3" />;
      default:
        return <MapPin className="w-3 h-3" />;
    }
  };

  const handleCustomSubmit = () => {
    if (!searchQuery.trim()) return;
    
    // Check if it looks like a unit/apartment number (just numbers or alphanumeric)
    const isUnitNumber = /^[0-9]+[a-zA-Z]?$/.test(searchQuery.trim());
    
    let finalName = searchQuery.trim();
    let finalAddress = baseAddress;
    
    if (isUnitNumber && baseAddress) {
      // Prepend unit number to base address: "306" + "3420 Quadra St" = "306-3420 Quadra St"
      finalName = `Unit ${searchQuery.trim()}`;
      finalAddress = `${searchQuery.trim()}-${baseAddress}`;
    }
    
    onSelect({
      name: finalName,
      address: finalAddress || `Near ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      lat,
      lon,
      type: isUnitNumber ? 'residential' : 'other',
    });
    
    setSearchQuery('');
    setShowSearch(false);
  };

  const handleSelectPlace = (place: NearbyPlace) => {
    onSelect(place);
    setSearchQuery('');
    setShowSearch(false);
    setSearchResults([]);
  };

  // Always show - either loading, places, or search option
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Initial loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Finding nearby places...</span>
        </div>
      )}

      {/* Show nearby places buttons */}
      {!loading && places.length > 0 && !showSearch && (
        <>
          <p className="text-xs text-muted-foreground">Nearby places:</p>
          <div className="flex flex-wrap gap-1">
            {places.map((place, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={() => handleSelectPlace(place)}
                className="h-auto py-1 px-2 text-xs gap-1 bg-background/80 hover:bg-primary/10 border-border/50"
              >
                {getIcon(place.type)}
                <span className="truncate max-w-[100px]">{place.name}</span>
                {place.distance && (
                  <span className="text-muted-foreground text-[10px]">({place.distance}m)</span>
                )}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="h-auto py-1 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              <Search className="w-3 h-3" />
              Other
            </Button>
          </div>
        </>
      )}

      {/* No places found - show search option */}
      {!loading && places.length === 0 && !showSearch && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSearch(true)}
          className="h-auto py-1 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <Search className="w-3 h-3" />
          Add specific place
        </Button>
      )}

      {/* Search input */}
      {showSearch && (
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Unit #, business name..."
                className="h-7 text-xs pr-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCustomSubmit();
                  } else if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
              />
              {searching && (
                <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2 text-muted-foreground" />
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="h-7 w-7 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {searchResults.map((place, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectPlace(place)}
                  className="h-auto py-1 px-2 text-xs gap-1 bg-background/80 hover:bg-primary/10 border-border/50"
                >
                  {getIcon(place.type)}
                  <span className="truncate max-w-[100px]">{place.name}</span>
                </Button>
              ))}
            </div>
          )}

          {/* Custom submit hint */}
          {searchQuery.trim() && (
            <p className="text-[10px] text-muted-foreground">
              Press Enter to use "{searchQuery.trim()}"
              {/^[0-9]+[a-zA-Z]?$/.test(searchQuery.trim()) && baseAddress && (
                <> as unit number</>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
