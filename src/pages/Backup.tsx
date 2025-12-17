import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Download, Mail, Upload, FileJson, FileSpreadsheet, AlertTriangle, Check, X, Loader2, Bell, BellOff, Clock, Settings } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTripsDB } from '@/hooks/useTripsDB';
import { useExpensesDB } from '@/hooks/useExpensesDB';
import { useOdometerDB } from '@/hooks/useOdometerDB';
import { useAuth } from '@/contexts/AuthContext';
import { useBackupReminder } from '@/hooks/useBackupReminder';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function Backup() {
  const { user } = useAuth();
  const { trips, loading: tripsLoading, refetch: refetchTrips } = useTripsDB();
  const { expenses, loading: expensesLoading, refetch: refetchExpenses } = useExpensesDB();
  const { readings, loading: odometerLoading, refetch: refetchOdometer } = useOdometerDB();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    settings: backupSettings,
    showReminder,
    notificationPermission,
    requestNotificationPermission,
    sendNotification,
    markBackupDone,
    updateSettings,
    dismissReminder,
    shouldAutoBackup,
  } = useBackupReminder();

  const [importing, setImporting] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([]);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Record<string, 'existing' | 'imported'>>({});
  const [pendingBackup, setPendingBackup] = useState<BackupData | null>(null);
  const [autoBackupTriggered, setAutoBackupTriggered] = useState(false);

  const loading = tripsLoading || expensesLoading || odometerLoading;
  const today = format(new Date(), 'yyyy-MM-dd');

  // Auto-backup trigger
  useEffect(() => {
    if (!loading && !autoBackupTriggered && shouldAutoBackup()) {
      setAutoBackupTriggered(true);
      handleDownloadJSON(true);
      sendNotification('Backup Complete', 'Your daily CRA tax data backup has been downloaded.');
    }
  }, [loading, autoBackupTriggered, shouldAutoBackup]);

  // Show notification reminder
  useEffect(() => {
    if (showReminder && notificationPermission === 'granted') {
      sendNotification('Backup Reminder', "Don't forget to backup your CRA tax data today!");
    }
  }, [showReminder, notificationPermission]);

  const handleDownloadJSON = (isAutoBackup = false) => {
    const json = generateBackupJSON(trips, expenses, readings, user?.email || '');
    downloadFile(json, `cra-backup-${today}.json`, 'application/json');
    markBackupDone();
    if (!isAutoBackup) {
      toast.success('JSON backup downloaded');
    } else {
      toast.success('Auto-backup completed');
    }
  };

  const handleDownloadCSV = () => {
    const tripsCSV = generateTripsCSV(trips);
    const expensesCSV = generateExpensesCSV(expenses);
    const odometerCSV = generateOdometerCSV(readings);

    downloadFile(tripsCSV, `cra-trips-${today}.csv`, 'text/csv');
    downloadFile(expensesCSV, `cra-expenses-${today}.csv`, 'text/csv');
    downloadFile(odometerCSV, `cra-odometer-${today}.csv`, 'text/csv');
    markBackupDone();
    toast.success('CSV files downloaded');
  };

  const handleEmailBackup = () => {
    const json = generateBackupJSON(trips, expenses, readings, user?.email || '');
    downloadFile(json, `cra-backup-${today}.json`, 'application/json');
    markBackupDone();
    
    setTimeout(() => {
      openEmailWithBackup(json, user?.email || '');
      toast.success('Backup downloaded - attach it to the email');
    }, 500);
  };

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      toast.success('Notifications enabled');
    } else if (permission === 'denied') {
      toast.error('Notifications blocked. Please enable in browser settings.');
    }
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

      const foundDuplicates = findDuplicates(backupData, trips, expenses, readings);

      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setPendingBackup(backupData);
        const initial: Record<string, 'existing' | 'imported'> = {};
        foundDuplicates.forEach((d) => {
          initial[d.id] = 'existing';
        });
        setSelectedDuplicates(initial);
        setDuplicateDialogOpen(true);
      } else {
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

      for (const reading of newItems.odometerReadings) {
        const { error } = await supabase.from('odometer_readings').insert({
          user_id: user.id,
          year: reading.year,
          start_reading: reading.start_reading,
          end_reading: reading.end_reading,
        });
        if (!error) importedCount++;
      }

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
        {/* Reminder Banner */}
        {showReminder && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="flex items-center justify-between">
              <span>You haven't backed up today. Back up now to protect your data.</span>
              <Button size="sm" variant="ghost" onClick={dismissReminder}>
                <X className="w-4 h-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Back up your data daily to protect against data loss. All backups are CRA-compliant.
          </AlertDescription>
        </Alert>

        {/* Backup Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Backup Settings
            </CardTitle>
            <CardDescription>
              Configure daily reminders and automatic backups
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Notification Permission */}
            {notificationPermission !== 'granted' && (
              <Button onClick={handleEnableNotifications} variant="outline" className="w-full">
                <Bell className="w-4 h-4 mr-2" />
                Enable Browser Notifications
              </Button>
            )}

            {/* Reminder Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {backupSettings.reminderEnabled ? (
                  <Bell className="w-4 h-4 text-primary" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <Label htmlFor="reminder-toggle">Daily Reminder</Label>
              </div>
              <Switch
                id="reminder-toggle"
                checked={backupSettings.reminderEnabled}
                onCheckedChange={(checked) => updateSettings({ reminderEnabled: checked })}
              />
            </div>

            {/* Reminder Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="reminder-time">Reminder Time</Label>
              </div>
              <Input
                id="reminder-time"
                type="time"
                value={backupSettings.reminderTime}
                onChange={(e) => updateSettings({ reminderTime: e.target.value })}
                className="w-32"
              />
            </div>

            {/* Auto-Backup Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="auto-backup-toggle">Auto-Download at Reminder Time</Label>
              </div>
              <Switch
                id="auto-backup-toggle"
                checked={backupSettings.autoBackupEnabled}
                onCheckedChange={(checked) => updateSettings({ autoBackupEnabled: checked })}
              />
            </div>

            {backupSettings.lastBackupDate && (
              <p className="text-xs text-muted-foreground">
                Last backup: {backupSettings.lastBackupDate}
              </p>
            )}
          </CardContent>
        </Card>

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
            <Button onClick={() => handleDownloadJSON()} className="w-full justify-start" variant="outline">
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
              Downloads the backup file and opens your default email app.
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
              Duplicates will be detected and you can choose which to keep.
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
              {duplicates.length} duplicates found. Choose which to keep.
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
