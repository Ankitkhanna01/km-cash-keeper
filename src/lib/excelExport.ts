import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { parseISO } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Expense categories matching CRA T2125 and user's Excel format
const EXCEL_CATEGORIES = [
  { id: 'grocery', label: 'GROCERY', color: 'FFC000' },
  { id: 'clothing_shoes', label: 'CLOTHING/SHOES', color: 'FFC000' },
  { id: 'grooming', label: 'GROOMING', color: 'FFC000' },
  { id: 'baby_stuff', label: 'BABY STUFF/DIAPERS', color: 'FFC000' },
  { id: 'taxi_busride', label: 'TAXI/BUSRIDE/VELU/HOTEL', color: 'FFFF00' },
  { id: 'professional_fees', label: 'PROFESSIONAL FEES', color: '92D050' },
  { id: 'medicals', label: 'MEDICALS', color: '92D050' },
  { id: 'gas', label: 'GAS', color: '92D050' },
  { id: 'work_from_home', label: 'WORK FROM HOME', color: '92D050' },
  { id: 'cookware', label: 'COOKWARE', color: '00B0F0' },
  { id: 'restaurants', label: 'RESTAURANTS/MEETINGS/GATHERINGS', color: '00B0F0' },
  { id: 'advertising', label: 'SPONSOR/GIFTS/SOCIALS/FUNDRAISING/CALLING CARD', color: 'FF00FF' },
  { id: 'car_wash', label: 'CAR WASH', color: 'FFFF00' },
  { id: 'shipping_cost', label: 'SHIPPING COST', color: 'FFC000' },
  { id: 'repairs', label: 'REPAIRS & MAINTENANCE', color: '00FF00' },
  { id: 'renovation', label: 'RENOVATION/KITCHEN/DININ', color: '00FF00' },
  { id: 'hello_hydro', label: 'Hello HYDRO', color: '00FFFF' },
  { id: 'phone_internet', label: 'Phone/Internet', color: '00FFFF' },
  { id: 'rent', label: 'Rent', color: '00FFFF' },
  { id: 'home_maintainance', label: 'Home Maintainance', color: '00FFFF' },
  { id: 'kitchen_dining', label: 'KITCHEN AND DINING ROOM', color: '00FFFF' },
  { id: 'licence', label: 'DIRECT SELLING LICENSE', color: 'FF00FF' },
  { id: 'drivers_license', label: 'DRIVERS INSURAN', color: 'FF00FF' },
  { id: 'car', label: 'CAR', color: 'FFC000' },
  { id: 'car_maintenance', label: 'CAR MAINTENAN', color: 'FFC000' },
  { id: 'home_downpayment', label: 'HOME DOWNPAYMENT', color: 'FFC000' },
  { id: 'costco_wireless', label: 'COSTCO/WIRELESS', color: 'FF00FF' },
];

// Map app expense categories to Excel columns
const CATEGORY_COLUMN_MAP: Record<ExpenseCategory, string> = {
  fuel: 'GAS',
  repairs: 'REPAIRS & MAINTENANCE',
  insurance: 'DRIVERS INSURAN',
  licence: 'DIRECT SELLING LICENSE',
  interest: 'COOKWARE',
  other: 'GROCERY',
};

interface CellValue {
  formula?: string;
  value?: number | string;
}

interface MonthlyExpenseData {
  month: string;
  [category: string]: number | string | CellValue;
}

async function saveWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename);
}

