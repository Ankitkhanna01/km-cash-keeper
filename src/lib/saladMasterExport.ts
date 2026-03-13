import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { parseISO, format } from 'date-fns';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

// Helper to convert 0-based column index to Excel column letter (0=A, 25=Z, 26=AA, etc.)
function colLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// Salad Master spreadsheet columns matching the user's template
const SM_COLUMNS = [
  { key: 'grocery', label: 'GROCERY', width: 12 },
  { key: 'clothing', label: 'CLOTHS/SHOES/BAG', width: 16 },
  { key: 'grooming', label: 'GROOMING', width: 12 },
  { key: 'mani_pedicure', label: 'MANI/PEDICURE', width: 14 },
  { key: 'transportation', label: 'TAXI/BUS/TRAVEL/HOTEL', width: 22 },
  { key: 'professional_fees', label: 'PROFESSIONAL FEES', width: 18 },
  { key: 'medicals', label: 'MEDICALS', width: 12 },
  { key: 'gas', label: 'GAS', width: 10 },
  { key: 'work_from_home', label: 'WORK FROM HOME', width: 16 },
  { key: 'cookware', label: 'COOKWARE', width: 12 },
  { key: 'entertainment', label: 'RESTAURANTS/MEETINGS/MOVIES/GATHERINGS(50%)', width: 40 },
  { key: 'advertising', label: 'SPONSOR/GIFTS/SOCIAL/DONATIONS/FUNDRAISING/CALLING CARD', width: 44 },
  { key: 'car_wash', label: 'CAR WASH', width: 12 },
  { key: 'delivery_freight', label: 'DELIVERY/FREIGHT', width: 16 },
  { key: 'repairs', label: 'REPAIRS/MAINTENANCE', width: 20 },
  { key: 'hydro', label: 'HYDRO', width: 10 },
  { key: 'phone_internet', label: 'Phone/Internet', width: 14 },
  { key: 'rent', label: 'Rent', width: 10 },
  { key: 'home_insurance', label: 'Home Insurance', width: 14 },
  { key: 'kitchen_dining', label: 'KITCHEN AND DINNING ROOM', width: 24 },
  { key: 'licence', label: 'DIRECT SELLING LICENSE', width: 22 },
  { key: 'drivers_insurance', label: 'DRIVERS INSURANCE', width: 18 },
  { key: 'car_gas', label: 'GAS (CAR)', width: 12 },
  { key: 'car', label: 'CAR', width: 10 },
  { key: 'car_maintenance', label: 'CAR MAINTENANCE', width: 16 },
  { key: 'home_power', label: 'HOME POWER', width: 12 },
  { key: 'membership', label: 'COSTCO/WHOLESALE/SS', width: 20 },
  { key: 'gym', label: 'GYM/FITNESS', width: 14 },
  { key: 'alcohol', label: 'ALCOHOL', width: 12 },
  { key: 'airport_shopping', label: 'AIRPORT SHOPPING', width: 18 },
  { key: 'vitamins', label: 'VITAMINS/SUPPLEMENTS', width: 20 },
  { key: 'government_fees', label: 'GOVERNMENT FEES', width: 16 },
  { key: 'parking', label: 'PARKING', width: 12 },
];

