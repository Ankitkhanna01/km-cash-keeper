import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Briefcase, User } from 'lucide-react';
import { Trip } from '@/types';
import { AddressAutocomplete, AddressComponents } from './AddressAutocomplete';

interface EditTripDialogProps {
  trip: Trip;
  onSave: (id: string, updates: Partial<Trip>) => void;
}

export function EditTripDialog({ trip, onSave }: EditTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [kilometres, setKilometres] = useState(trip.kilometres.toString());
  const [startLocation, setStartLocation] = useState(trip.startLocation);
  const [endLocation, setEndLocation] = useState(trip.endLocation);
  const [notes, setNotes] = useState(trip.notes || '');
  const [date, setDate] = useState(trip.date);
  const [startTime, setStartTime] = useState(trip.startTime);
  const [endTime, setEndTime] = useState(trip.endTime);
  const [category, setCategory] = useState<'business' | 'personal' | 'uncategorized'>(trip.category);

  const handleStartLocationChange = (value: string, lat?: number, lon?: number, address?: AddressComponents) => {
    setStartLocation(value);
  };

  const handleEndLocationChange = (value: string, lat?: number, lon?: number, address?: AddressComponents) => {
    setEndLocation(value);
  };

  const handleSave = () => {
    onSave(trip.id, {
      kilometres: parseFloat(kilometres) || trip.kilometres,
      startLocation,
      endLocation,
      notes: notes.trim() || undefined,
      date,
      startTime,
      endTime,
      category,
    });
    setOpen(false);
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // Reset form to current trip values when opening
      setKilometres(trip.kilometres.toString());
      setStartLocation(trip.startLocation);
      setEndLocation(trip.endLocation);
      setNotes(trip.notes || '');
      setDate(trip.date);
      setStartTime(trip.startTime);
      setEndTime(trip.endTime);
      setCategory(trip.category);
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="iconSm" className="text-muted-foreground hover:text-primary">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Trip</DialogTitle>
          <DialogDescription>Update trip details below</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-km">Distance (km)</Label>
              <Input
                id="edit-km"
                type="number"
                step="0.1"
                value={kilometres}
                onChange={(e) => setKilometres(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-start-time">Start Time</Label>
              <Input
                id="edit-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-end-time">End Time</Label>
              <Input
                id="edit-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-start">Start Location</Label>
            <AddressAutocomplete
              id="edit-start"
              value={startLocation}
              onChange={handleStartLocationChange}
              placeholder="Start address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-end">End Location</Label>
            <AddressAutocomplete
              id="edit-end"
              value={endLocation}
              onChange={handleEndLocationChange}
              placeholder="End address"
            />
          </div>

          <div className="space-y-2">
            <Label>Trip Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={category === 'business' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory('business')}
                className="flex-1 gap-2"
              >
                <Briefcase className="w-4 h-4" />
                Business
              </Button>
              <Button
                type="button"
                variant={category === 'personal' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory('personal')}
                className="flex-1 gap-2"
              >
                <User className="w-4 h-4" />
                Personal
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes or comments..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} className="flex-1">
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
