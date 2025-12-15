import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Gauge, Save, Edit2 } from 'lucide-react';
import { useOdometerDB, OdometerReading } from '@/hooks/useOdometerDB';

interface OdometerCardProps {
  year: number;
}

export function OdometerCard({ year }: OdometerCardProps) {
  const { getReadingForYear, upsertReading, loading } = useOdometerDB();
  const reading = getReadingForYear(year);
  
  const [isEditing, setIsEditing] = useState(false);
  const [startReading, setStartReading] = useState('');
  const [endReading, setEndReading] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (reading) {
      setStartReading(reading.start_reading.toString());
      setEndReading(reading.end_reading?.toString() || '');
    } else {
      setStartReading('');
      setEndReading('');
    }
  }, [reading]);

  const handleSave = async () => {
    setSaving(true);
    const start = parseFloat(startReading) || 0;
    const end = endReading ? parseFloat(endReading) : null;
    
    await upsertReading(year, start, end);
    setSaving(false);
    setIsEditing(false);
  };

  const totalKm = reading?.end_reading 
    ? reading.end_reading - reading.start_reading 
    : null;

  if (loading) {
    return (
      <Card variant="elevated">
        <CardContent className="p-4">
          <div className="h-20 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Odometer ({year})
          </div>
          {!isEditing && (
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Jan 1 Reading</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000"
                  value={startReading}
                  onChange={(e) => setStartReading(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Dec 31 Reading</Label>
                <Input
                  type="number"
                  placeholder="e.g. 65000"
                  value={endReading}
                  onChange={(e) => setEndReading(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1">
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Start</p>
              <p className="font-semibold">
                {reading?.start_reading ? reading.start_reading.toLocaleString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">End</p>
              <p className="font-semibold">
                {reading?.end_reading ? reading.end_reading.toLocaleString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold text-primary">
                {totalKm !== null ? `${totalKm.toLocaleString()} km` : '—'}
              </p>
            </div>
          </div>
        )}
        {!reading && !isEditing && (
          <p className="text-xs text-muted-foreground text-center">
            Tap edit to add odometer readings for CRA compliance
          </p>
        )}
      </CardContent>
    </Card>
  );
}
