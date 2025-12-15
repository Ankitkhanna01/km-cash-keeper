import { useState, useRef } from 'react';
import { TripData } from '@/hooks/useGPSTracking';
import { format } from 'date-fns';
import { MapPin, Clock, Car, Briefcase, Home, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TripCompletionCardProps {
  trip: TripData;
  onCategorize: (category: 'business' | 'personal') => void;
  onDismiss: () => void;
}

export function TripCompletionCard({
  trip,
  onCategorize,
  onDismiss,
}: TripCompletionCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    setSwipeOffset(Math.max(-150, Math.min(150, diff)));
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (swipeOffset > 80) {
      onCategorize('business');
    } else if (swipeOffset < -80) {
      onCategorize('personal');
    }
    setSwipeOffset(0);
  };

  const duration = Math.round(
    (trip.endTime.getTime() - trip.startTime.getTime()) / 1000 / 60
  );

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Trip Completed!</h2>
          <button
            onClick={onDismiss}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Swipeable card container */}
        <div className="relative overflow-hidden rounded-2xl">
          {/* Business indicator (right swipe) */}
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-24 flex items-center justify-center transition-opacity',
              swipeOffset > 40 ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              background: 'linear-gradient(90deg, hsl(var(--primary) / 0.4), transparent)',
            }}
          >
            <div className="text-center">
              <Briefcase className="w-8 h-8 text-primary mx-auto" />
              <span className="text-xs font-medium text-primary">Business</span>
            </div>
          </div>

          {/* Personal indicator (left swipe) */}
          <div
            className={cn(
              'absolute inset-y-0 right-0 w-24 flex items-center justify-center transition-opacity',
              swipeOffset < -40 ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              background: 'linear-gradient(-90deg, hsl(var(--muted-foreground) / 0.4), transparent)',
            }}
          >
            <div className="text-center">
              <Home className="w-8 h-8 text-muted-foreground mx-auto" />
              <span className="text-xs font-medium text-muted-foreground">Personal</span>
            </div>
          </div>

          {/* Main card */}
          <div
            className={cn(
              'bg-card border border-border rounded-2xl p-5 transition-transform',
              isSwiping && 'transition-none'
            )}
            style={{ transform: `translateX(${swipeOffset}px)` }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Distance & Time highlights */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-primary/10 rounded-xl p-4 text-center">
                <Car className="w-6 h-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-primary">
                  {trip.totalKilometres.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">kilometres</p>
              </div>
              <div className="bg-secondary rounded-xl p-4 text-center">
                <Clock className="w-6 h-6 text-foreground mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">
                  {formatDuration(duration)}
                </p>
                <p className="text-xs text-muted-foreground">duration</p>
              </div>
            </div>

            {/* Trip details */}
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>
                  {trip.startLocation.latitude.toFixed(4)}, {trip.startLocation.longitude.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <MapPin className="w-4 h-4 shrink-0 text-primary" />
                <span>
                  {trip.endLocation.latitude.toFixed(4)}, {trip.endLocation.longitude.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground border-t border-border pt-3">
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  {format(trip.startTime, 'MMM d, yyyy')} • {format(trip.startTime, 'HH:mm')} - {format(trip.endTime, 'HH:mm')}
                </span>
              </div>
            </div>

            {/* Swipe hint */}
            <p className="text-xs text-center text-muted-foreground mt-4 animate-pulse">
              ← Personal | Swipe to categorize | Business →
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