// Classify an expense into the correct SM column
export function classifyExpense(expense: any): string {
  const vendor = (expense.vendor_name || '').toLowerCase();
  const notes = (expense.notes || '').toLowerCase();
  const category = expense.category || 'other';

  // Fuel/Gas (vehicle) — gas stations only
  if (category === 'fuel' || vendor.includes('esso') || vendor.includes('petro') || 
      vendor.includes('chevron') || vendor.includes('shell') || vendor.includes('mobil') ||
      vendor.includes('hi quadra') || vendor.includes('hi-quadra') ||
      vendor.includes('smart stop') ||
      (vendor.includes('7-eleven') && (notes.includes('gas') || category === 'fuel'))) {
    // MODO is car share, not fuel — even if category says fuel
    if (vendor.includes('modo')) return 'transportation';
    return 'gas';
  }

  // Insurance (vehicle)
  if (category === 'insurance' || vendor.includes('icbc') || vendor.includes('amc insurance')) {
    return 'drivers_insurance';
  }

  // Licence / Registration
  if (category === 'licence' || vendor.includes('driver services')) {
    return 'licence';
  }

  // Repairs & Maintenance (vehicle-specific)
  if (category === 'repairs' || vendor.includes('mr. lube') || vendor.includes('mr lube') ||
      vendor.includes('tennyson auto') || vendor.includes('gs auto')) {
    return 'repairs';
  }

  // Car purchase
  if (notes.includes('car purchase') || (vendor.includes('coast capital') && notes.includes('car'))) {
    return 'car';
  }

  // Parking → dedicated parking column
  if (vendor.includes('parking') || vendor.includes('parkvictoria') || vendor.includes('pacrim park') ||
      vendor.includes('robbins') || vendor.includes('honk') || vendor.includes('place face up') ||
      vendor.includes('r parking')) {
    return 'parking';
  }

  // Hotel booking
  if (vendor.includes('priceline') || vendor.includes('accent inn') || vendor.includes('tofino')) {
    return 'transportation';
  }

  // Car share / transportation / transit / taxi / ferries
  if (vendor.includes('evo car') || vendor.includes('modo') || vendor.includes('bcferries') || 
      vendor.includes('bc ferries') || vendor.includes('bcf -') ||
      vendor.includes('yellow cab') || vendor.includes('bluebird cabs') ||
      vendor.includes('bc transit') || vendor.includes('compass') || 
      vendor.includes('city') && vendor.includes('taxi') ||
      vendor.includes('uber') || vendor.includes('paypal uber') || vendor.includes('paypal *uber') ||
      vendor.includes('allresto')) {
    return 'transportation';
  }

  // Car wash
  if (notes.includes('car wash') || notes.includes('full wash')) {
    return 'car_wash';
  }

  // Hydro / Power
  if (vendor.includes('hydro') || vendor.includes('b.c. hydro')) {
    return 'hydro';
  }

  // Dental → medicals
  if (vendor.includes('dental') || vendor.includes('times dental')) {
    return 'medicals';
  }

  // Gym / Fitness
  if (vendor.includes('fit4less') || vendor.includes('goodlife')) {
    return 'gym';
  }

  // Pharmacy / medical / health (London Drugs → grocery, not medical)
  if (vendor.includes('pharmasave') ||
      vendor.includes('medicare') || vendor.includes('shoppers drug') ||
      vendor.includes('viha') || vendor.includes('env hlth')) {
    return 'medicals';
  }

  // London Drugs → grocery
  if (vendor.includes('london drugs')) {
    return 'grocery';
  }

  // Haircut / grooming / personal care
  if (vendor.includes('sonu hair') || vendor.includes('haircut') || vendor.includes('barber') ||
      vendor.includes('crate 61')) {
    return 'grooming';
  }

  // Airport Shopping
  if (vendor.includes('world duty free')) {
    return 'airport_shopping';
  }

  // Airport checking / background checks
  if (vendor.includes('sterlingbackcheck')) {
    return 'airport_shopping';
  }

  // Clothing / shoes
  if (vendor.includes('winners') || vendor.includes('homesense') || vendor.includes('winnershomesense') ||
      vendor.includes('old navy') || vendor.includes('foot locker') ||
      vendor.includes('marshalls') || vendor.includes('h&m') ||
      vendor.includes('uniqlo') ||
      (vendor.includes('walmart') && notes.includes('cloth'))) {
    return 'clothing';
  }

  // Restaurants / meals / entertainment / food delivery / cafes / lounges / bowling
  if (vendor.includes('subway') || vendor.includes('noodlebox') || vendor.includes('dosa paragon') ||
      vendor.includes('baan thai') || vendor.includes('pho u') || vendor.includes('sizzling tandoor') ||
      vendor.includes('himalayan') || vendor.includes('bin 4') || vendor.includes('browns social') ||
      vendor.includes('marhaba') || vendor.includes('starbucks') || vendor.includes('tim horton') ||
      vendor.includes('royal spice') || vendor.includes('kukus') || vendor.includes('kuku') ||
      vendor.includes('end dive') || vendor.includes('mexican village') || vendor.includes('city centre park') ||
      vendor.includes('ramen') || vendor.includes('old country') || vendor.includes('a&w') || 
      vendor.includes('shelbourne') || vendor.includes('kutatas') ||
      vendor.includes('beacon hill') || vendor.includes('for good measure') ||
      vendor.includes('dragon wok') || vendor.includes('freshslice') || vendor.includes('pizza') ||
      vendor.includes('ricardos') || vendor.includes('torquay') || vendor.includes('rock salt') ||
      vendor.includes('rhino coffee') || vendor.includes('doordash') || vendor.includes('food panda') ||
      vendor.includes('foodpanda') ||
      vendor.includes('yeungs') || vendor.includes('halibut') || vendor.includes('felicitas') ||
      vendor.includes('mcdonalds') || vendor.includes("mcdonald's") || vendor.includes('wendy') ||
      vendor.includes('kfc') || vendor.includes('popeyes') || vendor.includes('white spot') ||
      vendor.includes('earls') || vendor.includes('cactus club') || vendor.includes('boston pizza') ||
      vendor.includes('freshii') || vendor.includes('erito sushi') || vendor.includes('ocean garden') ||
      vendor.includes('purdys') || vendor.includes('chocolatier') ||
      vendor.includes('sugar shak') || vendor.includes('showshaa') ||
      vendor.includes('langford lanes') || vendor.includes('biryanipala') || vendor.includes('junoon') ||
      (vendor === 'aw' || vendor.startsWith('aw '))) {
    return 'entertainment';
  }

  // Costco / wholesale / MM Food
  if (vendor.includes('costco') || vendor.includes('mm food') || vendor.includes('wholesale')) {
    return 'membership';
  }

  // Vitamins / supplements
  if (vendor.includes('blueprint')) {
    return 'vitamins';
  }

  // Professional fees / software / freelance
  if (vendor.includes('lovable') || vendor.includes('upwork') || vendor.includes('incite ai') ||
      vendor.includes('scarface trade') || vendor.includes('staples') ||
      vendor.includes('thinking canada')) {
    return 'professional_fees';
  }

  // FedEx / shipping
  if (vendor.includes('fedex') || vendor.includes('shipping')) {
    return 'delivery_freight';
  }

  // Phone / Internet
  if (vendor.includes('fido') || vendor.includes('shaw') || vendor.includes('fraser valley wireless') ||
      vendor.includes('paypal google') || vendor.includes('paypal *google')) {
    return 'phone_internet';
  }

  // Alcohol
  if (vendor.includes('4 mile liquor') || vendor.includes('4mile') ||
      vendor.includes('liquor co') || vendor.includes('liquor plus') ||
      vendor.includes('cascadia liquor') || vendor.includes('bc liquor') ||
      vendor.includes('wandering bear')) {
    return 'alcohol';
  }

  // Donations / gifts / advertising / flowers
  if (vendor.includes('operation smile') || vendor.includes('impact guru') ||
      vendor.includes('donation') || vendor.includes('fundrais') ||
      vendor.includes('larosaflowe') || vendor.includes('imagineart') ||
      vendor.includes('beastphilan')) {
    return 'advertising';
  }

  // Canadian Tire (personal household, not auto repairs unless category is repairs)
  if (vendor.includes('canadian tire')) {
    if (category === 'repairs') return 'repairs';
    return 'grocery'; // household supplies
  }

  // BC Gov fees → government fees
  if (vendor.includes('rsbc') || vendor.includes('bcgov')) {
    return 'government_fees';
  }

  // Online shopping (Amazon, Temu, etc.) → grocery/supplies
  if (vendor.includes('amazon') || vendor.includes('temu') || vendor.includes('kitscomtech')) {
    return 'grocery';
  }

  // Walmart → grocery
  if (vendor.includes('walmart') || vendor.includes('wal-mart')) {
    return 'grocery';
  }

  // Dollarama / dollar stores → grocery/supplies
  if (vendor.includes('dollarama') || vendor.includes('dollar')) {
    return 'grocery';
  }

  // Grocery stores
  if (vendor.includes('thrifty') || vendor.includes('western foods') || vendor.includes('save-on') ||
      vendor.includes('superstore') || vendor.includes('fairway') || vendor.includes('h-mart') ||
      vendor.includes('real canadian')) {
    return 'grocery';
  }

  // Minutekey / misc small purchases
  if (vendor.includes('minutekey')) {
    return 'grocery';
  }

  // Default: grocery/supplies
  return 'grocery';
}

