import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, FileText, DollarSign, Route } from 'lucide-react';
import { PLATFORM_LABELS, MONTH_NAMES, SOURCE_TYPE_LABELS, type Document } from '@/types/documents';

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => void;
}

export function DocumentCard({ document: doc, onDelete }: DocumentCardProps) {
  const totalKm = (doc.kilometres || 0) + (doc.estimated_km || 0);
  const hasEstimatedKm = doc.estimated_km && doc.estimated_km > 0 && !doc.has_verified_km;

  return (
    <Card variant="elevated" className="relative">
      <CardHeader className="pb-2 pr-12">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            {MONTH_NAMES[doc.period_month - 1]} {doc.period_year}
          </CardTitle>
        </div>
        <div className="flex gap-1 flex-wrap mt-1">
          {doc.platform && (
            <Badge variant="secondary" className="text-xs">
              {PLATFORM_LABELS[doc.platform]}
            </Badge>
          )}
          <Badge variant={doc.source_type === 'primary' ? 'default' : 'outline'} className="text-xs">
            {doc.source_type === 'primary' ? 'Primary' : 'Secondary'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Income</p>
              <p className="font-semibold">${doc.income_amount?.toFixed(2) || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">
                Kilometres {hasEstimatedKm && '(est.)'}
              </p>
              <p className="font-semibold">
                {totalKm > 0 ? `${totalKm.toFixed(1)} km` : '—'}
              </p>
            </div>
          </div>
        </div>

        {doc.income_amount && doc.income_amount > 0 && totalKm > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Ratio: {(totalKm / doc.income_amount).toFixed(3)} km/$
            </p>
          </div>
        )}

        {doc.notes && (
          <p className="text-xs text-muted-foreground italic">
            {doc.notes}
          </p>
        )}
      </CardContent>

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(doc.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </Card>
  );
}
