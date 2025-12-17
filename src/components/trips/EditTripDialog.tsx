import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil } from 'lucide-react';
import { Trip } from '@/types';

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

  const handleSave = () => {
    onSave(trip.id, {
      kilometres: parseFloat(kilometres) || trip.kilometres,
      startLocation,
      endLocation,
      notes: notes.trim() || undefined,
      date,
      startTime,
      endTime,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Trip</DialogTitle>
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
            <Input
              id="edit-start"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              placeholder="Start address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-end">End Location</Label>
            <Input
              id="edit-end"
              value={endLocation}
              onChange={(e) => setEndLocation(e.target.value)}
              placeholder="End address"
            />
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
