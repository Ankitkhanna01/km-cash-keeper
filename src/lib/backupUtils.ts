import { format } from 'date-fns';

export interface BackupData {
  version: string;
  exportDate: string;
  exportedBy: string;
  trips: any[];
  expenses: any[];
  odometerReadings: any[];
}

export interface DuplicateItem {
  type: 'trip' | 'expense' | 'odometer';
  existing: any;
  imported: any;
  id: string;
}

export function generateBackupJSON(
  trips: any[],
  expenses: any[],
  odometerReadings: any[],
  userEmail: string
): string {
  const backup: BackupData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    exportedBy: userEmail,
    trips,
    expenses,
    odometerReadings,
  };
  return JSON.stringify(backup, null, 2);
}

export function generateTripsCSV(trips: any[]): string {
  const headers = [
    'Date',
    'Start Time',
    'End Time',
    'Start Location',
    'Start Street',
    'Start City',
    'Start Province',
    'Start Postal Code',
    'End Location',
    'End Street',
    'End City',
    'End Province',
    'End Postal Code',
    'Kilometres',
    'Category',
    'Notes',
  ];

  const rows = trips.map((trip) => [
    trip.date,
    trip.start_time,
    trip.end_time,
    `"${(trip.start_location || '').replace(/"/g, '""')}"`,
    `"${(trip.start_street || '').replace(/"/g, '""')}"`,
    `"${(trip.start_city || '').replace(/"/g, '""')}"`,
    `"${(trip.start_province || '').replace(/"/g, '""')}"`,
    `"${(trip.start_postal_code || '').replace(/"/g, '""')}"`,
    `"${(trip.end_location || '').replace(/"/g, '""')}"`,
    `"${(trip.end_street || '').replace(/"/g, '""')}"`,
    `"${(trip.end_city || '').replace(/"/g, '""')}"`,
    `"${(trip.end_province || '').replace(/"/g, '""')}"`,
    `"${(trip.end_postal_code || '').replace(/"/g, '""')}"`,
    trip.kilometres,
    trip.category,
    `"${(trip.notes || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function generateExpensesCSV(expenses: any[]): string {
  const headers = [
    'Date',
    'Vendor Name',
    'Amount',
    'Category (CRA T2125)',
    'Notes',
  ];

  const categoryLabels: Record<string, string> = {
    fuel: 'Fuel',
    repairs: 'Repairs & Maintenance',
    insurance: 'Insurance',
    licence: 'Licence & Registration',
    interest: 'Interest/Leasing',
    other: 'Other',
  };

  const rows = expenses.map((expense) => [
    expense.date,
    `"${(expense.vendor_name || '').replace(/"/g, '""')}"`,
    expense.amount,
    categoryLabels[expense.category] || expense.category,
    `"${(expense.notes || '').replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function generateOdometerCSV(readings: any[]): string {
  const headers = ['Year', 'Start Reading (km)', 'End Reading (km)', 'Total Km'];

  const rows = readings.map((reading) => [
    reading.year,
    reading.start_reading,
    reading.end_reading || '',
    reading.end_reading ? reading.end_reading - reading.start_reading : '',
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function openEmailWithBackup(
  jsonContent: string,
  userEmail: string
): void {
  const today = format(new Date(), 'yyyy-MM-dd');
  const subject = encodeURIComponent(`CRA Tax Tracker Backup - ${today}`);
  
  // For mailto, we'll include a summary since full data may exceed URL limits
  const body = encodeURIComponent(
    `CRA Tax Tracker Daily Backup\n` +
    `Date: ${today}\n` +
    `Email: ${userEmail}\n\n` +
    `⚠️ IMPORTANT: The full backup data file has been downloaded to your device.\n` +
    `Please attach the downloaded JSON file to this email before sending.\n\n` +
    `File name: cra-backup-${today}.json\n\n` +
    `This backup contains all your trips, expenses, and odometer readings.\n` +
    `Keep this email as a record for CRA compliance.`
  );

  window.location.href = `mailto:${userEmail}?subject=${subject}&body=${body}`;
}

export function parseBackupFile(content: string): BackupData | null {
  try {
    const data = JSON.parse(content);
    if (!data.version || !data.trips || !data.expenses || !data.odometerReadings) {
      return null;
    }
    return data as BackupData;
  } catch {
    return null;
  }
}

export function findDuplicates(
  backupData: BackupData,
  existingTrips: any[],
  existingExpenses: any[],
  existingOdometer: any[]
): DuplicateItem[] {
  const duplicates: DuplicateItem[] = [];

  // Find trip duplicates by date, time, and location
  backupData.trips.forEach((importedTrip) => {
    const existing = existingTrips.find(
      (t) =>
        t.date === importedTrip.date &&
        t.start_time === importedTrip.start_time &&
        t.end_time === importedTrip.end_time &&
        t.start_location === importedTrip.start_location &&
        t.end_location === importedTrip.end_location
    );
    if (existing) {
      duplicates.push({
        type: 'trip',
        existing,
        imported: importedTrip,
        id: importedTrip.id,
      });
    }
  });

  // Find expense duplicates by date, vendor, and amount
  backupData.expenses.forEach((importedExpense) => {
    const existing = existingExpenses.find(
      (e) =>
        e.date === importedExpense.date &&
        e.vendor_name === importedExpense.vendor_name &&
        Number(e.amount) === Number(importedExpense.amount)
    );
    if (existing) {
      duplicates.push({
        type: 'expense',
        existing,
        imported: importedExpense,
        id: importedExpense.id,
      });
    }
  });

  // Find odometer duplicates by year
  backupData.odometerReadings.forEach((importedReading) => {
    const existing = existingOdometer.find((o) => o.year === importedReading.year);
    if (existing) {
      duplicates.push({
        type: 'odometer',
        existing,
        imported: importedReading,
        id: importedReading.id,
      });
    }
  });

  return duplicates;
}

export function getNewItems(
  backupData: BackupData,
  duplicates: DuplicateItem[]
): { trips: any[]; expenses: any[]; odometerReadings: any[] } {
  const duplicateIds = new Set(duplicates.map((d) => d.id));

  return {
    trips: backupData.trips.filter((t) => !duplicateIds.has(t.id)),
    expenses: backupData.expenses.filter((e) => !duplicateIds.has(e.id)),
    odometerReadings: backupData.odometerReadings.filter((o) => !duplicateIds.has(o.id)),
  };
}
