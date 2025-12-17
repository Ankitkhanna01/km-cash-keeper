import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trip } from '@/hooks/useTripsDB';
import { getLocalDateString } from '@/lib/dateUtils';
import { Clock, MapPin, AlertTriangle, Car, Navigation } from 'lucide-react';

interface TripTimelineProps {
  trips: Trip[];
  date?: string; // defaults to today
}

interface TimelineSegment {
  type: 'trip' | 'gap';
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  trip?: Trip;
  estimatedGapKm?: number;
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

export function TripTimeline({ trips, date }: TripTimelineProps) {
  const targetDate = date || getLocalDateString();
  
  const { segments, stats } = useMemo(() => {
    // Filter trips for the target date
    const dayTrips = trips
      .filter(t => t.date === targetDate)
      .sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
    
    if (dayTrips.length === 0) {
      return { segments: [], stats: { totalTrips: 0, totalKm: 0, gaps: 0, gapTime: 0 } };
    }

    const timelineSegments: TimelineSegment[] = [];
    let totalGaps = 0;
    let totalGapMinutes = 0;

    // Build timeline with trips and gaps
    for (let i = 0; i < dayTrips.length; i++) {
      const trip = dayTrips[i];
      const tripStart = parseTimeToMinutes(trip.start_time);
      const tripEnd = parseTimeToMinutes(trip.end_time);

      // Add trip segment
      timelineSegments.push({
        type: 'trip',
        startTime: trip.start_time,
        endTime: trip.end_time,
        startMinutes: tripStart,
        endMinutes: tripEnd,
        trip,
      });

      // Check for gap to next trip
      if (i < dayTrips.length - 1) {
        const nextTrip = dayTrips[i + 1];
        const nextStart = parseTimeToMinutes(nextTrip.start_time);
        
        // Check if locations don't match (potential missed segment)
        const currEnd = trip.end_location.toLowerCase().trim();
        const nextStart2 = nextTrip.start_location.toLowerCase().trim();
        const locationsMatch = currEnd === nextStart2 || 
          currEnd.includes(nextStart2.split(',')[0]) || 
          nextStart2.includes(currEnd.split(',')[0]);

        const gapMinutes = getDuration(tripEnd, nextStart);
        
        // Only show gap if there's time between trips AND locations don't match
        if (gapMinutes > 5 && !locationsMatch) {
          totalGaps++;
          totalGapMinutes += gapMinutes;
          
          // Rough estimate: 1km per 2 minutes of gap
          const estimatedGapKm = Math.round(gapMinutes / 2 * 10) / 10;
          
          timelineSegments.push({
            type: 'gap',
            startTime: trip.end_time,
            endTime: nextTrip.start_time,
            startMinutes: tripEnd,
            endMinutes: nextStart,
            estimatedGapKm,
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
  }, [trips, targetDate]);

  if (segments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Trip Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No trips logged for today
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate timeline bounds
  const firstStart = segments[0].startMinutes;
  const lastEnd = segments[segments.length - 1].endMinutes;
  const totalMinutes = getDuration(firstStart, lastEnd);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Trip Timeline
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{stats.totalTrips} trips</span>
            <span>•</span>
            <span>{stats.totalKm.toFixed(1)} km</span>
            {stats.gaps > 0 && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                  {stats.gaps} gap{stats.gaps !== 1 ? 's' : ''}
                </Badge>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Visual timeline bar */}
        <div className="relative h-8 bg-secondary rounded-full overflow-hidden">
          {segments.map((segment, index) => {
            const startOffset = getDuration(firstStart, segment.startMinutes);
            const duration = getDuration(segment.startMinutes, segment.endMinutes);
            const leftPercent = (startOffset / totalMinutes) * 100;
            const widthPercent = Math.max((duration / totalMinutes) * 100, 2); // min 2% width for visibility

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
                  : 'bg-secondary/50'
              }`}
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
                </>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground border-t">
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
  );
}
