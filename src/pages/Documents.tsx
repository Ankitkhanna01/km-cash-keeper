import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AddDocumentDialog } from '@/components/documents/AddDocumentDialog';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { BusinessActivityView } from '@/components/documents/BusinessActivityView';
import { PerformanceRatiosCard } from '@/components/documents/PerformanceRatiosCard';
import { OdometerGapDialog } from '@/components/documents/OdometerGapDialog';
import { useDocumentsDB } from '@/hooks/useDocumentsDB';
import { useOdometerGapsDB } from '@/hooks/useOdometerGapsDB';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { Plus, FileText, Loader2, AlertTriangle } from 'lucide-react';

export default function Documents() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showGapDialog, setShowGapDialog] = useState(false);
  
  const { documents, loading: docsLoading, deleteDocument, getDocumentsByYear } = useDocumentsDB();
  const { gaps, calculateGap, getGapForYear, hasPendingGaps } = useOdometerGapsDB();
  const { getStats } = useTripsDB();
  const { getTotalKmForYear } = useOdometerDB();

  const year = parseInt(selectedYear);
  const yearDocs = getDocumentsByYear(year);
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);
  
  const tripStats = getStats(year);
  const odometerTotal = getTotalKmForYear(year);
  const gap = getGapForYear(year);

  // Calculate gap when odometer data changes
  useEffect(() => {
    if (odometerTotal && odometerTotal > 0) {
      const businessKm = tripStats.businessKilometres;
      const personalKm = tripStats.totalKilometres - tripStats.businessKilometres;
      calculateGap(year, businessKm, personalKm, odometerTotal);
    }
  }, [year, odometerTotal, tripStats.businessKilometres, tripStats.totalKilometres]);

  const handleDelete = async (id: string) => {
    if (confirm('Delete this document?')) {
      await deleteDocument(id);
    }
  };

  if (docsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Income Documents"
        subtitle="CRA Audit Package"
        action={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        }
      />

      {/* Year Selector */}
      <div className="mb-4">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>
                Tax Year {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Odometer Gap Alert */}
      {gap && gap.gap_status === 'pending' && gap.gap_km > 0 && (
        <Card variant="outline" className="mb-4 border-warning/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="font-medium text-warning">Odometer Gap Detected</p>
                <p className="text-xs text-muted-foreground">
                  {gap.gap_km.toFixed(1)} km unaccounted for CRA compliance
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowGapDialog(true)}>
              Resolve
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents">
            Documents ({yearDocs.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Business Activity
          </TabsTrigger>
          <TabsTrigger value="ratios">
            Ratios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-3">
          {yearDocs.length === 0 ? (
            <Card variant="outline">
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  No documents for {year}
                </p>
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Document
                </Button>
              </CardContent>
            </Card>
          ) : (
            yearDocs.map(doc => (
              <DocumentCard 
                key={doc.id} 
                document={doc} 
                onDelete={handleDelete}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="activity">
          <BusinessActivityView year={year} />
        </TabsContent>

        <TabsContent value="ratios">
          <PerformanceRatiosCard year={year} />
        </TabsContent>
      </Tabs>

      <AddDocumentDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog} 
      />

      {gap && (
        <OdometerGapDialog
          open={showGapDialog}
          onOpenChange={setShowGapDialog}
          year={year}
          gapKm={gap.gap_km}
        />
      )}
    </AppLayout>
  );
}
