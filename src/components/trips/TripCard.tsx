import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trip } from '@/types';
import { MapPin, Clock, Car, Briefcase, Home, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EditTripDialog } from './EditTripDialog';
import { formatDateForDisplay } from '@/lib/dateUtils';

interface TripCardProps {
  trip: Trip;
  onCategorize?: (id: string, category: 'business' | 'personal', notes?: string) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Trip>) => void;
  showSwipeHint?: boolean;
}

export function TripCard({ trip, onCategorize, onDelete, onUpdate, showSwipeHint }: TripCardProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [notes, setNotes] = useState(trip.notes || '');
  const [showNotesInput, setShowNotesInput] = useState(false);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (trip.category !== 'uncategorized') return;
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || trip.category !== 'uncategorized') return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX.current;
    setSwipeOffset(Math.max(-100, Math.min(100, diff)));
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (swipeOffset > 60 && onCategorize) {
      onCategorize(trip.id, 'business', notes.trim() || undefined);
    } else if (swipeOffset < -60 && onCategorize) {
      onCategorize(trip.id, 'personal', notes.trim() || undefined);
    }
    setSwipeOffset(0);
  };

  const handleCategoryClick = (category: 'business' | 'personal') => {
    if (onCategorize) {
      onCategorize(trip.id, category, notes.trim() || undefined);
    }
  };

  const handleUpdate = (id: string, updates: Partial<Trip>) => {
    if (onUpdate) {
      onUpdate(id, updates);
    }
  };

  const getCategoryBadge = () => {
    if (trip.category === 'business') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
          <Briefcase className="w-3 h-3" />
          Business
        </span>
      );
    }
    if (trip.category === 'personal') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          <Home className="w-3 h-3" />
          Personal
        </span>
      );
    }
    return null;
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe indicators */}
      {trip.category === 'uncategorized' && (
        <>
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-20 flex items-center justify-center transition-opacity',
              swipeOffset > 30 ? 'opacity-100' : 'opacity-0'
            )}
            style={{ background: 'linear-gradient(90deg, hsl(var(--primary) / 0.3), transparent)' }}
          >
            <Briefcase className="w-6 h-6 text-primary" />
          </div>
          <div
            className={cn(
              'absolute inset-y-0 right-0 w-20 flex items-center justify-center transition-opacity',
              swipeOffset < -30 ? 'opacity-100' : 'opacity-0'
            )}
            style={{ background: 'linear-gradient(-90deg, hsl(var(--muted-foreground) / 0.3), transparent)' }}
          >
            <Home className="w-6 h-6 text-muted-foreground" />
          </div>
        </>
      )}

      <Card
        ref={cardRef}
        variant={trip.category === 'uncategorized' ? 'interactive' : 'default'}
        className={cn(
          'relative transition-transform duration-200',
          isSwiping && 'transition-none'
        )}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-secondary">
                <Car className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {trip.kilometres.toFixed(1)} km
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateForDisplay(trip.date)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getCategoryBadge()}
              {onUpdate && (
                <EditTripDialog trip={trip} onSave={handleUpdate} />
              )}
              {onDelete && trip.category !== 'uncategorized' && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => onDelete(trip.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">From</p>
                <p className="text-foreground truncate">{trip.startLocation}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">To</p>
                <p className="text-foreground truncate">{trip.endLocation}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>{trip.startTime} - {trip.endTime}</span>
            </div>
          </div>

          {/* Show notes if exists */}
          {trip.notes && trip.category !== 'uncategorized' && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-start gap-2 text-sm">
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">{trip.notes}</p>
              </div>
            </div>
          )}

          {/* Notes input for uncategorized trips */}
          {trip.category === 'uncategorized' && (
            <div className="mt-3 pt-3 border-t border-border space-y-3">
              {!showNotesInput ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotesInput(true)}
                  className="text-muted-foreground w-full justify-start"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Add notes before categorizing...
                </Button>
              ) : (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes or comments..."
                  rows={2}
                  className="text-sm"
                />
              )}
              
              {/* Category buttons for desktop/easier access */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCategoryClick('business')}
                  className="flex-1 text-primary border-primary/30 hover:bg-primary/10"
                >
                  <Briefcase className="w-4 h-4 mr-1" />
                  Business
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCategoryClick('personal')}
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-1" />
                  Personal
                </Button>
              </div>
            </div>
          )}

          {showSwipeHint && trip.category === 'uncategorized' && (
            <p className="text-xs text-center text-muted-foreground mt-3 animate-pulse">
              ← Swipe left for Personal | Swipe right for Business →
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
