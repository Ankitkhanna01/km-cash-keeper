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
  { key: 'online_shopping', label: 'ONLINE SHOPPING', width: 16 },
  { key: 'stationary', label: 'STATIONARY', width: 14 },
  { key: 'mobile_bill', label: 'MOBILE BILL', width: 14 },
  { key: 'driving_test', label: 'DRIVING TEST FEES', width: 18 },
  { key: 'trading', label: 'TRADING BUSINESS', width: 18 },
  { key: 'soap_personal', label: 'SOAP/PERSONAL CARE', width: 18 },
];

// Classify an expense into the correct SM column
// Returns { column, unknown } — unknown=true means we couldn't confidently classify
// Transactions to exclude from the Salad Master export entirely
export function shouldExcludeExpense(expense: any): boolean {
  const vendor = (expense.vendor_name || '').toLowerCase().trim();
  const notes = (expense.notes || '').toLowerCase();
  
  // Remove Remitly transactions
  if (vendor.includes('remitly')) return true;
  // Remove Interac e-Transfer transactions
  if (vendor.includes('e-transfer') || vendor.includes('etransfer') || vendor.includes('e transfer') ||
      vendor.includes('interac') || vendor.includes('interact')) return true;
  // Remove Interest Capitalize (line of credit interest)
  if (vendor.includes('interest capitalize') || vendor.includes('interest capitali') ||
      vendor.includes('interest - capitalise') || vendor.includes('interest -capitalise') ||
      notes.includes('interest capitalize') || notes.includes('interest capitalise')) return true;
  // Remove Pre Auth Debit
  if (vendor.includes('pre auth debit') || vendor.includes('pre-auth debit') ||
      vendor.includes('preauth debit') || vendor.includes('pre authorized debit') ||
      vendor.includes('pre-authorized debit')) return true;
  // Remove Service Charge
  if (vendor.includes('service charge') || vendor.includes('service chg') ||
      vendor.includes('monthly fee') || vendor.includes('acct fee')) return true;
  // Remove transactions named "Canada" (not Canadian Tire etc.)
  if (vendor === 'canada') return true;
  // Remove specific card/bank/transfer transactions
  if (vendor === 'visa' || vendor === 'mastercard' || vendor === 'american express cards' ||
      vendor.includes('cibc/banque cibc') || vendor.includes('banque cibc') ||
      vendor.includes('mbna canada b') || vendor.includes('mbna canada personal bt') ||
      vendor.includes('cbl frm neeraj kumar') || vendor.includes('cbl frm pooja') ||
      vendor.includes('transfer out') ||
      vendor.includes('visa simplii financial') ||
      vendor.includes('1041956 bc ltd') || vendor.includes('1479307 bc ltd') ||
      vendor.includes('american express card')) return true;
  // Remove withdrawal transactions
  if (vendor.includes('withdrawal') || vendor.startsWith('atm ') || vendor.includes('atm withdrawal')) return true;
  // Remove transactions named "purchase" (bare name, not in vendor names like "car purchase")
  if (vendor === 'purchase') return true;
  // Remove PRICELINE ACCENT INN
  if (vendor.includes('priceline') && vendor.includes('accent inn')) return true;
  if (vendor.includes('priceline accent inn')) return true;
  // Remove PAYPAL UPWORK ESCROW
  if (vendor.includes('paypal upwork') || vendor.includes('upwork escrow')) return true;
  // Remove POS reversals (refunds, not expenses)
  if (vendor.includes('pos reversal') || vendor.includes('reversal')) return true;
  
  return false;
}