// Helper to add CRA instructions sheet for accountant
function addCRAInstructionsSheet(workbook: ExcelJS.Workbook, year: number, businessType: string, odometerData?: OdometerExportData) {
  const ws = workbook.addWorksheet('CRA Instructions');
  
  const titleRow = ws.addRow([`CRA FILING INSTRUCTIONS FOR ACCOUNTANT — ${year}`]);
  titleRow.font = { bold: true, size: 16 };
  ws.addRow([`Business Type: ${businessType}`]);
  ws.getRow(2).font = { bold: true, size: 12 };
  ws.addRow([`Prepared: ${format(new Date(), 'MMMM d, yyyy')}`]);
  ws.addRow([]);
  
  // Vehicle section
  ws.addRow(['═══ VEHICLE EXPENSES (Form T2125, Part 7) ═══']);
  ws.getRow(5).font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };
  ws.addRow([]);
  
  if (odometerData) {
    ws.addRow(['ODOMETER READINGS (CRA Required)']);
    ws.getRow(ws.rowCount).font = { bold: true, size: 11 };
    ws.addRow(['', 'Start of Year (Jan 1):', `${odometerData.startReading.toLocaleString()} km`]);
    ws.addRow(['', 'End of Year (Dec 31):', `${odometerData.endReading.toLocaleString()} km`]);
    ws.addRow(['', 'Total Kilometres Driven:', `${odometerData.totalKm.toLocaleString()} km`]);
    ws.addRow([]);
    ws.addRow(['BUSINESS-USE CALCULATION']);
    ws.getRow(ws.rowCount).font = { bold: true, size: 11 };
    ws.addRow(['', 'Business Kilometres:', `${odometerData.businessKm.toLocaleString()} km`]);
    ws.addRow(['', 'Personal Kilometres:', `${(odometerData.totalKm - odometerData.businessKm).toLocaleString()} km`]);
    const pctRow = ws.addRow(['', 'Business-Use Percentage:', `${odometerData.businessPercent.toFixed(1)}%`]);
    pctRow.font = { bold: true, size: 12, color: { argb: 'FF006100' } };
    ws.addRow([]);
    ws.addRow(['CAR PURCHASE DETAILS (Capital Cost Allowance - CCA)']);
    ws.getRow(ws.rowCount).font = { bold: true, size: 11 };
    ws.addRow(['', 'Purchase Date:', 'July 15, 2025']);
    ws.addRow(['', 'Purchase Price:', '$8,000.00']);
    ws.addRow(['', 'Business-Use %:', `${odometerData.businessPercent.toFixed(1)}%`]);
    ws.addRow(['', 'Business Portion:', `$${(8000 * odometerData.businessPercent / 100).toFixed(2)}`]);
    ws.addRow(['', 'CCA Class:', 'Class 10 (30% declining balance) or Class 10.1 if luxury']);
    ws.addRow(['', 'First Year Rule:', 'Half-year rule applies — only 50% of CCA in year of acquisition']);
    ws.addRow(['', 'Note:', 'Car was purchased mid-year. CCA is calculated on business portion only.']);
    ws.addRow([]);
  }
  
  ws.addRow(['═══ WHAT ACCOUNTANT NEEDS TO FILE WITH CRA ═══']);
  ws.getRow(ws.rowCount).font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };
  ws.addRow([]);
  
  const instructions = [
    ['1. Form T2125', 'Statement of Business or Professional Activities — report all self-employment income and expenses'],
    ['2. Vehicle Expenses (Part 7)', 'Enter total vehicle expenses and multiply by business-use percentage'],
    ['   Line 9281', 'Fuel costs (gas, car share fuel component)'],
    ['   Line 9282', 'Motor vehicle insurance'],
    ['   Line 9283', 'Licence and registration'],
    ['   Line 9284', 'Maintenance and repairs'],
    ['   Line 9936', 'Capital Cost Allowance (car purchase depreciation)'],
    ['3. Business-Use %', `${odometerData?.businessPercent.toFixed(1) ?? 'N/A'}% — calculated from odometer readings`],
    ['4. Odometer Log', 'Must show start/end readings for the year — provided in this spreadsheet'],
    ['5. Mileage Log', 'Daily trip log with dates, destinations, km — available in separate trip report'],
    ['6. Receipts', 'All receipts for expenses >$75 should be kept for 6 years'],
    ['', ''],
    ['═══ IMPORTANT NOTES ═══', ''],
    ['Meals & Entertainment', 'Only 50% deductible per CRA rules (already flagged in Salad Master sheet)'],
    ['Car Share (Modo/EVO)', 'Classified as transportation expense — fully deductible at business-use %'],
    ['Home Office', 'If applicable, use Form T2125 Part 6 — calculate based on sq footage used'],
    ['GST/HST', 'If registered, file GST/HST return separately. Input Tax Credits (ITCs) may be claimed.'],
    ['Keep Records', 'CRA requires you to keep all records for 6 years from the date of filing'],
  ];
  
  instructions.forEach(([col1, col2]) => {
    const row = ws.addRow(['', col1, col2]);
    if (col1.startsWith('═══') || col1.match(/^\d\./)) {
      row.font = { bold: true };
    }
  });
  
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 35;
  ws.getColumn(3).width = 80;
  
  return ws;
}

