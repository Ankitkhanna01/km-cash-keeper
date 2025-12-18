import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Building2, Home, Store, Loader2 } from 'lucide-react';
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
}

export function NearbyPlacesSuggestions({ lat, lon, onSelect, className = '' }: NearbyPlacesSuggestionsProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Finding nearby places...</span>
      </div>
    );
  }

  if (error || places.length === 0) {
    return null; // Don't show anything if no suggestions
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs text-muted-foreground">Nearby places:</p>
      <div className="flex flex-wrap gap-1">
        {places.map((place, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            onClick={() => onSelect(place)}
            className="h-auto py-1 px-2 text-xs gap-1 bg-background/80 hover:bg-primary/10 border-border/50"
          >
            {getIcon(place.type)}
            <span className="truncate max-w-[120px]">{place.name}</span>
            {place.distance && (
              <span className="text-muted-foreground">({place.distance}m)</span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}
