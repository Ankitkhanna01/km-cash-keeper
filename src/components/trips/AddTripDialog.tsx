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
import { Plus, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { AddressAutocomplete, calculateDistance } from './AddressAutocomplete';

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

interface Coordinates {
  lat?: number;
  lon?: number;
}

export function AddTripDialog({ onAdd }: AddTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: format(new Date(), 'HH:mm'),
    endTime: format(new Date(), 'HH:mm'),
    startLocation: '',
    endLocation: '',
    kilometres: '',
  });
  const [startCoords, setStartCoords] = useState<Coordinates>({});
  const [endCoords, setEndCoords] = useState<Coordinates>({});
  const [autoCalculated, setAutoCalculated] = useState(false);

  // Auto-calculate distance when both coordinates are available
  useEffect(() => {
    if (startCoords.lat && startCoords.lon && endCoords.lat && endCoords.lon) {
      const distance = calculateDistance(
        startCoords.lat,
        startCoords.lon,
        endCoords.lat,
        endCoords.lon
      );
      setFormData(prev => ({ ...prev, kilometres: distance.toString() }));
      setAutoCalculated(true);
    }
  }, [startCoords, endCoords]);

  const handleStartLocationChange = (value: string, lat?: number, lon?: number) => {
    setFormData(prev => ({ ...prev, startLocation: value }));
    if (lat && lon) {
      setStartCoords({ lat, lon });
    }
  };

  const handleEndLocationChange = (value: string, lat?: number, lon?: number) => {
    setFormData(prev => ({ ...prev, endLocation: value }));
    if (lat && lon) {
      setEndCoords({ lat, lon });
    }
  };

  const handleKilometresChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, kilometres: e.target.value });
    setAutoCalculated(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onAdd({
      date: formData.date,
      start_time: formData.startTime,
      end_time: formData.endTime,
      start_location: formData.startLocation,
      end_location: formData.endLocation,
      kilometres: parseFloat(formData.kilometres) || 0,
      category: 'uncategorized',
    });

    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      startTime: format(new Date(), 'HH:mm'),
      endTime: format(new Date(), 'HH:mm'),
      startLocation: '',
      endLocation: '',
      kilometres: '',
    });
    setStartCoords({});
    setEndCoords({});
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
      <DialogContent className="glass-card border-border max-w-sm mx-auto">
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
                Distance (km)
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

          <div className="space-y-2">
            <Label htmlFor="startLocation">Start Location</Label>
            <AddressAutocomplete
              id="startLocation"
              value={formData.startLocation}
              onChange={handleStartLocationChange}
              placeholder="Type address to search..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endLocation">End Location</Label>
            <AddressAutocomplete
              id="endLocation"
              value={formData.endLocation}
              onChange={handleEndLocationChange}
              placeholder="Type address to search..."
            />
          </div>

          <Button type="submit" className="w-full">
            Add Trip
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}