export function classifyExpense(expense: any): { column: string; unknown: boolean } {
  const vendor = (expense.vendor_name || '').toLowerCase();
  const notes = (expense.notes || '').toLowerCase();
  const category = expense.category || 'other';

  // Map "1598" to Rent
  if (vendor.includes('1598') || vendor === '1598') {
    return { column: 'rent', unknown: false };
  }

  // Fuel/Gas (vehicle) — gas stations only
  if (category === 'fuel' || vendor.includes('esso') || vendor.includes('petro') || 
      vendor.includes('chevron') || vendor.includes('shell') || vendor.includes('mobil') ||
      vendor.includes('hi quadra') || vendor.includes('hi-quadra') ||
      vendor.includes('smart stop') ||
      (vendor.includes('7-eleven') && (notes.includes('gas') || category === 'fuel'))) {
    if (vendor.includes('modo')) return { column: 'transportation', unknown: false };
    return { column: 'gas', unknown: false };
  }

  // Insurance (vehicle)
  if (category === 'insurance' || vendor.includes('icbc') || vendor.includes('amc insurance')) {
    return { column: 'drivers_insurance', unknown: false };
  }

  // Home insurance
  if (vendor.includes('home insurance') || vendor.includes('tenant insurance') || 
      vendor.includes('renter insurance') || vendor.includes('house insurance')) {
    return { column: 'home_insurance', unknown: false };
  }

  // Rent
  if (vendor.includes('rent') && !vendor.includes('enterprise rent') ||
      vendor.includes('landlord') || vendor.includes('property management') ||
      vendor.includes('strata') || vendor.includes('housing')) {
    return { column: 'rent', unknown: false };
  }

  // Driving test fees
  if (vendor.includes('driver services centre') || vendor.includes('driver services center')) {
    return { column: 'driving_test', unknown: false };
  }

  // Licence
  if (category === 'licence' || vendor.includes('driver services')) {
    return { column: 'licence', unknown: false };
  }

  // Repairs
  if (category === 'repairs' || vendor.includes('mr. lube') || vendor.includes('mr lube') ||
      vendor.includes('tennyson auto') || vendor.includes('gs auto') ||
      vendor.includes('car repair') || vendor.includes('car detailing') || vendor.includes('detailing')) {
    return { column: 'repairs', unknown: false };
  }

  // Car purchase
  if (notes.includes('car purchase') || (vendor.includes('coast capital') && notes.includes('car')) ||
      (vendor.includes('official draft') && Number(expense.amount) === 8000) ||
      (vendor.includes('coast capital') && Number(expense.amount) === 8000)) {
    return { column: 'car', unknown: false };
  }

  // Parking
  if (vendor.includes('parking') || vendor.includes('parkvictoria') || vendor.includes('pacrim park') ||
      vendor.includes('robbins') || vendor.includes('honk') || vendor.includes('place face up') ||
      vendor.includes('r parking')) {
    return { column: 'parking', unknown: false };
  }

  // Hotel (priceline accent inn already excluded above)
  if (vendor.includes('accent inn') || vendor.includes('tofino')) {
    return { column: 'transportation', unknown: false };
  }

  // Transportation
  if (vendor.includes('evo car') || vendor.includes('modo') || vendor.includes('bcferries') || 
      vendor.includes('bc ferries') || vendor.includes('bcf -') ||
      vendor.includes('yellow cab') || vendor.includes('bluebird cabs') || vendor.includes('ellow cab') ||
      vendor.includes('bc transit') || vendor.includes('compass') || 
      (vendor.includes('city') && vendor.includes('taxi')) ||
      vendor.includes('uber') || vendor.includes('paypal uber') || vendor.includes('paypal *uber') ||
      vendor.includes('pos purchase paypal uber') ||
      vendor.includes('allresto') || vendor.includes('tofino')) {
    return { column: 'transportation', unknown: false };
  }

  // Car wash
  if (notes.includes('car wash') || notes.includes('full wash')) {
    return { column: 'car_wash', unknown: false };
  }

  // Hydro
  if (vendor.includes('hydro') || vendor.includes('b.c. hydro')) {
    return { column: 'hydro', unknown: false };
  }

  // Dental
  if (vendor.includes('dental') || vendor.includes('times dental')) {
    return { column: 'medicals', unknown: false };
  }

  // Gym
  if (vendor.includes('fit4less') || vendor.includes('goodlife')) {
    return { column: 'gym', unknown: false };
  }

  // Pharmacy/medical
  if (vendor.includes('pharmasave') ||
      vendor.includes('medicare') || vendor.includes('shoppers drug') ||
      vendor.includes('viha') || vendor.includes('env hlth')) {
    return { column: 'medicals', unknown: false };
  }

  // London Drugs
  if (vendor.includes('london drugs')) {
    return { column: 'grocery', unknown: false };
  }

  // Soap/personal care (online soap purchase)
  if (vendor.includes('crate 61')) {
    return { column: 'soap_personal', unknown: false };
  }

  // Grooming
  if (vendor.includes('sonu hair') || vendor.includes('haircut') || vendor.includes('barber')) {
    return { column: 'grooming', unknown: false };
  }

  // Airport Shopping
  if (vendor.includes('world duty free')) {
    return { column: 'airport_shopping', unknown: false };
  }
  if (vendor.includes('sterlingbackcheck')) {
    return { column: 'airport_shopping', unknown: false };
  }

  // Clothing
  if (vendor.includes('winners') || vendor.includes('homesense') || vendor.includes('winnershomesense') ||
      vendor.includes('old navy') || vendor.includes('foot locker') ||
      vendor.includes('marshalls') || vendor.includes('h&m') ||
      vendor.includes('uniqlo') ||
      (vendor.includes('walmart') && notes.includes('cloth'))) {
    return { column: 'clothing', unknown: false };
  }

  // Restaurants / entertainment
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
    return { column: 'entertainment', unknown: false };
  }

  // Costco → grocery
  if (vendor.includes('costco')) {
    return { column: 'grocery', unknown: false };
  }

  // Wholesale
  if (vendor.includes('mm food') || vendor.includes('wholesale')) {
    return { column: 'membership', unknown: false };
  }

  // Vitamins
  if (vendor.includes('blueprint')) {
    return { column: 'vitamins', unknown: false };
  }

  // Trading business
  if (vendor.includes('scarface trade')) {
    return { column: 'trading', unknown: false };
  }

  // Stationary
  if (vendor.includes('staples')) {
    return { column: 'stationary', unknown: false };
  }

  // Professional fees
  if (vendor.includes('lovable') || vendor.includes('incite ai') ||
      vendor.includes('thinking canada') || vendor.includes('emergent') ||
      vendor.includes('a.k.p service') || vendor.includes('akp service') ||
      vendor.includes('shb holdings') || vendor.includes('paypal kitscomtech')) {
    return { column: 'professional_fees', unknown: false };
  }

  // Delivery/freight
  if (vendor.includes('fedex') || vendor.includes('shipping')) {
    return { column: 'delivery_freight', unknown: false };
  }

  // Mobile Bill (Fido, Fizz)
  if (vendor.includes('fido') || vendor.includes('fizz')) {
    return { column: 'mobile_bill', unknown: false };
  }

  // Phone/Internet
  if (vendor.includes('shaw') || vendor.includes('fraser valley wireless') ||
      vendor.includes('paypal google') || vendor.includes('paypal *google') ||
      vendor.includes('paypal twitter') || vendor.includes('pos purchase paypal google twitter')) {
    return { column: 'phone_internet', unknown: false };
  }

  // Alcohol
  if (vendor.includes('4 mile liquor') || vendor.includes('4mile') ||
      vendor.includes('liquor co') || vendor.includes('liquor plus') ||
      vendor.includes('cascadia liquor') || vendor.includes('bc liquor') ||
      vendor.includes('wandering bear')) {
    return { column: 'alcohol', unknown: false };
  }

  // Donations/advertising
  if (vendor.includes('operation smile') || vendor.includes('impact guru') ||
      vendor.includes('donation') || vendor.includes('fundrais') ||
      vendor.includes('larosaflowe') || vendor.includes('imagineart') ||
      vendor.includes('beastphilan') || vendor.includes('paypal *beastphilan') ||
      vendor.includes('paypal beastphilan')) {
    return { column: 'advertising', unknown: false };
  }

  // Canadian Tire
  if (vendor.includes('canadian tire')) {
    if (category === 'repairs') return { column: 'repairs', unknown: false };
    return { column: 'grocery', unknown: false };
  }

  // BC Gov fees
  if (vendor.includes('rsbc') || vendor.includes('bcgov')) {
    return { column: 'government_fees', unknown: false };
  }

  // Online shopping (Amazon, Temu)
  if (vendor.includes('amazon') || vendor.includes('temu') ||
      vendor.includes('paypal temu') || vendor.includes('temu.com')) {
    return { column: 'online_shopping', unknown: false };
  }

  // Walmart
  if (vendor.includes('walmart') || vendor.includes('wal-mart')) {
    return { column: 'grocery', unknown: false };
  }

  // Dollarama
  if (vendor.includes('dollarama') || vendor.includes('dollar')) {
    return { column: 'grocery', unknown: false };
  }

  // 7-Eleven (non-fuel)
  if (vendor.includes('7-eleven') || vendor.includes('7eleven')) {
    return { column: 'grocery', unknown: false };
  }

  // Grocery stores
  if (vendor.includes('thrifty') || vendor.includes('western foods') || vendor.includes('save-on') ||
      vendor.includes('superstore') || vendor.includes('fairway') || vendor.includes('h-mart') ||
      vendor.includes('real canadian')) {
    return { column: 'grocery', unknown: false };
  }

  // Minutekey
  if (vendor.includes('minutekey')) {
    return { column: 'grocery', unknown: false };
  }

  // DEFAULT: unknown transaction — flag it for review
  return { column: 'grocery', unknown: true };
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