export async function generateExpenseSpreadsheet(
  expenses: any[],
  year: number
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Expenses ${year}`);

  // Track individual amounts for formula breakdown
  interface MonthlyAmounts {
    month: string;
    [category: string]: string | number[] | string;
  }

  // Group expenses by month and category - collect individual amounts
  const monthlyAmounts: MonthlyAmounts[] = MONTHS.map((month, index) => {
    const monthExpenses = expenses.filter(e => {
      const expDate = parseISO(e.date);
      return expDate.getMonth() === index;
    });

    const row: MonthlyAmounts = { month };
    
    EXCEL_CATEGORIES.forEach(cat => {
      row[cat.label] = [] as number[];
    });

    monthExpenses.forEach(expense => {
      const mappedLabel = CATEGORY_COLUMN_MAP[expense.category as ExpenseCategory] || 'GROCERY';
      const amounts = row[mappedLabel] as number[];
      amounts.push(Number(expense.amount));
    });

    return row;
  });

  // Convert to data with formulas
  const monthlyData: MonthlyExpenseData[] = monthlyAmounts.map(row => {
    const dataRow: MonthlyExpenseData = { month: row.month as string };
    
    EXCEL_CATEGORIES.forEach(cat => {
      const amounts = row[cat.label] as number[];
      if (amounts.length > 0) {
        // Create formula string like "=12.50+34.25+..."
        const formulaParts = amounts.map(a => a.toFixed(2));
        dataRow[cat.label] = { formula: formulaParts.join('+') };
      } else {
        dataRow[cat.label] = '';
      }
    });

    return dataRow;
  });

  // Add totals row with column formulas
  const totalsRow: MonthlyExpenseData = { month: 'Total' };
  EXCEL_CATEGORIES.forEach(cat => {
    // Collect all amounts from monthlyAmounts for this category
    const allAmounts: number[] = [];
    monthlyAmounts.forEach(row => {
      const amounts = row[cat.label] as number[];
      allAmounts.push(...amounts);
    });
    if (allAmounts.length > 0) {
      const formulaParts = allAmounts.map(a => a.toFixed(2));
      totalsRow[cat.label] = { formula: formulaParts.join('+') };
    } else {
      totalsRow[cat.label] = '';
    }
  });
  monthlyData.push(totalsRow);

  // Add headers
  const headers = ['DATE', ...EXCEL_CATEGORIES.map(c => c.label)];
  worksheet.addRow(headers);

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  // Add data rows with formulas
  monthlyData.forEach(row => {
    const rowValues = [row.month];
    const wsRow = worksheet.addRow(rowValues);
    
    EXCEL_CATEGORIES.forEach((cat, i) => {
      const cellValue = row[cat.label];
      const cell = wsRow.getCell(i + 2);
      
      if (cellValue && typeof cellValue === 'object' && 'formula' in cellValue) {
        cell.value = { formula: cellValue.formula };
      } else if (typeof cellValue === 'number') {
        cell.value = cellValue;
      } else {
        cell.value = '';
      }
    });
  });

  // Set column widths
  worksheet.getColumn(1).width = 12;
  EXCEL_CATEGORIES.forEach((_, i) => {
    worksheet.getColumn(i + 2).width = 14;
  });

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}.xlsx`);
}

