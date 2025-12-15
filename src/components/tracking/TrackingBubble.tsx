import { useState, useRef } from 'react';
import { Navigation, Pause, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrackingBubbleProps {
  isTracking: boolean;
  tripInProgress: boolean;
  totalDistance: number;
  onToggleTracking: () => void;
  onClose: () => void;
  error: string | null;
}

export function TrackingBubble({
  isTracking,
  tripInProgress,
  totalDistance,
  onToggleTracking,
  onClose,
  error,
}: TrackingBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      posX: position.x,
      posY: position.y,
    };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartRef.current.x;
    const deltaY = touch.clientY - dragStartRef.current.y;

    const newX = Math.max(0, Math.min(window.innerWidth - 80, dragStartRef.current.posX + deltaX));
    const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStartRef.current.posY + deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - dragStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - dragStartRef.current.y);

    // Only toggle if it was a tap (not a drag)
    if (deltaX < 10 && deltaY < 10) {
      setIsExpanded(!isExpanded);
    }
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!isDragging) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div
      className={cn(
        'fixed z-50 transition-all duration-300 touch-none',
        isExpanded ? 'rounded-2xl' : 'rounded-full'
      )}
      style={{
        left: position.x,
        top: position.y,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Collapsed bubble */}
      {!isExpanded && (
        <button
          onClick={handleClick}
          className={cn(
            'w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all',
            tripInProgress
              ? 'bg-primary animate-pulse'
              : isTracking
              ? 'bg-primary/80'
              : 'bg-muted'
          )}
        >
          <Navigation
            className={cn(
              'w-6 h-6',
              isTracking ? 'text-primary-foreground' : 'text-muted-foreground'
            )}
          />
        </button>
      )}

      {/* Expanded bubble */}
      {isExpanded && (
        <div className="bg-card border border-border rounded-2xl shadow-xl p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-3 h-3 rounded-full',
                  tripInProgress
                    ? 'bg-primary animate-pulse'
                    : isTracking
                    ? 'bg-green-500'
                    : 'bg-muted-foreground'
                )}
              />
              <span className="text-sm font-medium text-foreground">
                {tripInProgress
                  ? 'Trip in Progress'
                  : isTracking
                  ? 'Tracking Active'
                  : 'Tracking Off'}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 hover:bg-muted rounded-full"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {tripInProgress && (
            <div className="bg-secondary/50 rounded-lg p-3 mb-3">
              <p className="text-xs text-muted-foreground mb-1">Distance so far</p>
              <p className="text-2xl font-bold text-primary">
                {totalDistance.toFixed(2)} km
              </p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 text-destructive text-xs p-2 rounded-lg mb-3">
              {error}
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleTracking();
            }}
            className={cn(
              'w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors',
              isTracking
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isTracking ? (
              <>
                <Pause className="w-4 h-4" />
                Stop Tracking
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Tracking
              </>
            )}
          </button>

          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Drag bubble to reposition
          </p>
        </div>
      )}
    </div>
  );
}