// Driving income summary from all platforms — VERIFIED from uploaded paystubs & tax forms in DB
// DoorDash annual tax form: $1,245.65 total (matches sum of Jul-Nov paystubs, so Dec = $0)
// Uber annual tax summary: $4,781.54 total; Jul-Nov paystubs = $3,753.38; Dec paystubs = $456.78; unallocated = $571.38 added to Dec
// Skip: all from individual weekly paystubs with verified km
const DRIVING_INCOME_2025: Record<string, { doordash: number; skip: number; uber: number }> = {
  'JANUARY': { doordash: 0, skip: 0, uber: 0 },
  'FEBRUARY': { doordash: 0, skip: 0, uber: 0 },
  'MARCH': { doordash: 0, skip: 0, uber: 0 },
  'APRIL': { doordash: 0, skip: 0, uber: 0 },
  'MAY': { doordash: 0, skip: 0, uber: 0 },
  'JUNE': { doordash: 0, skip: 0, uber: 0 },
  'JULY': { doordash: 355.95, skip: 649.07, uber: 107.29 },
  'AUGUST': { doordash: 398.57, skip: 931.71, uber: 877.08 },
  'SEPTEMBER': { doordash: 223.88, skip: 438.50, uber: 913.30 },
  'OCTOBER': { doordash: 243.14, skip: 234.77, uber: 1221.36 },
  'NOVEMBER': { doordash: 24.11, skip: 88.41, uber: 634.35 },
  'DECEMBER': { doordash: 0, skip: 122.04, uber: 1028.16 },
};

