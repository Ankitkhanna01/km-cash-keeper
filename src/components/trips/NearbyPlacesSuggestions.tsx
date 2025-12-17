import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight, MapPin, Loader2, Store, Home, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface NearbyPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: 'restaurant' | 'residential' | 'other';
}

interface NearbyPlacesSuggestionsProps {
  lat: number;
  lon: number;
  onSelect: (place: NearbyPlace) => void;
  onClose: () => void;
}

export function NearbyPlacesSuggestions({ lat, lon, onSelect, onClose }: NearbyPlacesSuggestionsProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [allPlaces, setAllPlaces] = useState<NearbyPlace[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<NearbyPlace[] | null>(null);

  const PLACES_PER_PAGE = 5;

  useEffect(() => {
    const fetchNearbyPlaces = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('nearby-places', {
          body: { lat, lon, radius: 500 },
        });

        if (error) throw error;

        const fetchedPlaces: NearbyPlace[] = data?.places || [];
        setAllPlaces(fetchedPlaces);
        setPlaces(fetchedPlaces.slice(0, PLACES_PER_PAGE));
        setPage(0);
      } catch (err) {
        console.error('Failed to fetch nearby places:', err);
        setAllPlaces([]);
        setPlaces([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNearbyPlaces();
  }, [lat, lon]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      // Search nearby using Nominatim with viewbox around current location
      const viewbox = `${lon - 0.01},${lat + 0.01},${lon + 0.01},${lat - 0.01}`;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&viewbox=${viewbox}&bounded=0&limit=10&addressdetails=1`
      );
      const data = await response.json();

      const results: NearbyPlace[] = data.map((item: any) => {
        const name = item.name || item.display_name.split(',')[0];
        const type = item.type === 'restaurant' || item.type === 'cafe' || item.type === 'fast_food' 
          ? 'restaurant' 
          : item.type === 'house' || item.type === 'residential' || item.type === 'apartments'
          ? 'residential'
          : 'other';
        
        return {
          name,
          address: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          type,
        };
      });

      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleNext = () => {
    const nextPage = page + 1;
    const start = nextPage * PLACES_PER_PAGE;
    const sourceList = searchResults || allPlaces;
    if (start < sourceList.length) {
      setPlaces(sourceList.slice(start, start + PLACES_PER_PAGE));
      setPage(nextPage);
    }
  };

  const handlePrev = () => {
    const prevPage = page - 1;
    if (prevPage >= 0) {
      const start = prevPage * PLACES_PER_PAGE;
      const sourceList = searchResults || allPlaces;
      setPlaces(sourceList.slice(start, start + PLACES_PER_PAGE));
      setPage(prevPage);
    }
  };

  const displayList = searchResults || allPlaces;
  const hasNext = (page + 1) * PLACES_PER_PAGE < displayList.length;
  const hasPrev = page > 0;

  const getIcon = (type: string) => {
    switch (type) {
      case 'restaurant':
        return <Store className="w-4 h-4 text-orange-500" />;
      case 'residential':
        return <Home className="w-4 h-4 text-green-500" />;
      default:
        return <MapPin className="w-4 h-4 text-primary" />;
    }
  };

  // Update displayed places when search results change
  useEffect(() => {
    if (searchResults !== null) {
      setPlaces(searchResults.slice(0, PLACES_PER_PAGE));
      setPage(0);
    }
  }, [searchResults]);

  if (loading) {
    return (
      <div className="p-4 bg-secondary/30 rounded-lg">
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Finding nearby places...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-secondary/30 rounded-lg space-y-2">
      <p className="text-xs text-muted-foreground">Did you visit one of these?</p>
      
      {/* Search input */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Search for a place..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="h-8 text-sm"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSearch}
          disabled={searching}
          className="shrink-0"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {searchResults !== null && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {searchResults.length} search result{searchResults.length !== 1 ? 's' : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={handleClearSearch} className="h-6 text-xs">
            Clear search
          </Button>
        </div>
      )}

      {displayList.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">
          {searchResults !== null ? 'No results found. Try a different search.' : 'No nearby places found'}
        </p>
      ) : (
        <div className="space-y-1">
          {places.map((place, index) => (
            <button
              key={`${place.lat}-${place.lon}-${index}`}
              onClick={() => onSelect(place)}
              className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-left transition-colors"
            >
              {getIcon(place.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{place.name}</p>
                <p className="text-xs text-muted-foreground truncate">{place.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {displayList.length > PLACES_PER_PAGE && (
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={!hasPrev}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {page * PLACES_PER_PAGE + 1}-{Math.min((page + 1) * PLACES_PER_PAGE, displayList.length)} of {displayList.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={!hasNext}
            className="gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onClose} className="w-full">
        Use original address
      </Button>
    </div>
  );
}
