import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString } from '@/lib/dateUtils';
import { isValidCoordinate } from '@/lib/coordinateUtils';
import { Clock, MapPin, AlertTriangle, Car, ChevronLeft, ChevronRight, Calendar, Pencil, Loader2, Plus } from 'lucide-react';
import { AddressAutocomplete, AddressComponents } from './AddressAutocomplete';
import { supabase } from '@/integrations/supabase/client';

interface TripTimelineProps {
  trips: Trip[];
  date?: string;
  onUpdate?: (id: string, updates: Partial<Trip>) => Promise<void>;
  onCreate?: (trip: Omit<Trip, 'id' | 'created_at' | 'user_id'>) => Promise<void>;
}

interface TimelineSegment {
  type: 'trip' | 'gap';
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  trip?: Trip;
  estimatedGapKm?: number;
  gapStartLocation?: string;
  gapEndLocation?: string;
}

// Parse time string (HH:MM) to minutes since midnight
function parseTimeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

// Format minutes to HH:MM
function formatMinutesToTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Calculate duration in minutes
function getDuration(startMinutes: number, endMinutes: number): number {
  return endMinutes >= startMinutes ? endMinutes - startMinutes : (1440 - startMinutes) + endMinutes;
}

// Format date for display
function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TripTimeline({ trips, date, onUpdate, onCreate }: TripTimelineProps) {
  const today = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(date || today);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [creatingFromGap, setCreatingFromGap] = useState<TimelineSegment | null>(null);
  const [editForm, setEditForm] = useState({
    start_time: '',
    end_time: '',
    start_location: '',
    end_location: '',
    kilometres: '',
    category: 'uncategorized' as 'business' | 'personal' | 'uncategorized',
  });
  const [startCoords, setStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [endCoords, setEndCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  const { segments, stats } = useMemo(() => {
    const dayTrips = trips
      .filter(t => t.date === selectedDate)
      .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
    
    if (dayTrips.length === 0) {
      return { segments: [], stats: { totalTrips: 0, totalKm: 0, gaps: 0, gapTime: 0 } };
    }

    const timelineSegments: TimelineSegment[] = [];
    let totalGaps = 0;
    let totalGapMinutes = 0;

    for (let i = 0; i < dayTrips.length; i++) {
      const trip = dayTrips[i];
      const tripStart = parseTimeToMinutes(trip.start_time);
      const tripEnd = parseTimeToMinutes(trip.end_time);

      timelineSegments.push({
        type: 'trip',
        startTime: trip.start_time,
        endTime: trip.end_time,
        startMinutes: tripStart,
        endMinutes: tripEnd,
        trip,
      });

      if (i < dayTrips.length - 1) {
        const nextTrip = dayTrips[i + 1];
        const nextStart = parseTimeToMinutes(nextTrip.start_time);
        
        const currEnd = trip.end_location.toLowerCase().trim();
        const nextStart2 = nextTrip.start_location.toLowerCase().trim();
        const locationsMatch = currEnd === nextStart2 || 
          currEnd.includes(nextStart2.split(',')[0]) || 
          nextStart2.includes(currEnd.split(',')[0]);

        const gapMinutes = getDuration(tripEnd, nextStart);
        
        if (gapMinutes > 5 && !locationsMatch) {
          totalGaps++;
          totalGapMinutes += gapMinutes;
          const estimatedGapKm = Math.round(gapMinutes / 2 * 10) / 10;
          
          timelineSegments.push({
            type: 'gap',
            startTime: trip.end_time,
            endTime: nextTrip.start_time,
            startMinutes: tripEnd,
            endMinutes: nextStart,
            estimatedGapKm,
            gapStartLocation: trip.end_location,
            gapEndLocation: nextTrip.start_location,
          });
        }
      }
    }

    const totalKm = dayTrips.reduce((sum, t) => sum + t.kilometres, 0);

    return {
      segments: timelineSegments,
      stats: {
        totalTrips: dayTrips.length,
        totalKm,
        gaps: totalGaps,
        gapTime: totalGapMinutes,
      },
    };
  }, [trips, selectedDate]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = new Date(selectedDate + 'T12:00:00');
    current.setDate(current.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const openEditDialog = (trip: Trip) => {
    setEditingTrip(trip);
    setCreatingFromGap(null);
    setEditForm({
      start_time: trip.start_time,
      end_time: trip.end_time,
      start_location: trip.start_location,
      end_location: trip.end_location,
      kilometres: trip.kilometres.toString(),
      category: trip.category as 'business' | 'personal' | 'uncategorized',
    });
    setStartCoords(null);
    setEndCoords(null);
  };

  const openCreateFromGap = (gap: TimelineSegment) => {
    if (!onCreate) return;
    setCreatingFromGap(gap);
    setEditingTrip(null);
    setEditForm({
      start_time: gap.startTime,
      end_time: gap.endTime,
      start_location: gap.gapStartLocation || '',
      end_location: gap.gapEndLocation || '',
      kilometres: gap.estimatedGapKm?.toString() || '0',
      category: 'uncategorized',
    });
    setStartCoords(null);
    setEndCoords(null);
  };

  const calculateDistance = async (startLat: number, startLon: number, endLat: number, endLon: number) => {
    // Validate coordinates before making API call
    if (!isValidCoordinate(startLat, startLon) || !isValidCoordinate(endLat, endLon)) {
      console.error('Invalid coordinates for distance calculation');
      return;
    }

    setCalculating(true);
    try {
      // Use OSRM for route distance calculation
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`
      );
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        const distanceKm = data.routes[0].distance / 1000;
        setEditForm(prev => ({ ...prev, kilometres: distanceKm.toFixed(1) }));
      }
    } catch (error) {
      console.error('Failed to calculate distance:', error);
    } finally {
      setCalculating(false);
    }
  };

  const handleStartAddressChange = (address: string, lat?: number, lon?: number, components?: AddressComponents) => {
    setEditForm(prev => ({ ...prev, start_location: address }));
    if (lat && lon) {
      setStartCoords({ lat, lon });
      if (endCoords) {
        calculateDistance(lat, lon, endCoords.lat, endCoords.lon);
      }
    }
  };

  const handleEndAddressChange = (address: string, lat?: number, lon?: number, components?: AddressComponents) => {
    setEditForm(prev => ({ ...prev, end_location: address }));
    if (lat && lon) {
      setEndCoords({ lat, lon });
      if (startCoords) {
        calculateDistance(startCoords.lat, startCoords.lon, lat, lon);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTrip || !onUpdate) return;
    
    setSaving(true);
    try {
      await onUpdate(editingTrip.id, {
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        start_location: editForm.start_location,
        end_location: editForm.end_location,
        kilometres: parseFloat(editForm.kilometres) || editingTrip.kilometres,
        category: editForm.category,
      });
      setEditingTrip(null);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!creatingFromGap || !onCreate) return;
    
    setSaving(true);
    try {
      await onCreate({
        date: selectedDate,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        start_location: editForm.start_location,
        end_location: editForm.end_location,
        kilometres: parseFloat(editForm.kilometres) || 0,
        category: editForm.category,
        notes: null,
        start_street: null,
        start_city: null,
        start_postal_code: null,
        start_province: null,
        end_street: null,
        end_city: null,
        end_postal_code: null,
        end_province: null,
      });
      setCreatingFromGap(null);
    } finally {
      setSaving(false);
    }
  };

  const isToday = selectedDate === today;

  if (segments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Trip Timeline
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1 text-sm min-w-[120px] justify-center">
                <Calendar className="w-4 h-4" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => navigateDate('next')}
                disabled={isToday}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No trips for {formatDateDisplay(selectedDate)}
          </p>
        </CardContent>
      </Card>
    );
  }

  const firstStart = segments[0].startMinutes;
  const lastEnd = segments[segments.length - 1].endMinutes;
  const totalMinutes = getDuration(firstStart, lastEnd);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Trip Timeline
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 w-[130px] text-xs"
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={() => navigateDate('next')}
                disabled={isToday}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{formatDateDisplay(selectedDate)}</span>
            <span>•</span>
            <span>{stats.totalTrips} trips</span>
            <span>•</span>
            <span>{stats.totalKm.toFixed(1)} km</span>
            {stats.gaps > 0 && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-orange-500 border-orange-500/50 text-xs">
                  {stats.gaps} gap{stats.gaps !== 1 ? 's' : ''}
                </Badge>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Visual timeline bar */}
          <div className="relative h-8 bg-secondary rounded-full overflow-hidden">
            {segments.map((segment, index) => {
              const startOffset = getDuration(firstStart, segment.startMinutes);
              const duration = getDuration(segment.startMinutes, segment.endMinutes);
              const leftPercent = (startOffset / totalMinutes) * 100;
              const widthPercent = Math.max((duration / totalMinutes) * 100, 2);

              return (
                <div
                  key={index}
                  className={`absolute top-0 h-full transition-all ${
                    segment.type === 'trip'
                      ? segment.trip?.category === 'business'
                        ? 'bg-green-500'
                        : segment.trip?.category === 'personal'
                        ? 'bg-blue-500'
                        : 'bg-primary'
                      : 'bg-orange-500/50 border-2 border-dashed border-orange-500'
                  }`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  title={
                    segment.type === 'trip'
                      ? `${segment.trip?.start_location.split(',')[0]} → ${segment.trip?.end_location.split(',')[0]}`
                      : `Gap: ~${segment.estimatedGapKm} km`
                  }
                />
              );
            })}
          </div>

          {/* Time labels */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatMinutesToTime(firstStart)}</span>
            <span>{formatMinutesToTime(lastEnd)}</span>
          </div>

          {/* Detailed segment list */}
          <div className="space-y-2 mt-4">
            {segments.map((segment, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                  segment.type === 'gap'
                    ? 'bg-orange-500/10 border border-orange-500/20'
                    : 'bg-secondary/50 hover:bg-secondary/80 cursor-pointer'
                }`}
                onClick={() => segment.type === 'trip' && segment.trip && onUpdate && openEditDialog(segment.trip)}
              >
                {segment.type === 'trip' ? (
                  <>
                    <Car className={`w-4 h-4 shrink-0 ${
                      segment.trip?.category === 'business'
                        ? 'text-green-500'
                        : segment.trip?.category === 'personal'
                        ? 'text-blue-500'
                        : 'text-primary'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{segment.startTime}</span>
                        <span>→</span>
                        <span>{segment.endTime}</span>
                        <span className="ml-auto">{segment.trip?.kilometres.toFixed(1)} km</span>
                      </div>
                      <div className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0 text-green-500" />
                        <span className="truncate">{segment.trip?.start_location.split(',')[0]}</span>
                        <span className="shrink-0">→</span>
                        <MapPin className="w-3 h-3 shrink-0 text-red-500" />
                        <span className="truncate">{segment.trip?.end_location.split(',')[0]}</span>
                      </div>
                    </div>
                    {onUpdate && (
                      <Pencil className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    {segment.trip?.category !== 'uncategorized' && (
                      <Badge variant="outline" className={`shrink-0 ${
                        segment.trip?.category === 'business' ? 'text-green-500' : 'text-blue-500'
                      }`}>
                        {segment.trip?.category === 'business' ? 'B' : 'P'}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-xs text-orange-600">
                        <span>{segment.startTime}</span>
                        <span>→</span>
                        <span>{segment.endTime}</span>
                        <span className="ml-auto">~{segment.estimatedGapKm} km?</span>
                      </div>
                      <p className="text-xs text-orange-500">
                        Potential missed segment
                      </p>
                    </div>
                    {onCreate && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="shrink-0 gap-1 text-orange-500 hover:text-orange-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateFromGap(segment);
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Business</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Personal</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-primary" />
              <span>Uncategorized</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded border-2 border-dashed border-orange-500 bg-orange-500/20" />
              <span>Gap</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Trip Dialog */}
      <Dialog open={!!editingTrip} onOpenChange={(open) => !open && setEditingTrip(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Trip</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm(prev => ({ ...prev, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm(prev => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Start Location</Label>
              <AddressAutocomplete
                value={editForm.start_location}
                onChange={handleStartAddressChange}
                placeholder="Start address"
              />
            </div>

            <div className="space-y-2">
              <Label>End Location</Label>
              <AddressAutocomplete
                value={editForm.end_location}
                onChange={handleEndAddressChange}
                placeholder="End address"
              />
            </div>

            <div className="space-y-2">
              <Label>Distance (km)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.kilometres}
                  onChange={(e) => setEditForm(prev => ({ ...prev, kilometres: e.target.value }))}
                />
                {calculating && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              {startCoords && endCoords && (
                <p className="text-xs text-muted-foreground">Auto-calculated from addresses</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value as 'business' | 'personal' | 'uncategorized' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingTrip(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Trip from Gap Dialog */}
      <Dialog open={!!creatingFromGap} onOpenChange={(open) => !open && setCreatingFromGap(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Trip from Gap</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={editForm.start_time}
                  onChange={(e) => setEditForm(prev => ({ ...prev, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editForm.end_time}
                  onChange={(e) => setEditForm(prev => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Start Location</Label>
              <AddressAutocomplete
                value={editForm.start_location}
                onChange={handleStartAddressChange}
                placeholder="Start address"
              />
            </div>

            <div className="space-y-2">
              <Label>End Location</Label>
              <AddressAutocomplete
                value={editForm.end_location}
                onChange={handleEndAddressChange}
                placeholder="End address"
              />
            </div>

            <div className="space-y-2">
              <Label>Distance (km)</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  value={editForm.kilometres}
                  onChange={(e) => setEditForm(prev => ({ ...prev, kilometres: e.target.value }))}
                />
                {calculating && (
                  <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) => setEditForm(prev => ({ ...prev, category: value as 'business' | 'personal' | 'uncategorized' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreatingFromGap(null)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleCreateTrip} className="flex-1" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Trip
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
