import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MapPin, Loader2, Store, Home } from 'lucide-react';
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

  const PLACES_PER_PAGE = 5;

  useEffect(() => {
    const fetchNearbyPlaces = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('nearby-places', {
          body: { lat, lon, radius: 500 }, // 500 meters
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

  const handleNext = () => {
    const nextPage = page + 1;
    const start = nextPage * PLACES_PER_PAGE;
    if (start < allPlaces.length) {
      setPlaces(allPlaces.slice(start, start + PLACES_PER_PAGE));
      setPage(nextPage);
    }
  };

  const handlePrev = () => {
    const prevPage = page - 1;
    if (prevPage >= 0) {
      const start = prevPage * PLACES_PER_PAGE;
      setPlaces(allPlaces.slice(start, start + PLACES_PER_PAGE));
      setPage(prevPage);
    }
  };

  const hasNext = (page + 1) * PLACES_PER_PAGE < allPlaces.length;
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

  if (allPlaces.length === 0) {
    return (
      <div className="p-4 bg-secondary/30 rounded-lg">
        <p className="text-sm text-muted-foreground text-center">No nearby places found</p>
        <Button variant="ghost" size="sm" onClick={onClose} className="w-full mt-2">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-secondary/30 rounded-lg space-y-2">
      <p className="text-xs text-muted-foreground">Did you visit one of these?</p>
      
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
          {page * PLACES_PER_PAGE + 1}-{Math.min((page + 1) * PLACES_PER_PAGE, allPlaces.length)} of {allPlaces.length}
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

      <Button variant="outline" size="sm" onClick={onClose} className="w-full">
        Use original address
      </Button>
    </div>
  );
}
