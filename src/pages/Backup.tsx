import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Download, Mail, Upload, FileJson, FileSpreadsheet, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  generateBackupJSON,
  generateTripsCSV,
  generateExpensesCSV,
  generateOdometerCSV,
  downloadFile,
  openEmailWithBackup,
  parseBackupFile,
  findDuplicates,
  getNewItems,
  BackupData,
  DuplicateItem,
} from '@/lib/backupUtils';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function Backup() {
  const { user } = useAuth();
  const { trips, loading: tripsLoading, refetch: refetchTrips } = useTripsDB();
  const { expenses, loading: expensesLoading, refetch: refetchExpenses } = useExpensesDB();
  const { readings, loading: odometerLoading, refetch: refetchOdometer } = useOdometerDB();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importing, setImporting] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([]);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Record<string, 'existing' | 'imported'>>({});
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);

  const loading = tripsLoading || expensesLoading || odometerLoading;
  const today = format(new Date(), 'yyyy-MM-dd');

  const handleDownloadJSON = () => {
    const json = generateBackupJSON(trips, expenses, readings, user?.email || '');
    downloadFile(json, `cra-backup-${today}.json`, 'application/json');
    toast.success('JSON backup downloaded');
  };

  const handleDownloadCSV = () => {
    // Download all CSVs
    const tripsCSV = generateTripsCSV(trips);
    const expensesCSV = generateExpensesCSV(expenses);
    const odometerCSV = generateOdometerCSV(readings);

    downloadFile(tripsCSV, `cra-trips-${today}.csv`, 'text/csv');
    downloadFile(expensesCSV, `cra-expenses-${today}.csv`, 'text/csv');
    downloadFile(odometerCSV, `cra-odometer-${today}.csv`, 'text/csv');
    
    toast.success('CSV files downloaded');
  };

  const handleEmailBackup = () => {
    // First download the JSON
    const json = generateBackupJSON(trips, expenses, readings, user?.email || '');
    downloadFile(json, `cra-backup-${today}.json`, 'application/json');
    
    // Then open email client
    setTimeout(() => {
      openEmailWithBackup(json, user?.email || '');
      toast.success('Backup downloaded - attach it to the email');
    }, 500);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const content = await file.text();
      const backupData = parseBackupFile(content);

      if (!backupData) {
        toast.error('Invalid backup file format');
        return;
      }

      // Find duplicates
      const foundDuplicates = findDuplicates(backupData, trips, expenses, readings);

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setPendingBackup(backupData);
        // Initialize all duplicates to keep existing
        const initial: Record<string, 'existing' | 'imported'> = {};
        foundDuplicates.forEach((d) => {
          initial[d.id] = 'existing';
        });
        setSelectedDuplicates(initial);
        setDuplicateDialogOpen(true);
      } else {
        // No duplicates, import directly
        await importData(backupData, []);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import backup');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const importData = async (
    backupData: BackupData,
    duplicatesToReplace: DuplicateItem[]
  ) => {
    if (!user) return;

    setImporting(true);
    try {
      const newItems = getNewItems(backupData, duplicates);
      let importedCount = 0;

      // Import new trips
      for (const trip of newItems.trips) {
        const { error } = await supabase.from('trips').insert({
          user_id: user.id,
          date: trip.date,
          start_time: trip.start_time,
          end_time: trip.end_time,
          start_location: trip.start_location,
          end_location: trip.end_location,
          start_street: trip.start_street,
          start_city: trip.start_city,
          start_province: trip.start_province,
          start_postal_code: trip.start_postal_code,
          end_street: trip.end_street,
          end_city: trip.end_city,
          end_province: trip.end_province,
          end_postal_code: trip.end_postal_code,
          kilometres: trip.kilometres,
          category: trip.category,
          notes: trip.notes,
        });
        if (!error) importedCount++;
      }

      // Import new expenses
      for (const expense of newItems.expenses) {
        const { error } = await supabase.from('expenses').insert({
          user_id: user.id,
          date: expense.date,
          vendor_name: expense.vendor_name,
          amount: expense.amount,
          category: expense.category,
          notes: expense.notes,
          receipt_url: expense.receipt_url,
        });
        if (!error) importedCount++;
      }

      // Import new odometer readings
      for (const reading of newItems.odometerReadings) {
        const { error } = await supabase.from('odometer_readings').insert({
          user_id: user.id,
          year: reading.year,
          start_reading: reading.start_reading,
          end_reading: reading.end_reading,
        });
        if (!error) importedCount++;
      }

      // Handle duplicates user chose to replace
      for (const dup of duplicatesToReplace) {
        if (dup.type === 'trip') {
          await supabase
            .from('trips')
            .update({
              kilometres: dup.imported.kilometres,
              category: dup.imported.category,
              notes: dup.imported.notes,
            })
            .eq('id', dup.existing.id);
        } else if (dup.type === 'expense') {
          await supabase
            .from('expenses')
            .update({
              amount: dup.imported.amount,
              category: dup.imported.category,
              notes: dup.imported.notes,
            })
            .eq('id', dup.existing.id);
        } else if (dup.type === 'odometer') {
          await supabase
            .from('odometer_readings')
            .update({
              start_reading: dup.imported.start_reading,
              end_reading: dup.imported.end_reading,
            })
            .eq('id', dup.existing.id);
        }
        importedCount++;
      }

      toast.success(`Imported ${importedCount} records`);
      refetchTrips();
      refetchExpenses();
      refetchOdometer();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import some records');
    } finally {
      setImporting(false);
      setDuplicateDialogOpen(false);
      setPendingBackup(null);
      setDuplicates([]);
    }
  };

  const handleConfirmImport = () => {
    if (!pendingBackup) return;

    const duplicatesToReplace = duplicates.filter(
      (d) => selectedDuplicates[d.id] === 'imported'
    );
    importData(pendingBackup, duplicatesToReplace);
  };

  const formatDuplicateInfo = (dup: DuplicateItem) => {
    if (dup.type === 'trip') {
      return {
        existing: `${dup.existing.date} - ${dup.existing.kilometres} km - ${dup.existing.category}`,
        imported: `${dup.imported.date} - ${dup.imported.kilometres} km - ${dup.imported.category}`,
      };
    } else if (dup.type === 'expense') {
      return {
        existing: `${dup.existing.date} - $${dup.existing.amount} - ${dup.existing.vendor_name}`,
        imported: `${dup.imported.date} - $${dup.imported.amount} - ${dup.imported.vendor_name}`,
      };
    } else {
      return {
        existing: `${dup.existing.year} - Start: ${dup.existing.start_reading} km, End: ${dup.existing.end_reading || 'N/A'} km`,
        imported: `${dup.imported.year} - Start: ${dup.imported.start_reading} km, End: ${dup.imported.end_reading || 'N/A'} km`,
      };
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="Backup & Restore" />
      
      <div className="p-4 space-y-4 pb-24">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Back up your data daily to protect against data loss. All backups are CRA-compliant and include complete trip logs, expenses, and odometer readings.
          </AlertDescription>
        </Alert>

        {/* Download Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Download Backup
            </CardTitle>
            <CardDescription>
              Download your data in different formats
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleDownloadJSON} className="w-full justify-start" variant="outline">
              <FileJson className="w-4 h-4 mr-2" />
              Download JSON (For App Restore)
            </Button>
            <Button onClick={handleDownloadCSV} className="w-full justify-start" variant="outline">
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Download CSV (Human Readable)
            </Button>
          </CardContent>
        </Card>

        {/* Email Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Backup
            </CardTitle>
            <CardDescription>
              Open your email client with backup attached
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleEmailBackup} className="w-full">
              <Mail className="w-4 h-4 mr-2" />
              Download & Open Email
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Downloads the backup file and opens your default email app. Attach the downloaded file before sending.
            </p>
          </CardContent>
        </Card>

        {/* Restore Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Restore from Backup
            </CardTitle>
            <CardDescription>
              Import data from a JSON backup file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="w-full"
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Select Backup File
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Only JSON backup files can be restored. Duplicate records will be detected and you can choose which version to keep.
            </p>
          </CardContent>
        </Card>

        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Current Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{trips.length}</p>
                <p className="text-xs text-muted-foreground">Trips</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{expenses.length}</p>
                <p className="text-xs text-muted-foreground">Expenses</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{readings.length}</p>
                <p className="text-xs text-muted-foreground">Odometer</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Resolution Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate Records Found</DialogTitle>
            <DialogDescription>
              {duplicates.length} duplicate records found. Choose which version to keep for each.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              {duplicates.map((dup, index) => {
                const info = formatDuplicateInfo(dup);
                return (
                  <Card key={dup.id} className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase">
                      {dup.type} #{index + 1}
                    </p>
                    
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-border hover:bg-accent/50">
                        <Checkbox
                          checked={selectedDuplicates[dup.id] === 'existing'}
                          onCheckedChange={() =>
                            setSelectedDuplicates((prev) => ({ ...prev, [dup.id]: 'existing' }))
                          }
                        />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-green-500 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Keep Existing
                          </p>
                          <p className="text-sm">{info.existing}</p>
                        </div>
                      </label>
                      
                      <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-border hover:bg-accent/50">
                        <Checkbox
                          checked={selectedDuplicates[dup.id] === 'imported'}
                          onCheckedChange={() =>
                            setSelectedDuplicates((prev) => ({ ...prev, [dup.id]: 'imported' }))
                          }
                        />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-blue-500 flex items-center gap-1">
                            <Upload className="w-3 h-3" /> Use Imported
                          </p>
                          <p className="text-sm">{info.imported}</p>
                        </div>
                      </label>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)} className="flex-1">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleConfirmImport} disabled={importing} className="flex-1">
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
