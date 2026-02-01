import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/types';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Expense categories matching CRA T2125 and user's Excel format
const EXCEL_CATEGORIES = [
  // Supplies
  { id: 'grocery', label: 'GROCERY', color: 'FFC000' },
  { id: 'clothing_shoes', label: 'CLOTHING/SHOES', color: 'FFC000' },
  { id: 'grooming', label: 'GROOMING', color: 'FFC000' },
  { id: 'baby_stuff', label: 'BABY STUFF/DIAPERS', color: 'FFC000' },
  // Clothing
  { id: 'taxi_busride', label: 'TAXI/BUSRIDE/VELU/HOTEL', color: 'FFFF00' },
  // Transport
  { id: 'professional_fees', label: 'PROFESSIONAL FEES', color: '92D050' },
  { id: 'medicals', label: 'MEDICALS', color: '92D050' },
  { id: 'gas', label: 'GAS', color: '92D050' },
  { id: 'work_from_home', label: 'WORK FROM HOME', color: '92D050' },
  // Interest
  { id: 'cookware', label: 'COOKWARE', color: '00B0F0' },
  // Entertainment/Meals
  { id: 'restaurants', label: 'RESTAURANTS/MEETINGS/GATHERINGS', color: '00B0F0' },
  // Advertising
  { id: 'advertising', label: 'SPONSOR/GIFTS/SOCIALS/FUNDRAISING/CALLING CARD', color: 'FF00FF' },
  // Car Wash
  { id: 'car_wash', label: 'CAR WASH', color: 'FFFF00' },
  // Delivery/Freight
  { id: 'shipping_cost', label: 'SHIPPING COST', color: 'FFC000' },
  // Repairs/Maintenance
  { id: 'repairs', label: 'REPAIRS & MAINTENANCE', color: '00FF00' },
  { id: 'renovation', label: 'RENOVATION/KITCHEN/DININ', color: '00FF00' },
  // Use of Home
  { id: 'hello_hydro', label: 'Hello HYDRO', color: '00FFFF' },
  { id: 'phone_internet', label: 'Phone/Internet', color: '00FFFF' },
  { id: 'rent', label: 'Rent', color: '00FFFF' },
  { id: 'home_maintainance', label: 'Home Maintainance', color: '00FFFF' },
  { id: 'kitchen_dining', label: 'KITCHEN AND DINING ROOM', color: '00FFFF' },
  // License
  { id: 'licence', label: 'DIRECT SELLING LICENSE', color: 'FF00FF' },
  { id: 'drivers_license', label: 'DRIVERS INSURAN', color: 'FF00FF' },
  // Vehicle
  { id: 'car', label: 'CAR', color: 'FFC000' },
  { id: 'car_maintenance', label: 'CAR MAINTENAN', color: 'FFC000' },
  { id: 'home_downpayment', label: 'HOME DOWNPAYMENT', color: 'FFC000' },
  // Membership
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

interface MonthlyExpenseData {
  month: string;
  [category: string]: number | string;
}

export function generateExpenseSpreadsheet(
  expenses: any[],
  year: number
): void {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Group expenses by month and category
  const monthlyData: MonthlyExpenseData[] = MONTHS.map((month, index) => {
    const monthExpenses = expenses.filter(e => {
      const expDate = parseISO(e.date);
      return expDate.getMonth() === index;
    });

    const row: MonthlyExpenseData = { month };
    
    // Initialize all categories with empty values
    EXCEL_CATEGORIES.forEach(cat => {
      row[cat.label] = '';
    });

    // Sum expenses by mapped category
    monthExpenses.forEach(expense => {
      const mappedLabel = CATEGORY_COLUMN_MAP[expense.category as ExpenseCategory] || 'GROCERY';
      const current = row[mappedLabel];
      row[mappedLabel] = (typeof current === 'number' ? current : 0) + Number(expense.amount);
    });

    // Format numbers, keeping empty cells empty
    EXCEL_CATEGORIES.forEach(cat => {
      const val = row[cat.label];
      if (typeof val === 'number' && val > 0) {
        row[cat.label] = Number(val.toFixed(2));
      } else {
        row[cat.label] = '';
      }
    });

    return row;
  });

  // Add totals row
  const totalsRow: MonthlyExpenseData = { month: 'Total' };
  EXCEL_CATEGORIES.forEach(cat => {
    const sum = monthlyData.reduce((acc, row) => {
      const val = row[cat.label];
      return acc + (typeof val === 'number' ? val : 0);
    }, 0);
    totalsRow[cat.label] = sum > 0 ? Number(sum.toFixed(2)) : '';
  });
  monthlyData.push(totalsRow);

  // Create headers matching the Excel format
  const headers = ['DATE', ...EXCEL_CATEGORIES.map(c => c.label)];
  
  // Create worksheet data
  const wsData = [
    headers,
    ...monthlyData.map(row => [
      row.month,
      ...EXCEL_CATEGORIES.map(c => row[c.label])
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // DATE column
    ...EXCEL_CATEGORIES.map(() => ({ wch: 14 }))
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, `Expenses ${year}`);

  // Create Trips sheet
  const tripsWs = createTripsSheet(expenses, year);
  XLSX.utils.book_append_sheet(wb, tripsWs, `Trips ${year}`);

  // Download
  XLSX.writeFile(wb, `KM_Cash_Keeper_${year}.xlsx`);
}

function createTripsSheet(trips: any[], year: number): XLSX.WorkSheet {
  const headers = [
    'Date', 'Start Time', 'End Time', 'Start Location', 'End Location',
    'Kilometres', 'Category', 'Company', 'Notes'
  ];

  const data = [
    headers,
    ...trips.map(t => [
      t.date,
      t.start_time,
      t.end_time,
      t.start_location,
      t.end_location,
      t.kilometres,
      t.category?.toUpperCase(),
      t.company || '',
      t.notes || ''
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 10 }, // Start Time
    { wch: 10 }, // End Time
    { wch: 30 }, // Start Location
    { wch: 30 }, // End Location
    { wch: 12 }, // Kilometres
    { wch: 12 }, // Category
    { wch: 15 }, // Company
    { wch: 25 }, // Notes
  ];

  return ws;
}

export function generateFullExcelReport(
  trips: any[],
  expenses: any[],
  odometerReadings: any[],
  year: number
): void {
  const wb = XLSX.utils.book_new();

  // Summary sheet
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

  const summaryData = [
    ['CRA T2125 Summary Report', '', year],
    [],
    ['MILEAGE SUMMARY'],
    ['Business Kilometres', businessKm.toFixed(1)],
    ['Personal Kilometres', personalKm.toFixed(1)],
    ['Total Logged', (businessKm + personalKm).toFixed(1)],
    [],
    ['ODOMETER READINGS'],
    ['Start of Year', odometerReading?.start_reading || 'Not recorded'],
    ['End of Year', odometerReading?.end_reading || 'Not recorded'],
    ['Total Annual KM', odometerReading?.end_reading ? 
      (odometerReading.end_reading - odometerReading.start_reading).toFixed(0) : 'N/A'],
    [],
    ['BUSINESS USE PERCENTAGE', 
      odometerReading?.end_reading ? 
        ((businessKm / (odometerReading.end_reading - odometerReading.start_reading)) * 100).toFixed(1) + '%' :
        (businessKm / (businessKm + personalKm) * 100).toFixed(1) + '%'
    ],
    [],
    ['EXPENSE SUMMARY'],
    ['Total Vehicle Expenses', '$' + totalExpenses.toFixed(2)],
  ];

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Monthly Expenses sheet (matching user's format)
  const monthlyData: any[][] = [
    ['DATE', ...EXCEL_CATEGORIES.map(c => c.label), 'DATE']
  ];

  MONTHS.forEach((month, index) => {
    const monthExpenses = yearExpenses.filter(e => {
      const expDate = parseISO(e.date);
      return expDate.getMonth() === index;
    });

    const row: (string | number)[] = [month];
    
    EXCEL_CATEGORIES.forEach(cat => {
      const categoryExpenses = monthExpenses.filter(e => {
        const mappedLabel = CATEGORY_COLUMN_MAP[e.category as ExpenseCategory] || 'GROCERY';
        return mappedLabel === cat.label;
      });
      const sum = categoryExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
      row.push(sum > 0 ? Number(sum.toFixed(2)) : '');
    });

    row.push(month);
    monthlyData.push(row);
  });

  // Totals row
  const totalsRow: (string | number)[] = ['Total'];
  EXCEL_CATEGORIES.forEach((cat, i) => {
    let sum = 0;
    for (let m = 1; m <= 12; m++) {
      const val = monthlyData[m]?.[i + 1];
      if (typeof val === 'number') sum += val;
    }
    totalsRow.push(sum > 0 ? Number(sum.toFixed(2)) : '');
  });
  totalsRow.push('');
  monthlyData.push(totalsRow);

  const expensesWs = XLSX.utils.aoa_to_sheet(monthlyData);
  expensesWs['!cols'] = [
    { wch: 12 },
    ...EXCEL_CATEGORIES.map(() => ({ wch: 12 })),
    { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, expensesWs, 'Monthly Expenses');

  // Trips sheet
  const tripsData = [
    ['Date', 'Start Time', 'End Time', 'From', 'To', 'KM', 'Category', 'Company', 'Notes'],
    ...yearTrips.map(t => [
      t.date,
      t.start_time,
      t.end_time,
      t.start_location,
      t.end_location,
      t.kilometres,
      t.category?.toUpperCase(),
      t.company || '',
      t.notes || ''
    ])
  ];
  const tripsWs = XLSX.utils.aoa_to_sheet(tripsData);
  tripsWs['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 30 },
    { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 25 }
  ];
  XLSX.utils.book_append_sheet(wb, tripsWs, 'Trips');

  // Detailed Expenses sheet
  const detailedData = [
    ['Date', 'Vendor', 'Category', 'Amount', 'Notes'],
    ...yearExpenses.map(e => [
      e.date,
      e.vendor_name,
      EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      Number(e.amount).toFixed(2),
      e.notes || ''
    ])
  ];
  const detailedWs = XLSX.utils.aoa_to_sheet(detailedData);
  detailedWs['!cols'] = [
    { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, detailedWs, 'Expense Details');

  XLSX.writeFile(wb, `KM_Cash_Keeper_${year}_Full_Report.xlsx`);
}
