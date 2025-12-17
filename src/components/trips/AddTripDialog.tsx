import { ReactElement, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Calculator, X, MapPin, Navigation, Check, Loader2 } from 'lucide-react';
import { AddressAutocomplete, calculateTotalDistance, AddressResult } from './AddressAutocomplete';
import { AddressComponents as DBAddressComponents } from '@/hooks/useTripsDB';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLocalDateString, getLocalTimeString } from '@/lib/dateUtils';

interface AddTripDialogProps {
  onAdd: (trip: {
    date: string;
    start_time: string;
    end_time: string;
    start_location: string;
    end_location: string;
    kilometres: number;
    category: 'business' | 'personal' | 'uncategorized';
    start_address?: DBAddressComponents;
    end_address?: DBAddressComponents;
  }) => void;
  trigger?: ReactElement;
}

interface AddressComponentsRaw {
  house_number?: string;
  road?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface StopLocation {
  address: string;
  lat?: number;
  lon?: number;
  addressComponents?: AddressComponentsRaw;
}

export function AddTripDialog({ onAdd, trigger }: AddTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: getLocalDateString(),
    startTime: getLocalTimeString(),
    endTime: getLocalTimeString(),
    kilometres: '',
  });

  const [startLocation, setStartLocation] = useState<StopLocation>({ address: '' });
  const [stops, setStops] = useState<StopLocation[]>([{ address: '' }]);
  const [autoCalculated, setAutoCalculated] = useState(false);
  const [gettingLocation, setGettingLocation] = useState<string | null>(null);

  const [addressActiveByKey, setAddressActiveByKey] = useState<Record<string, boolean>>({});
  const handleAddressActiveChange = useCallback((active: boolean, key: string) => {
    setAddressActiveByKey((prev) => {
      if (prev[key] === active) return prev;
      return { ...prev, [key]: active };
    });
  }, []);
  const addressPickerActive = useMemo(
    () => Object.values(addressActiveByKey).some(Boolean),
    [addressActiveByKey]
  );

  // Auto-calculate distance when coordinates are available
  useEffect(() => {
    const allCoords: Array<{ lat: number; lon: number }> = [];

    if (startLocation.lat != null && startLocation.lon != null) {
      allCoords.push({ lat: startLocation.lat, lon: startLocation.lon });
    }

    stops.forEach((stop) => {
      if (stop.lat != null && stop.lon != null) {
        allCoords.push({ lat: stop.lat, lon: stop.lon });
      }
    });

    if (allCoords.length >= 2) {
      const distance = calculateTotalDistance(allCoords);
      setFormData((prev) => ({ ...prev, kilometres: distance.toString() }));
      setAutoCalculated(true);
    }
  }, [startLocation, stops]);

  const getCurrentLocation = async (target: 'start' | number) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by your browser');
      return;
    }

    const key = target === 'start' ? 'start' : `stop-${target}`;
    setGettingLocation(key);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get address
      const { data, error } = await supabase.functions.invoke('reverse-geocode', {
        body: { lat: latitude, lon: longitude },
      });

      if (error) throw error;

      const address = data.address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      const components = data.addressComponents ? {
        house_number: data.addressComponents.house_number,
        road: data.addressComponents.road,
        city: data.addressComponents.city || data.addressComponents.town || data.addressComponents.village,
        state: data.addressComponents.state || data.addressComponents.province,
        postcode: data.addressComponents.postcode,
      } : undefined;
      
      if (target === 'start') {
        setStartLocation({ address, lat: latitude, lon: longitude, addressComponents: components });
      } else {
        setStops(prev => {
          const newStops = [...prev];
          newStops[target] = { address, lat: latitude, lon: longitude, addressComponents: components };
          return newStops;
        });
      }

      toast.success('Location added');
    } catch (error: any) {
      console.error('Location error:', error);
      if (error.code === 1) {
        toast.error('Location permission denied');
      } else if (error.code === 2) {
        toast.error('Unable to determine location');
      } else if (error.code === 3) {
        toast.error('Location request timed out');
      } else {
        toast.error('Failed to get location');
      }
    } finally {
      setGettingLocation(null);
    }
  };

  const handleStartLocationChange = (value: string, lat?: number, lon?: number, addressComponents?: any) => {
    // Convert Nominatim address format to our format (city can be city, town, or village)
    const components = addressComponents ? {
      house_number: addressComponents.house_number,
      road: addressComponents.road,
      city: addressComponents.city || addressComponents.town || addressComponents.village,
      state: addressComponents.state || addressComponents.province,
      postcode: addressComponents.postcode,
    } : undefined;
    setStartLocation({ address: value, lat, lon, addressComponents: components });
    if (lat != null && lon != null) {
      toast.success('Location added');
    }
  };

  const handleStopChange = (index: number, value: string, lat?: number, lon?: number, addressComponents?: any) => {
    // Convert Nominatim address format to our format (city can be city, town, or village)
    const components = addressComponents ? {
      house_number: addressComponents.house_number,
      road: addressComponents.road,
      city: addressComponents.city || addressComponents.town || addressComponents.village,
      state: addressComponents.state || addressComponents.province,
      postcode: addressComponents.postcode,
    } : undefined;
    setStops(prev => {
      const newStops = [...prev];
      newStops[index] = { address: value, lat, lon, addressComponents: components };
      return newStops;
    });
    if (lat != null && lon != null) {
      toast.success('Location added');
    }
  };

  const addStop = () => {
    setStops(prev => [...prev, { address: '' }]);
  };

  const removeStop = (index: number) => {
    if (stops.length > 1) {
      setStops(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleKilometresChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, kilometres: e.target.value });
    setAutoCalculated(false);
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault?.();

    type GeocodeResult = {
      display_name: string;
      lat: string;
      lon: string;
      address?: any;
    };

    const toRawComponents = (addr: any): AddressComponentsRaw | undefined => {
      if (!addr) return undefined;
      return {
        house_number: addr.house_number,
        road: addr.road,
        city: addr.city || addr.town || addr.village,
        state: addr.state || addr.province,
        postcode: addr.postcode,
      };
    };

    const resolveLocation = async (loc: StopLocation): Promise<StopLocation> => {
      if (!loc.address) return loc;
      if (loc.addressComponents) return loc;

      const originalQuery = loc.address.trim();

      // Try to expand/normalize the query first (helps partial inputs like "Biryani p")
      let expandedQuery = originalQuery;
      try {
        const { data: smart } = await supabase.functions.invoke<{ expanded?: string }>("smart-address", {
          body: { query: originalQuery },
        });
        if (smart?.expanded && typeof smart.expanded === "string") {
          expandedQuery = smart.expanded.trim() || originalQuery;
        }
      } catch {
        // ignore; we'll fall back to raw query
      }

      const candidates = [expandedQuery, originalQuery]
        .flatMap((q) => {
          const hasCanada = q.toLowerCase().includes("canada");
          return hasCanada ? [q] : [q, `${q}, Canada`];
        })
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      for (const q of candidates) {
        const { data, error } = await supabase.functions.invoke<GeocodeResult[]>("geocode", {
          body: {
            q,
            countrycodes: "ca",
            limit: 1,
          },
        });
        if (error) throw error;

        const first = Array.isArray(data) ? data[0] : undefined;
        if (!first) continue;

        return {
          address: first.display_name,
          lat: Number(first.lat),
          lon: Number(first.lon),
          addressComponents: toRawComponents(first.address),
        };
      }

      return loc;
    };

    try {
      const resolvedStart = await resolveLocation(startLocation);
      const resolvedStops = await Promise.all(stops.map(resolveLocation));

      const allStopAddresses = resolvedStops.map((s) => s.address).filter(Boolean);
      const endLocation = allStopAddresses.length > 1 ? allStopAddresses.join(" → ") : allStopAddresses[0] || "";

      const endStopWithComponents = [...resolvedStops]
        .reverse()
        .find((s) => s.address && s.addressComponents);

      if (!resolvedStart.addressComponents || !endStopWithComponents?.addressComponents) {
        toast.info(
          "Trip saved, but we couldn’t fully parse the CRA address details. Next time, pick a suggestion when possible."
        );
      }

      const startAddr = resolvedStart.addressComponents;
      const endAddr = endStopWithComponents?.addressComponents;

      const formatStreet = (addr: AddressComponentsRaw) => {
        const parts = [addr.house_number, addr.road].filter(Boolean);
        return parts.length > 0 ? parts.join(" ") : undefined;
      };

      onAdd({
        date: formData.date,
        start_time: formData.startTime,
        end_time: formData.endTime,
        start_location: resolvedStart.address,
        end_location: endLocation,
        kilometres: parseFloat(formData.kilometres) || 0,
        category: "uncategorized",
        start_address: startAddr
          ? {
              street: formatStreet(startAddr),
              city: startAddr.city,
              postal_code: startAddr.postcode,
              province: startAddr.state,
            }
          : undefined,
        end_address: endAddr
          ? {
              street: formatStreet(endAddr),
              city: endAddr.city,
              postal_code: endAddr.postcode,
              province: endAddr.state,
            }
          : undefined,
      });

      // Reset form
      setFormData({
        date: getLocalDateString(),
        startTime: getLocalTimeString(),
        endTime: getLocalTimeString(),
        kilometres: "",
      });
      setStartLocation({ address: "" });
      setStops([{ address: "" }]);
      setAutoCalculated(false);
      setAddressActiveByKey({});
      setOpen(false);
    } catch (error) {
      console.error("Trip save error:", error);
      toast.error("Failed to save trip");
    }
  };

  const hasValidData = startLocation.address && stops.some(s => s.address) && formData.kilometres;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAddressActiveByKey({});
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="icon" className="rounded-full shadow-lg glow">
            <Plus className="w-5 h-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass-card border-border max-w-sm mx-auto max-h-[90vh] overflow-y-auto"
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest?.("[data-address-autocomplete-dropdown]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle>Add Trip</DialogTitle>
          <Button
            type="button"
            size="icon"
            variant={hasValidData ? "default" : "ghost"}
            className={`h-8 w-8 rounded-full ${hasValidData ? 'bg-primary' : ''}`}
            disabled={addressPickerActive || !hasValidData}
            onClick={handleSubmit}
          >
            <Check className="w-4 h-4" />
          </Button>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4" noValidate={addressPickerActive}>
          {/* Start Location with Current Location button */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-green-500" />
              Start Location
            </Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <AddressAutocomplete
                  id="startLocation"
                  value={startLocation.address}
                  onChange={handleStartLocationChange}
                  onActiveChange={handleAddressActiveChange}
                  placeholder="Search or use current location"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={() => getCurrentLocation('start')}
                disabled={gettingLocation === 'start'}
              >
                {gettingLocation === 'start' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Navigation className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Multiple Stops with Current Location buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-500" />
                Stops
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addStop}
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Stop
              </Button>
            </div>
            
            {stops.map((stop, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <AddressAutocomplete
                    id={`stop-${index}`}
                    value={stop.address}
                    onChange={(value, lat, lon, addr) => handleStopChange(index, value, lat, lon, addr)}
                    onActiveChange={handleAddressActiveChange}
                    placeholder={index === stops.length - 1 ? "Final destination" : `Stop ${index + 1}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  onClick={() => getCurrentLocation(index)}
                  disabled={gettingLocation === `stop-${index}`}
                >
                  {gettingLocation === `stop-${index}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Navigation className="w-4 h-4" />
                  )}
                </Button>
                {stops.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStop(index)}
                    className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Distance */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Total Distance (km)
              {autoCalculated && (
                <Calculator className="w-3 h-3 text-primary" />
              )}
            </Label>
            <Input
              type="number"
              step="0.1"
              placeholder="0.0"
              value={formData.kilometres}
              onChange={handleKilometresChange}
              className={autoCalculated ? 'border-primary/50' : ''}
            />
            {autoCalculated && (
              <p className="text-xs text-muted-foreground">Auto-calculated • Edit if needed</p>
            )}
          </div>

          {/* Date and Time in collapsible section */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="text-xs h-9"
              />
            </div>
          </div>

          {stops.length > 1 && (
            <p className="text-xs text-muted-foreground text-center">
              {stops.filter(s => s.address).length} stops • Distance includes all points
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