export async function generateSaladMasterExcel(expenses: any[], year: number, odometerData?: OdometerExportData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  
  // CRA Instructions sheet FIRST
  addCRAInstructionsSheet(workbook, year, 'Salad Master / NutriSystem / Direct Sales', odometerData);
  
  const ws = workbook.addWorksheet(`Salad Master ${year}`);

  // Include ALL expenses for the year (personal + business), excluding unwanted types
  const dbExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && !e.deleted_at && !shouldExcludeExpense(e);
  });

  // Merge Uber card expenses (only for 2025)
  const uberCardExpenses = year === 2025 ? UBER_CARD_EXPENSES_2025 : [];
  const uniqueUberExpenses = uberCardExpenses.filter(ue => {
    if (shouldExcludeExpense(ue)) return false;
    return !dbExpenses.some(de => 
      de.date === ue.date && 
      de.vendor_name?.toLowerCase().includes(ue.vendor_name.toLowerCase().substring(0, 10)) &&
      Math.abs(Number(de.amount) - ue.amount) < 0.02
    );
  });

  // Deduplicate: remove transactions with same date, vendor, and amount
  const deduped = [...dbExpenses, ...uniqueUberExpenses];
  const seen = new Set<string>();
  const basicDeduped = deduped.filter(e => {
    const key = `${e.date}|${(e.vendor_name || '').toLowerCase().trim()}|${Number(e.amount).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Smart dedup: same vendor + same date with tip (keep higher amount)
  // and delayed posting (same vendor, ±1 day, same amount — keep first)
  function normalizeVendor(v: string): string {
    return (v || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 12);
  }
  
  const smartDeduped: any[] = [];
  const usedIndices = new Set<number>();
  
  for (let i = 0; i < basicDeduped.length; i++) {
    if (usedIndices.has(i)) continue;
    const e = basicDeduped[i];
    const eNorm = normalizeVendor(e.vendor_name);
    const eDate = e.date;
    let bestIdx = i;
    let bestAmount = Number(e.amount);
    
    for (let j = i + 1; j < basicDeduped.length; j++) {
      if (usedIndices.has(j)) continue;
      const f = basicDeduped[j];
      const fNorm = normalizeVendor(f.vendor_name);
      if (eNorm !== fNorm || eNorm.length < 4) continue;
      
      const dayDiff = Math.abs(new Date(eDate).getTime() - new Date(f.date).getTime()) / 86400000;
      if (dayDiff > 1) continue;
      
      const fAmount = Number(f.amount);
      // Same amount ±1 day = delayed posting duplicate
      if (Math.abs(bestAmount - fAmount) < 0.02) {
        usedIndices.add(j);
      }
      // Same date, same vendor, different amounts = tip scenario (keep higher)
      else if (dayDiff === 0 && Math.abs(bestAmount - fAmount) < bestAmount * 0.3) {
        if (fAmount > bestAmount) {
          usedIndices.add(bestIdx);
          bestIdx = j;
          bestAmount = fAmount;
        } else {
          usedIndices.add(j);
        }
      }
    }
    smartDeduped.push(basicDeduped[bestIdx]);
  }
  
  const yearExpenses = smartDeduped;

  // Track unknown transactions for flagging
  const unknownTransactions: any[] = [];

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
    const result = classifyExpense(expense);
    if (result.unknown) {
      unknownTransactions.push(expense);
    }
    if (monthlyData[month][result.column]) {
      monthlyData[month][result.column].push(Number(expense.amount));
    }
  });

  // --- DATA ROWS (one per month) ---
  MONTHS.forEach((monthName, m) => {
    const rowValues: any[] = [monthName];
    SM_COLUMNS.forEach(() => rowValues.push(null));
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
    const cLetter = colLetter(i + 1);
    const cell = totalsRow.getCell(i + 2);
    cell.value = { formula: `SUM(${cLetter}${firstDataRow}:${cLetter}${lastDataRow})` } as any;
    cell.numFmt = '#,##0.00';
  });

  const grandTotalCell = totalsRow.getCell(SM_COLUMNS.length + 2);
  grandTotalCell.value = { formula: `SUM(B${totalsRow.number}:${colLetter(SM_COLUMNS.length)}${totalsRow.number})` } as any;
  grandTotalCell.numFmt = '#,##0.00';
  grandTotalCell.font = { bold: true };

  // --- ODOMETER / CAR PURCHASE INFO ---
  ws.addRow([]);
  if (odometerData) {
    ws.addRow(['Car Purchase', '$8,000.00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Business Use: ${odometerData.businessPercent.toFixed(1)}%`]);
    ws.addRow(['Odometer Start', `${odometerData.startReading.toLocaleString()} km`]);
    ws.addRow(['Odometer End', `${odometerData.endReading.toLocaleString()} km`]);
    ws.addRow(['Total KM', `${odometerData.totalKm.toLocaleString()} km`]);
    ws.addRow(['Business KM', `${odometerData.businessKm.toLocaleString()} km`]);
    ws.addRow(['Business %', `${odometerData.businessPercent.toFixed(1)}%`]);
  }

  // --- UBER CARD DRIVING INCOME (inline, for 2025) ---
  if (year === 2025) {
    ws.addRow([]);
    const uberTitle = ws.addRow(['UBER PRO CARD — DRIVING INCOME SUMMARY (Aug-Dec 2025)']);
    uberTitle.font = { bold: true, size: 12 };
    ws.addRow(['Month', 'Total Credits (Income)', 'Total Debits (Expenses)', 'Net']);
    ws.getRow(ws.rowCount).font = { bold: true };
    ws.getRow(ws.rowCount).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    });

    let totalCredits = 0, totalDebits = 0;
    Object.entries(UBER_CARD_DRIVING_INCOME_2025).forEach(([monthIdx, data]) => {
      ws.addRow([MONTHS[Number(monthIdx)], data.credits, data.debits, data.credits - data.debits]);
      totalCredits += data.credits;
      totalDebits += data.debits;
    });
    const driveTotalRow = ws.addRow(['TOTAL', totalCredits, totalDebits, totalCredits - totalDebits]);
    driveTotalRow.font = { bold: true };

    // --- DRIVING INCOME FROM ALL PLATFORMS ---
    ws.addRow([]);
    const incomeTitle = ws.addRow(['DRIVING INCOME SUMMARY — ALL PLATFORMS (2025)']);
    incomeTitle.font = { bold: true, size: 12 };
    const incomeHeader = ws.addRow(['Month', 'DoorDash', 'Skip The Dishes', 'Uber', 'TOTAL']);
    incomeHeader.font = { bold: true };
    incomeHeader.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    });

    let totalDD = 0, totalSkip = 0, totalUber = 0;
    MONTHS.forEach(month => {
      const data = DRIVING_INCOME_2025[month] || { doordash: 0, skip: 0, uber: 0 };
      const monthTotal = data.doordash + data.skip + data.uber;
      if (monthTotal > 0) {
        ws.addRow([month, data.doordash, data.skip, data.uber, monthTotal]);
      }
      totalDD += data.doordash;
      totalSkip += data.skip;
      totalUber += data.uber;
    });
    const incomeTotalRow = ws.addRow(['TOTAL', totalDD, totalSkip, totalUber, totalDD + totalSkip + totalUber]);
    incomeTotalRow.font = { bold: true };
    incomeTotalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
    
    ws.addRow([]);
    ws.addRow(['NOTE: Verify these income figures against T4A slips and platform annual summaries.']);
    ws.getRow(ws.rowCount).font = { italic: true, color: { argb: 'FF666666' } };
  }

  // --- ALL TRANSACTION DETAILS (inline on same sheet) ---
  ws.addRow([]);
  ws.addRow([]);
  const detailTitle = ws.addRow(['ALL TRANSACTION DETAILS']);
  detailTitle.font = { bold: true, size: 14 };
  
  const detailHeader = ws.addRow(['Date', 'Vendor', 'Amount', 'Category (SM)', 'App Category', 'Card Last 4', 'Notes', '⚠️ NEEDS REVIEW']);
  detailHeader.font = { bold: true };
  detailHeader.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  // Highlight "NEEDS REVIEW" header in yellow
  detailHeader.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };

  yearExpenses
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .forEach((expense: any) => {
      const result = classifyExpense(expense);
      const smLabel = SM_COLUMNS.find(c => c.key === result.column)?.label || result.column;
      const row = ws.addRow([
        expense.date,
        expense.vendor_name,
        Number(expense.amount),
        smLabel,
        expense.category,
        expense.card_last4 || '',
        expense.notes || '',
        result.unknown ? `⚠️ ACCOUNTANT: What is "${expense.vendor_name}" ($${Number(expense.amount).toFixed(2)}) for? Please assign correct category.` : '',
      ]);
      
      if (result.unknown) {
        // Highlight the entire row in yellow for unknown transactions
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
        });
        row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        row.getCell(8).font = { bold: true, color: { argb: 'FFCC0000' } };
      }
    });

  // Column widths
  ws.getColumn(1).width = 12;
  SM_COLUMNS.forEach((col, i) => { ws.getColumn(i + 2).width = Math.max(col.width, 10); });
  ws.getColumn(SM_COLUMNS.length + 2).width = 12;

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
    
    const smClass = classifyExpense(e).column;
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
    const smClass = classifyExpense(e).column;
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
    const smClass = classifyExpense(e).column;
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
    const smClass = classifyExpense(e).column;
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