interface OdometerExportData {
  startReading: number;
  endReading: number;
  totalKm: number;
  businessKm: number;
  businessPercent: number;
}

// Uber Pro Card expenses extracted from bank statements (Aug-Dec 2025)
// These are actual debit transactions made using the Uber card (not payouts/transfers)
const UBER_CARD_EXPENSES_2025 = [
  // August 2025
  { date: '2025-08-26', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 75.00, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  // September 2025
  { date: '2025-09-03', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 96.45, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  { date: '2025-09-13', vendor_name: 'ESSO 7-ELEVEN 37899', amount: 8.40, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas (snack/supplies)' },
  { date: '2025-09-16', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 100.02, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  { date: '2025-09-19', vendor_name: 'THRIFTY FOODS #9469', amount: 11.78, category: 'other', purpose: 'personal', card_last4: 'UBER', notes: 'Uber Card - Grocery' },
  { date: '2025-09-20', vendor_name: 'TENNYSON AUTO REPAIRS', amount: 89.60, category: 'repairs', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Auto Repair' },
  { date: '2025-09-22', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 100.02, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  { date: '2025-09-30', vendor_name: 'ESSO 7-ELEVEN 37900', amount: 100.00, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  // October 2025
  { date: '2025-10-17', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 100.00, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  { date: '2025-10-25', vendor_name: 'ESSO 7-ELEVEN 37900', amount: 95.00, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  // November 2025
  { date: '2025-11-01', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 95.00, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  { date: '2025-11-13', vendor_name: 'ESSO 7-ELEVEN 37898', amount: 95.02, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
  // December 2025
  { date: '2025-12-18', vendor_name: 'ESSO SMART STOP 37906', amount: 94.85, category: 'fuel', purpose: 'business', card_last4: 'UBER', notes: 'Uber Card - Gas' },
];

// Uber Card driving income summary by month (from statement summaries)
const UBER_CARD_DRIVING_INCOME_2025: Record<number, { credits: number; debits: number }> = {
  7: { credits: 942.55, debits: 725.00 },   // August (0-indexed month 7)
  8: { credits: 1589.05, debits: 1306.27 },  // September
  9: { credits: 1234.80, debits: 1595.00 },  // October
  10: { credits: 657.05, debits: 690.02 },   // November
  11: { credits: 461.53, debits: 94.85 },    // December
};

export async function generateSaladMasterExcel(expenses: any[], year: number, odometerData?: OdometerExportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  
  // CRA Instructions sheet FIRST
  addCRAInstructionsSheet(workbook, year, 'Salad Master / NutriSystem / Direct Sales', odometerData);
  
  const ws = workbook.addWorksheet(`Salad Master ${year}`);

  // Include ALL expenses for the year (personal + business) to match user's template
  const dbExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && !e.deleted_at;
  });

  // Merge Uber card expenses (only for 2025)
  const uberCardExpenses = year === 2025 ? UBER_CARD_EXPENSES_2025 : [];
  
  // Deduplicate: skip Uber card expenses that already exist in DB (same date, vendor, amount)
  const uniqueUberExpenses = uberCardExpenses.filter(ue => {
    return !dbExpenses.some(de => 
      de.date === ue.date && 
      de.vendor_name?.toLowerCase().includes(ue.vendor_name.toLowerCase().substring(0, 10)) &&
      Math.abs(Number(de.amount) - ue.amount) < 0.02
    );
  });

  const yearExpenses = [...dbExpenses, ...uniqueUberExpenses];

  // --- HEADER ROWS ---
  const groupRow = ws.addRow(['', 'SUPPLIES', 'CLOTHING', '', '', 'TRANSPORTATION', '', '', '', '', 'INTEREST', 'ENTERTAINMENT/MEALS', 'ADVERTISING', 'CAR WASH', 'DELIVERY/FREIGHT', 'REPAIRS/MAINTENANCE', 'USE OF HOME', '', '', '', '', 'LICENSE', '', '', '', '', '', 'MEMBERSHIP', '', 'TOTAL']);
  groupRow.font = { bold: true, size: 9 };

  const headerLabels = ['DATE', ...SM_COLUMNS.map(c => c.label), 'TOTAL'];
  const headerRow = ws.addRow(headerLabels);
  headerRow.font = { bold: true, size: 8 };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
    cell.alignment = { wrapText: true, vertical: 'bottom', horizontal: 'center' };
  });

  // --- GROUP EXPENSES BY MONTH AND COLUMN ---
  const monthlyData: Record<number, Record<string, number[]>> = {};
  for (let m = 0; m < 12; m++) {
    monthlyData[m] = {};
    SM_COLUMNS.forEach(col => { monthlyData[m][col.key] = []; });
  }

  yearExpenses.forEach(expense => {
    const month = parseISO(expense.date).getMonth();
    const colKey = classifyExpense(expense);
    if (monthlyData[month][colKey]) {
      monthlyData[month][colKey].push(Number(expense.amount));
    }
  });

  // --- DATA ROWS (one per month) ---
  MONTHS.forEach((monthName, m) => {
    const rowValues: any[] = [monthName];
    SM_COLUMNS.forEach(col => {
      const amounts = monthlyData[m][col.key];
      if (amounts.length > 0) {
        rowValues.push(null);
      } else {
        rowValues.push('');
      }
    });
    rowValues.push(null);

    const dataRow = ws.addRow(rowValues);
    const rowNum = dataRow.number;

    SM_COLUMNS.forEach((col, i) => {
      const amounts = monthlyData[m][col.key];
      const cell = dataRow.getCell(i + 2);
      if (amounts.length > 0) {
        cell.value = { formula: amounts.map(a => a.toFixed(2)).join('+') } as any;
        cell.numFmt = '#,##0.00';
      }
    });

    // TOTAL column = sum of all category columns for this row (B through last data col)
    const lastDataColLetter = colLetter(SM_COLUMNS.length); // 0-based: col index SM_COLUMNS.length = column after last data col - 1
    const totalCell = dataRow.getCell(SM_COLUMNS.length + 2);
    totalCell.value = { formula: `SUM(B${rowNum}:${colLetter(SM_COLUMNS.length)}${rowNum})` } as any;
    totalCell.numFmt = '#,##0.00';
    totalCell.font = { bold: true };
  });

  // --- TOTALS ROW ---
  const totalsRowValues: any[] = ['Total'];
  SM_COLUMNS.forEach(() => totalsRowValues.push(null));
  totalsRowValues.push(null);
  
  const totalsRow = ws.addRow(totalsRowValues);
  totalsRow.font = { bold: true };
  const firstDataRow = 3;
  const lastDataRow = 14;

  SM_COLUMNS.forEach((_, i) => {
    const cLetter = colLetter(i + 1); // Column B = index 1
    const cell = totalsRow.getCell(i + 2);
    cell.value = { formula: `SUM(${cLetter}${firstDataRow}:${cLetter}${lastDataRow})` } as any;
    cell.numFmt = '#,##0.00';
  });

  const grandTotalCell = totalsRow.getCell(SM_COLUMNS.length + 2);
  grandTotalCell.value = { formula: `SUM(B${totalsRow.number}:${colLetter(SM_COLUMNS.length)}${totalsRow.number})` } as any;
  grandTotalCell.numFmt = '#,##0.00';
  grandTotalCell.font = { bold: true };

  // --- EXTRA NOTES ROWS (matching user's template) ---
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  if (odometerData) {
    ws.addRow(['Car Purchase', '$8,000.00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Business Use: ${odometerData.businessPercent.toFixed(1)}%`]);
    ws.addRow(['Odometer Start', `${odometerData.startReading.toLocaleString()} km`]);
    ws.addRow(['Odometer End', `${odometerData.endReading.toLocaleString()} km`]);
    ws.addRow(['Total KM', `${odometerData.totalKm.toLocaleString()} km`]);
    ws.addRow(['Business KM', `${odometerData.businessKm.toLocaleString()} km`]);
    ws.addRow(['Business %', `${odometerData.businessPercent.toFixed(1)}%`]);
  }

  // --- DETAIL SHEET ---
  const detailWs = workbook.addWorksheet('Transaction Details');
  const detailHeader = detailWs.addRow(['Date', 'Vendor', 'Amount', 'Category (SM)', 'App Category', 'Card Last 4', 'Notes']);
  detailHeader.font = { bold: true };
  detailHeader.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  yearExpenses
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .forEach((expense: any) => {
      const smCol = classifyExpense(expense);
      const smLabel = SM_COLUMNS.find(c => c.key === smCol)?.label || smCol;
      detailWs.addRow([
        expense.date,
        expense.vendor_name,
        Number(expense.amount),
        smLabel,
        expense.category,
        expense.card_last4 || '',
        expense.notes || '',
      ]);
    });

  // Column widths
  ws.getColumn(1).width = 12;
  SM_COLUMNS.forEach((col, i) => { ws.getColumn(i + 2).width = Math.max(col.width, 10); });
  ws.getColumn(SM_COLUMNS.length + 2).width = 12;

  detailWs.getColumn(1).width = 12;
  detailWs.getColumn(2).width = 30;
  detailWs.getColumn(3).width = 12;
  detailWs.getColumn(4).width = 30;
  detailWs.getColumn(5).width = 15;
  detailWs.getColumn(6).width = 12;
  detailWs.getColumn(7).width = 50;
  detailWs.getColumn(3).numFmt = '#,##0.00';

  // --- UBER CARD TRANSACTIONS SHEET ---
  if (year === 2025) {
    const uberWs = workbook.addWorksheet('Uber Card Expenses');
    const uberTitle = uberWs.addRow(['UBER PRO CARD — EXPENSES PAID WITH UBER CARD (Aug-Dec 2025)']);
    uberTitle.font = { bold: true, size: 14 };
    uberWs.addRow(['These are actual purchases made using the Uber Pro Mastercard (not Uber payouts or bank transfers)']);
    uberWs.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    uberWs.addRow([]);
    
    const uberHeader = uberWs.addRow(['Date', 'Vendor', 'Amount', 'Category', 'Notes']);
    uberHeader.font = { bold: true };
    uberHeader.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    let uberTotal = 0;
    UBER_CARD_EXPENSES_2025.forEach(e => {
      uberWs.addRow([e.date, e.vendor_name, e.amount, e.category, e.notes]);
      uberTotal += e.amount;
    });

    uberWs.addRow([]);
    const uberTotalRow = uberWs.addRow(['', 'TOTAL', uberTotal, '', '']);
    uberTotalRow.font = { bold: true, size: 12 };
    uberTotalRow.getCell(3).numFmt = '$#,##0.00';

    uberWs.getColumn(1).width = 14;
    uberWs.getColumn(2).width = 30;
    uberWs.getColumn(3).width = 14;
    uberWs.getColumn(3).numFmt = '$#,##0.00';
    uberWs.getColumn(4).width = 15;
    uberWs.getColumn(5).width = 30;

    // --- DRIVING INCOME SUMMARY SHEET ---
    const driveWs = workbook.addWorksheet('Driving Income Summary');
    const driveTitle = driveWs.addRow(['UBER PRO CARD — MONTHLY DRIVING SUMMARY 2025']);
    driveTitle.font = { bold: true, size: 14 };
    driveWs.addRow(['From Uber Pro Card statements (Aug-Dec 2025)']);
    driveWs.getRow(2).font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    driveWs.addRow([]);

    const driveHeader = driveWs.addRow(['Month', 'Total Credits (Income)', 'Total Debits (Expenses)', 'Net']);
    driveHeader.font = { bold: true };
    driveHeader.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });

    let totalCredits = 0, totalDebits = 0;
    Object.entries(UBER_CARD_DRIVING_INCOME_2025).forEach(([monthIdx, data]) => {
      const monthName = MONTHS[Number(monthIdx)];
      driveWs.addRow([monthName, data.credits, data.debits, data.credits - data.debits]);
      totalCredits += data.credits;
      totalDebits += data.debits;
    });

    driveWs.addRow([]);
    const driveTotalRow = driveWs.addRow(['TOTAL', totalCredits, totalDebits, totalCredits - totalDebits]);
    driveTotalRow.font = { bold: true, size: 12 };

    driveWs.getColumn(1).width = 14;
    driveWs.getColumn(2).width = 22;
    driveWs.getColumn(2).numFmt = '$#,##0.00';
    driveWs.getColumn(3).width = 22;
    driveWs.getColumn(3).numFmt = '$#,##0.00';
    driveWs.getColumn(4).width = 16;
    driveWs.getColumn(4).numFmt = '$#,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `TAX_RETURN_SPREADSHEET_SALAD_MASTER_${year}.xlsx`);
}

export async function generateDeliveryExpensesExcel(expenses: any[], year: number, odometerData?: OdometerExportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  
  // CRA Instructions sheet FIRST
  addCRAInstructionsSheet(workbook, year, 'Delivery Driver (Uber/DoorDash/Skip)', odometerData);
  
  // All vehicle/delivery-related categories
  const deliveryCategories = ['fuel', 'repairs', 'insurance', 'licence', 'interest', 'parking', 'leasing'];
  
  const yearExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    if (d.getFullYear() !== year || e.deleted_at) return false;
    if (e.purpose !== 'business') return false;
    
    if (deliveryCategories.includes(e.category)) return true;
    
    const smClass = classifyExpense(e);
    return ['gas', 'car', 'car_maintenance', 'car_gas', 'drivers_insurance', 
            'car_wash', 'transportation', 'licence', 'repairs'].includes(smClass);
  }).sort((a: any, b: any) => a.date.localeCompare(b.date));

  // --- VEHICLE SUMMARY SHEET ---
  const vehicleWs = workbook.addWorksheet('Vehicle Summary');
  vehicleWs.addRow(['CRA Form T2125 - Vehicle Expense Report']);
  vehicleWs.getRow(1).font = { bold: true, size: 16 };
  vehicleWs.addRow([`Tax Year: ${year}`]);
  vehicleWs.getRow(2).font = { bold: true, size: 12 };
  vehicleWs.addRow([`Generated: ${format(new Date(), 'MMMM d, yyyy')}`]);
  vehicleWs.addRow([]);

  // Odometer section
  vehicleWs.addRow(['ODOMETER READINGS']);
  vehicleWs.getRow(5).font = { bold: true, size: 12 };
  if (odometerData) {
    vehicleWs.addRow(['Start of Year (Jan 1)', `${odometerData.startReading.toLocaleString()} km`]);
    vehicleWs.addRow(['End of Year (Dec 31)', `${odometerData.endReading.toLocaleString()} km`]);
    vehicleWs.addRow(['Total Annual Kilometres', `${odometerData.totalKm.toLocaleString()} km`]);
    vehicleWs.addRow([]);
    vehicleWs.addRow(['BUSINESS USE']);
    vehicleWs.getRow(10).font = { bold: true, size: 12 };
    vehicleWs.addRow(['Business Kilometres', `${odometerData.businessKm.toLocaleString()} km`]);
    vehicleWs.addRow(['Personal Kilometres', `${(odometerData.totalKm - odometerData.businessKm).toLocaleString()} km`]);
    const pctRow = vehicleWs.addRow(['Business-Use Percentage', `${odometerData.businessPercent.toFixed(1)}%`]);
    pctRow.font = { bold: true, size: 13, color: { argb: 'FF006100' } };
    vehicleWs.addRow([]);

    // Car purchase details
    vehicleWs.addRow(['CAR PURCHASE / CAPITAL COST ALLOWANCE (CCA)']);
    vehicleWs.getRow(vehicleWs.rowCount).font = { bold: true, size: 12 };
    vehicleWs.addRow(['Purchase Date', 'July 15, 2025']);
    vehicleWs.addRow(['Purchase Price', '$8,000.00']);
    vehicleWs.addRow(['Business-Use Portion', `$${(8000 * odometerData.businessPercent / 100).toFixed(2)}`]);
    vehicleWs.addRow(['CCA Class', 'Class 10 — 30% declining balance rate']);
    vehicleWs.addRow(['Half-Year Rule', 'Applies in year of acquisition (50% of CCA claim)']);
    vehicleWs.addRow(['Year 1 CCA Estimate', `$${(8000 * odometerData.businessPercent / 100 * 0.30 * 0.50).toFixed(2)}`]);
    vehicleWs.addRow(['Note', 'Accountant to confirm CCA class and calculate final amount']);
    vehicleWs.addRow([]);
  } else {
    vehicleWs.addRow(['No odometer data recorded']);
  }

  // Expense summary
  const summaryStartRow = vehicleWs.rowCount + 1;
  vehicleWs.addRow(['EXPENSE SUMMARY BY T2125 CATEGORY']);
  vehicleWs.getRow(summaryStartRow).font = { bold: true, size: 12 };
  
  const summaryHeaderRow = vehicleWs.addRow(['Category', 'Total Amount', 'Count', 'Deductible Amount (at business %)']);
  summaryHeaderRow.font = { bold: true };
  summaryHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  const t2125Categories: Record<string, string> = {
    gas: 'Fuel / Gas (Line 9281)',
    repairs: 'Repairs & Maintenance (Line 9284)',
    car_wash: 'Car Wash',
    drivers_insurance: 'Vehicle Insurance - ICBC (Line 9282)',
    licence: 'Licence & Registration (Line 9283)',
    transportation: 'Transportation (Modo/EVO Car Share)',
    car: 'Capital Cost - Car Purchase (Line 9936/CCA)',
    car_maintenance: 'Car Maintenance',
    car_gas: 'Gas (Car)',
    interest: 'Interest / Leasing',
  };

  const groupedTotals: Record<string, { total: number; count: number }> = {};
  yearExpenses.forEach(e => {
    const smClass = classifyExpense(e);
    if (!groupedTotals[smClass]) groupedTotals[smClass] = { total: 0, count: 0 };
    groupedTotals[smClass].total += Number(e.amount);
    groupedTotals[smClass].count++;
  });

  let grandTotal = 0;
  const businessPct = odometerData?.businessPercent ?? 0;
  Object.entries(groupedTotals)
    .sort(([, a], [, b]) => b.total - a.total)
    .forEach(([cat, data]) => {
      const label = t2125Categories[cat] || cat;
      const deductible = data.total * (businessPct / 100);
      vehicleWs.addRow([label, data.total, data.count, deductible]);
      grandTotal += data.total;
    });

  vehicleWs.addRow([]);
  const totalRow = vehicleWs.addRow(['TOTAL', grandTotal, yearExpenses.length, grandTotal * (businessPct / 100)]);
  totalRow.font = { bold: true, size: 12 };
  totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  totalRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  totalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };

  vehicleWs.getColumn(1).width = 45;
  vehicleWs.getColumn(2).width = 18;
  vehicleWs.getColumn(2).numFmt = '$#,##0.00';
  vehicleWs.getColumn(3).width = 10;
  vehicleWs.getColumn(4).width = 25;
  vehicleWs.getColumn(4).numFmt = '$#,##0.00';

  // --- MONTHLY BREAKDOWN SHEET ---
  const monthlyWs = workbook.addWorksheet('Monthly Breakdown');
  const monthHeaders = ['Category', ...MONTHS.map(m => m.substring(0, 3)), 'TOTAL'];
  const mHeaderRow = monthlyWs.addRow(monthHeaders);
  mHeaderRow.font = { bold: true };
  mHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  const monthlyByCategory: Record<string, number[]> = {};
  yearExpenses.forEach(e => {
    const month = parseISO(e.date).getMonth();
    const smClass = classifyExpense(e);
    if (!monthlyByCategory[smClass]) monthlyByCategory[smClass] = new Array(12).fill(0);
    monthlyByCategory[smClass][month] += Number(e.amount);
  });

  Object.entries(monthlyByCategory).forEach(([cat, months]) => {
    const label = t2125Categories[cat] || cat;
    const total = months.reduce((s, v) => s + v, 0);
    monthlyWs.addRow([label, ...months.map(v => v > 0 ? v : ''), total]);
  });

  const mTotalRow = monthlyWs.addRow(['TOTAL']);
  mTotalRow.font = { bold: true };
  for (let i = 1; i <= 13; i++) {
    const cLetter = colLetter(i); // B=1, C=2, ... N=13
    mTotalRow.getCell(i + 1).value = { formula: `SUM(${cLetter}2:${cLetter}${mTotalRow.number - 1})` } as any;
    mTotalRow.getCell(i + 1).numFmt = '$#,##0.00';
  }

  monthlyWs.getColumn(1).width = 45;
  for (let i = 2; i <= 14; i++) {
    monthlyWs.getColumn(i).width = 12;
    monthlyWs.getColumn(i).numFmt = '$#,##0.00';
  }

  // --- DETAIL SHEET ---
  const detailWs = workbook.addWorksheet('Expense Details');
  const dHeaderRow = detailWs.addRow(['Date', 'Vendor', 'Category (T2125)', 'Amount', 'Card Last 4', 'Notes']);
  dHeaderRow.font = { bold: true };
  dHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  yearExpenses.forEach((e: any) => {
    const smClass = classifyExpense(e);
    const label = t2125Categories[smClass] || smClass;
    detailWs.addRow([
      e.date,
      e.vendor_name,
      label,
      Number(e.amount),
      e.card_last4 || '',
      e.notes || '',
    ]);
  });

  detailWs.getColumn(1).width = 12;
  detailWs.getColumn(2).width = 35;
  detailWs.getColumn(3).width = 40;
  detailWs.getColumn(4).width = 12;
  detailWs.getColumn(4).numFmt = '$#,##0.00';
  detailWs.getColumn(5).width = 12;
  detailWs.getColumn(6).width = 50;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Delivery_Expenses_T2125_${year}.xlsx`);
}

/**
 * Generate Expenses Receipt Excel matching the user's manual template format
 * Columns: Date, Store, Item, Item Price, Qty, Unit Price, GST, PST, Total Tax, Tip, Total Price
 */
export async function generateExpensesReceiptExcel(expenses: any[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`Expenses ${year}`);

  const yearExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && !e.deleted_at;
  }).sort((a: any, b: any) => a.date.localeCompare(b.date));

  // Header row matching user's template
  const headerRow = ws.addRow([
    'Date', 'Store', 'Item', 'Item Price', 'No Of Item/Total Weight', 
    'Unit Price', 'GST', 'PST', 'Total Tax', 'Tip', 'Total Price', 'Purpose', 'Card'
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
  });

  yearExpenses.forEach((expense: any) => {
    const formattedDate = format(parseISO(expense.date), 'd-MMM-yy');
    const store = expense.vendor_name || '';
    const notes = expense.notes || '';
    
    // Parse line items from notes
    const lines = notes.split('\n').filter((l: string) => l.trim());
    
    if (lines.length > 0) {
      let isFirstLine = true;
      lines.forEach((line: string) => {
        const trimmed = line.trim();
        // Skip non-item lines
        if (trimmed.startsWith('Added from statement') || trimmed.startsWith('Statement verified') || trimmed.startsWith('|')) return;
        
        const countMatch = trimmed.match(/^(.+?)\s*\(x(\d+(?:\.\d+)?)\)\s*-\s*\$?([\d.]+)/i);
        const weightMatch = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\s*(kg|g|lb|oz|L|ml|l)\)\s*-\s*\$?([\d.]+)/i);
        const simpleMatch = trimmed.match(/^(.+?)\s*-\s*\$?([\d.]+)$/);
        
        let itemName = trimmed;
        let qty: number | string = 1;
        let unitPrice = 0;
        let totalPrice = 0;

        if (countMatch) {
          itemName = countMatch[1].trim();
          qty = parseFloat(countMatch[2]);
          totalPrice = parseFloat(countMatch[3]);
          unitPrice = qty > 0 ? totalPrice / qty : totalPrice;
        } else if (weightMatch) {
          itemName = weightMatch[1].trim();
          qty = `${weightMatch[2]} ${weightMatch[3]}`;
          totalPrice = parseFloat(weightMatch[4]);
          unitPrice = totalPrice;
        } else if (simpleMatch) {
          itemName = simpleMatch[1].trim();
          totalPrice = parseFloat(simpleMatch[2]);
          unitPrice = totalPrice;
        } else {
          return;
        }

        ws.addRow([
          isFirstLine ? formattedDate : '',
          isFirstLine ? store : '',
          itemName,
          totalPrice > 0 ? totalPrice : '',
          qty,
          unitPrice > 0 ? unitPrice : '',
          '', '', '', '',
          isFirstLine ? Number(expense.amount) : '',
          isFirstLine ? (expense.purpose || '') : '',
          isFirstLine ? (expense.card_last4 || '') : '',
        ]);
        isFirstLine = false;
      });
    } else {
      ws.addRow([
        formattedDate, store, expense.category || 'Item',
        Number(expense.amount), 1, Number(expense.amount),
        '', '', '', '',
        Number(expense.amount),
        expense.purpose || '',
        expense.card_last4 || '',
      ]);
    }
  });

  // Column widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 35;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 12;
  ws.getColumn(7).width = 8;
  ws.getColumn(8).width = 8;
  ws.getColumn(9).width = 10;
  ws.getColumn(10).width = 8;
  ws.getColumn(11).width = 12;
  ws.getColumn(12).width = 10;
  ws.getColumn(13).width = 8;

  [4, 6, 9, 10, 11].forEach(col => { ws.getColumn(col).numFmt = '#,##0.00'; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Expenses_Receipt_${year}.xlsx`);
}
