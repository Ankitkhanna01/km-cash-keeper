import { useState, useEffect } from 'react';
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
import { Plus, Calculator, X, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { AddressAutocomplete, calculateTotalDistance } from './AddressAutocomplete';

interface AddTripDialogProps {
  onAdd: (trip: {
    date: string;
    start_time: string;
    end_time: string;
    start_location: string;
    end_location: string;
    kilometres: number;
    category: 'business' | 'personal' | 'uncategorized';
  }) => void;
}

interface StopLocation {
  address: string;
  lat?: number;
  lon?: number;
}

export function AddTripDialog({ onAdd }: AddTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: format(new Date(), 'HH:mm'),
    endTime: format(new Date(), 'HH:mm'),
    kilometres: '',
  });
  
  // Multi-stop support: start location + multiple stops (including final destination)
  const [startLocation, setStartLocation] = useState<StopLocation>({ address: '' });
  const [stops, setStops] = useState<StopLocation[]>([{ address: '' }]);
  const [autoCalculated, setAutoCalculated] = useState(false);

  // Auto-calculate distance when coordinates are available
  useEffect(() => {
    const allCoords: Array<{ lat: number; lon: number }> = [];
    
    if (startLocation.lat && startLocation.lon) {
      allCoords.push({ lat: startLocation.lat, lon: startLocation.lon });
    }
    
    stops.forEach(stop => {
      if (stop.lat && stop.lon) {
        allCoords.push({ lat: stop.lat, lon: stop.lon });
      }
    });

    if (allCoords.length >= 2) {
      const distance = calculateTotalDistance(allCoords);
      setFormData(prev => ({ ...prev, kilometres: distance.toString() }));
      setAutoCalculated(true);
    }
  }, [startLocation, stops]);

  const handleStartLocationChange = (value: string, lat?: number, lon?: number) => {
    setStartLocation({ address: value, lat, lon });
  };

  const handleStopChange = (index: number, value: string, lat?: number, lon?: number) => {
    setStops(prev => {
      const newStops = [...prev];
      newStops[index] = { address: value, lat, lon };
      return newStops;
    });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Combine all stops into end_location for storage (last stop is final destination)
    const allStopAddresses = stops.map(s => s.address).filter(Boolean);
    const endLocation = allStopAddresses.length > 1 
      ? allStopAddresses.join(' → ')
      : allStopAddresses[0] || '';

    onAdd({
      date: formData.date,
      start_time: formData.startTime,
      end_time: formData.endTime,
      start_location: startLocation.address,
      end_location: endLocation,
      kilometres: parseFloat(formData.kilometres) || 0,
      category: 'uncategorized',
    });

    // Reset form
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: format(new Date(), 'HH:mm'),
      endTime: format(new Date(), 'HH:mm'),
      kilometres: '',
    });
    setStartLocation({ address: '' });
    setStops([{ address: '' }]);
    setAutoCalculated(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="rounded-full shadow-lg glow">
          <Plus className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card border-border max-w-sm mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Trip</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kilometres" className="flex items-center gap-1">
                Total Distance (km)
                {autoCalculated && (
                  <span title="Auto-calculated">
                    <Calculator className="w-3 h-3 text-primary" />
                  </span>
                )}
              </Label>
              <Input
                id="kilometres"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={formData.kilometres}
                onChange={handleKilometresChange}
                required
                className={autoCalculated ? 'border-primary/50' : ''}
              />
              {autoCalculated && (
                <p className="text-xs text-muted-foreground">Auto-calculated (edit if needed)</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Start Location */}
          <div className="space-y-2">
            <Label htmlFor="startLocation" className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-green-500" />
              Start Location
            </Label>
            <AddressAutocomplete
              id="startLocation"
              value={startLocation.address}
              onChange={handleStartLocationChange}
              placeholder="Type to search address..."
            />
          </div>

          {/* Multiple Stops */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-500" />
                Stops / Destinations
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
                    onChange={(value, lat, lon) => handleStopChange(index, value, lat, lon)}
                    placeholder={index === stops.length - 1 ? "Final destination..." : `Stop ${index + 1}...`}
                  />
                </div>
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
            
            {stops.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {stops.length} stops • Distance calculated through all points
              </p>
            )}
          </div>

          <Button type="submit" className="w-full">
            Add Trip
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