export async function generateFullExcelReport(
  trips: any[],
  expenses: any[],
  odometerReadings: any[],
  year: number
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // Filter data for the year
  const yearTrips = trips.filter(t => t.date?.startsWith(year.toString()));
  const yearExpenses = expenses.filter(e => e.date?.startsWith(year.toString()));
  const odometerReading = odometerReadings.find(o => o.year === year);
  
  const businessKm = yearTrips
    .filter(t => t.category === 'business')
    .reduce((sum, t) => sum + Number(t.kilometres || 0), 0);
  const personalKm = yearTrips
    .filter(t => t.category === 'personal')
    .reduce((sum, t) => sum + Number(t.kilometres || 0), 0);
  const totalExpenses = yearExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['CRA T2125 Summary Report', '', year]);
  summarySheet.addRow([]);
  summarySheet.addRow(['MILEAGE SUMMARY']);
  summarySheet.addRow(['Business Kilometres', businessKm.toFixed(1)]);
  summarySheet.addRow(['Personal Kilometres', personalKm.toFixed(1)]);
  summarySheet.addRow(['Total Logged', (businessKm + personalKm).toFixed(1)]);
  summarySheet.addRow([]);
  summarySheet.addRow(['ODOMETER READINGS']);
  summarySheet.addRow(['Start of Year', odometerReading?.start_reading || 'Not recorded']);
  summarySheet.addRow(['End of Year', odometerReading?.end_reading || 'Not recorded']);
  summarySheet.addRow(['Total Annual KM', odometerReading?.end_reading ? 
    (odometerReading.end_reading - odometerReading.start_reading).toFixed(0) : 'N/A']);
  summarySheet.addRow([]);
  summarySheet.addRow(['BUSINESS USE PERCENTAGE', 
    odometerReading?.end_reading ? 
      ((businessKm / (odometerReading.end_reading - odometerReading.start_reading)) * 100).toFixed(1) + '%' :
      (businessKm / (businessKm + personalKm) * 100).toFixed(1) + '%'
  ]);
  summarySheet.addRow([]);
  summarySheet.addRow(['EXPENSE SUMMARY']);
  summarySheet.addRow(['Total Vehicle Expenses', '$' + totalExpenses.toFixed(2)]);
  
  summarySheet.getColumn(1).width = 25;
  summarySheet.getColumn(2).width = 20;
  summarySheet.getColumn(3).width = 10;

  // Monthly Expenses sheet
  const expensesSheet = workbook.addWorksheet('Monthly Expenses');
  expensesSheet.addRow(['DATE', ...EXCEL_CATEGORIES.map(c => c.label), 'DATE']);

  // Collect amounts per month per category for formula breakups
  const monthlyAmounts: Record<number, Record<string, number[]>> = {};
  for (let m = 0; m < 12; m++) {
    monthlyAmounts[m] = {};
    EXCEL_CATEGORIES.forEach(cat => { monthlyAmounts[m][cat.label] = []; });
  }

  yearExpenses.forEach(e => {
    const month = parseISO(e.date).getMonth();
    const mappedLabel = CATEGORY_COLUMN_MAP[e.category as ExpenseCategory] || 'GROCERY';
    if (monthlyAmounts[month][mappedLabel]) {
      monthlyAmounts[month][mappedLabel].push(Number(e.amount || 0));
    }
  });

  MONTHS.forEach((month, index) => {
    const rowValues: any[] = [month];
    EXCEL_CATEGORIES.forEach(() => rowValues.push(null));
    rowValues.push(month);
    const dataRow = expensesSheet.addRow(rowValues);

    EXCEL_CATEGORIES.forEach((cat, i) => {
      const amounts = monthlyAmounts[index][cat.label];
      const cell = dataRow.getCell(i + 2);
      if (amounts && amounts.length > 0) {
        cell.value = { formula: amounts.map(a => a.toFixed(2)).join('+') } as any;
        cell.numFmt = '#,##0.00';
      }
    });
  });

  // Totals row with SUM formulas
  const totalsRowValues: any[] = ['Total'];
  EXCEL_CATEGORIES.forEach(() => totalsRowValues.push(null));
  totalsRowValues.push('');
  const totalsRow = expensesSheet.addRow(totalsRowValues);
  totalsRow.font = { bold: true };
  
  EXCEL_CATEGORIES.forEach((_, i) => {
    const colIdx = i + 2;
    const colChar = String.fromCharCode(64 + colIdx);
    const cell = totalsRow.getCell(colIdx);
    cell.value = { formula: `SUM(${colChar}2:${colChar}13)` } as any;
    cell.numFmt = '#,##0.00';
  });

  expensesSheet.getColumn(1).width = 12;
  EXCEL_CATEGORIES.forEach((_, i) => {
    expensesSheet.getColumn(i + 2).width = 12;
  });

  // Trips sheet
  const tripsSheet = workbook.addWorksheet('Trips');
  tripsSheet.addRow(['Date', 'Start Time', 'End Time', 'From', 'To', 'KM', 'Category', 'Company', 'Notes']);
  
  const headerRow = tripsSheet.getRow(1);
  headerRow.font = { bold: true };

  yearTrips.forEach(t => {
    tripsSheet.addRow([
      t.date,
      t.start_time,
      t.end_time,
      t.start_location,
      t.end_location,
      t.kilometres,
      t.category?.toUpperCase(),
      t.company || '',
      t.notes || ''
    ]);
  });

  tripsSheet.getColumn(1).width = 12;
  tripsSheet.getColumn(2).width = 10;
  tripsSheet.getColumn(3).width = 10;
  tripsSheet.getColumn(4).width = 30;
  tripsSheet.getColumn(5).width = 30;
  tripsSheet.getColumn(6).width = 8;
  tripsSheet.getColumn(7).width = 12;
  tripsSheet.getColumn(8).width = 15;
  tripsSheet.getColumn(9).width = 25;

  // Detailed Expenses sheet
  const detailedSheet = workbook.addWorksheet('Expense Details');
  detailedSheet.addRow(['Date', 'Vendor', 'Category', 'Amount', 'Notes']);
  
  const detailedHeaderRow = detailedSheet.getRow(1);
  detailedHeaderRow.font = { bold: true };

  yearExpenses.forEach(e => {
    detailedSheet.addRow([
      e.date,
      e.vendor_name,
      EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      Number(e.amount).toFixed(2),
      e.notes || ''
    ]);
  });

  detailedSheet.getColumn(1).width = 12;
  detailedSheet.getColumn(2).width = 25;
  detailedSheet.getColumn(3).width = 20;
  detailedSheet.getColumn(4).width = 12;
  detailedSheet.getColumn(5).width = 30;

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}_Full_Report.xlsx`);
}
