import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Building2, Home, Store, Loader2, Search, X, History, Star, Globe, SkipForward } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NearbyPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: 'restaurant' | 'residential' | 'business' | 'other';
  distance?: number;
  source?: 'trips' | 'cached' | 'osm';
}

interface EndLocationPickerProps {
  open: boolean;
  endLocation: {
    address: string;
    lat: number;
    lon: number;
    time: string;
  };
  onSelect: (place: NearbyPlace) => void;
  onSkip: () => void;
}

export function EndLocationPicker({ open, endLocation, onSelect, onSkip }: EndLocationPickerProps) {
  const { user } = useAuth();
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NearbyPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout>();
  const initialCoords = useRef({ lat: endLocation.lat, lon: endLocation.lon });

  // Fetch nearby places on mount
  useEffect(() => {
    if (!open) return;
    
    let cancelled = false;

    const fetchNearby = async () => {
      setLoading(true);
      
      try {
        const { data, error: fnError } = await supabase.functions.invoke('nearby-places', {
          body: { 
            lat: initialCoords.current.lat, 
            lon: initialCoords.current.lon, 
            radius: 150,
            userId: user?.id,
          },
        });

        if (cancelled) return;

        if (!fnError && data?.places) {
          setPlaces(data.places);
        }
      } catch (e) {
        console.error('Failed to fetch nearby places:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchNearby();
    return () => { cancelled = true; };
  }, [open, user?.id]);

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
          body: { 
            lat: initialCoords.current.lat, 
            lon: initialCoords.current.lon, 
            radius: 300, 
            query: searchQuery,
            userId: user?.id,
          },
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
  }, [searchQuery, user?.id]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'restaurant':
        return <Store className="w-4 h-4" />;
      case 'residential':
        return <Home className="w-4 h-4" />;
      case 'business':
        return <Building2 className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  const getSourceIndicator = (source?: string) => {
    switch (source) {
      case 'trips':
        return <span title="From your past trips"><History className="w-3 h-3 text-blue-500" /></span>;
      case 'cached':
        return <span title="Saved place"><Star className="w-3 h-3 text-yellow-500" /></span>;
      case 'osm':
        return <span title="From map"><Globe className="w-3 h-3 text-muted-foreground/50" /></span>;
      default:
        return null;
    }
  };

  const handleCustomSubmit = async () => {
    if (!searchQuery.trim()) return;
    
    const isUnitNumber = /^[0-9]+[a-zA-Z]?$/.test(searchQuery.trim());
    
    let finalName = searchQuery.trim();
    let finalAddress = endLocation.address;
    
    if (isUnitNumber && endLocation.address) {
      finalName = `Unit ${searchQuery.trim()}`;
      finalAddress = `${searchQuery.trim()}-${endLocation.address}`;
    }

    // Save custom place to cache
    try {
      await supabase.functions.invoke('nearby-places', {
        body: { 
          lat: initialCoords.current.lat, 
          lon: initialCoords.current.lon, 
          radius: 150,
          userId: user?.id,
          savePlace: {
            name: finalName,
            address: finalAddress || `Near ${endLocation.lat.toFixed(4)}, ${endLocation.lon.toFixed(4)}`,
            lat: initialCoords.current.lat,
            lon: initialCoords.current.lon,
          },
        },
      });
    } catch (e) {
      console.log('Failed to save custom place:', e);
    }
    
    onSelect({
      name: finalName,
      address: finalAddress || `Near ${endLocation.lat.toFixed(4)}, ${endLocation.lon.toFixed(4)}`,
      lat: endLocation.lat,
      lon: endLocation.lon,
      type: isUnitNumber ? 'residential' : 'other',
    });
  };

  const handleSelectPlace = (place: NearbyPlace) => {
    onSelect(place);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Where did you end up?</DialogTitle>
          <DialogDescription>
            Select a nearby place or use your current location
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Current location option */}
          <div className="p-3 border rounded-lg bg-muted/30">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Current GPS location</p>
                <p className="text-sm line-clamp-2">{endLocation.address}</p>
              </div>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Finding nearby places...</span>
            </div>
          )}

          {/* Nearby places */}
          {!loading && places.length > 0 && !showSearch && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Nearby places:</p>
              <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                {places.map((place, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    onClick={() => handleSelectPlace(place)}
                    className="h-auto py-2 px-3 justify-start gap-2 text-left"
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      {getSourceIndicator(place.source)}
                      {getIcon(place.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{place.name}</p>
                      {place.distance && (
                        <p className="text-xs text-muted-foreground">{place.distance}m away</p>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Search section */}
          {!loading && (
            <>
              {!showSearch ? (
                <Button
                  variant="ghost"
                  onClick={() => setShowSearch(true)}
                  className="w-full gap-2 text-muted-foreground"
                >
                  <Search className="w-4 h-4" />
                  Search for a different place
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Unit #, business name..."
                        className="pr-8"
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
                        <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="grid gap-2 max-h-[150px] overflow-y-auto">
                      {searchResults.map((place, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          onClick={() => handleSelectPlace(place)}
                          className="h-auto py-2 px-3 justify-start gap-2 text-left"
                        >
                          {getIcon(place.type)}
                          <span className="text-sm truncate">{place.name}</span>
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Custom submit hint */}
                  {searchQuery.trim() && (
                    <p className="text-xs text-muted-foreground">
                      Press Enter to use "{searchQuery.trim()}"
                      {/^[0-9]+[a-zA-Z]?$/.test(searchQuery.trim()) && endLocation.address && (
                        <> as unit number</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Skip button - always visible */}
          <Button
            variant="secondary"
            onClick={onSkip}
            className="w-full gap-2"
          >
            <SkipForward className="w-4 h-4" />
            Use GPS location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}