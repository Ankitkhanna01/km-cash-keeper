import { useState } from 'react';
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
import { Plus } from 'lucide-react';
import { Trip } from '@/types';
import { format } from 'date-fns';

interface AddTripDialogProps {
  onAdd: (trip: Omit<Trip, 'id' | 'createdAt'>) => void;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onAdd({
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      startLocation: formData.startLocation,
      endLocation: formData.endLocation,
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
              <Label htmlFor="kilometres">Distance (km)</Label>
              <Input
                id="kilometres"
                type="number"
                step="0.1"
                placeholder="0.0"
                value={formData.kilometres}
                onChange={(e) => setFormData({ ...formData, kilometres: e.target.value })}
                required
              />
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
            <Input
              id="startLocation"
              placeholder="e.g., Home, 123 Main St"
              value={formData.startLocation}
              onChange={(e) => setFormData({ ...formData, startLocation: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endLocation">End Location</Label>
            <Input
              id="endLocation"
              placeholder="e.g., Customer Address"
              value={formData.endLocation}
              onChange={(e) => setFormData({ ...formData, endLocation: e.target.value })}
              required
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
