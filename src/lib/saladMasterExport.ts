import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { parseISO, format } from 'date-fns';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

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
];

// Classify an expense into the correct SM column
function classifyExpense(expense: any): string {
  const vendor = (expense.vendor_name || '').toLowerCase();
  const notes = (expense.notes || '').toLowerCase();
  const category = expense.category || 'other';

  // Fuel/Gas
  if (category === 'fuel' || vendor.includes('esso') || vendor.includes('petro') || 
      vendor.includes('chevron') || vendor.includes('shell') || vendor.includes('mobil') ||
      vendor.includes('hi quadra') || vendor.includes('hi-quadra')) {
    return 'gas';
  }

  // Insurance
  if (category === 'insurance' || vendor.includes('icbc') || vendor.includes('amc insurance')) {
    return 'drivers_insurance';
  }

  // Licence
  if (category === 'licence' || vendor.includes('driver services')) {
    return 'licence';
  }

  // Repairs & Maintenance
  if (category === 'repairs' || vendor.includes('mr. lube') || vendor.includes('mr lube') ||
      vendor.includes('tennyson auto') || vendor.includes('gs auto') || vendor.includes('canadian tire') ||
      vendor.includes('dr. phone')) {
    return 'repairs';
  }

  // Car purchase
  if (notes.includes('car purchase')) {
    return 'car';
  }

  // Car share / transportation
  if (vendor.includes('evo car') || vendor.includes('modo') || vendor.includes('bcferries') || 
      vendor.includes('bc ferries') || vendor.includes('yellow cab') || vendor.includes('bluebird cabs') ||
      vendor.includes('bc transit')) {
    return 'transportation';
  }

  // Car wash
  if (notes.includes('car wash') || notes.includes('full wash')) {
    return 'car_wash';
  }

  // Haircut / grooming
  if (vendor.includes('sonu hair') || vendor.includes('haircut')) {
    return 'grooming';
  }

  // Clothing
  if (vendor.includes('winners') || vendor.includes('old navy') || vendor.includes('foot locker')) {
    return 'clothing';
  }

  // Restaurants / meals / entertainment
  if (vendor.includes('subway') || vendor.includes('noodlebox') || vendor.includes('dosa paragon') ||
      vendor.includes('baan thai') || vendor.includes('pho u') || vendor.includes('sizzling tandoor') ||
      vendor.includes('himalayan') || vendor.includes('bin 4') || vendor.includes('browns social') ||
      vendor.includes('marhaba') || vendor.includes('starbucks') || vendor.includes('tim horton') ||
      vendor.includes('royal spice') || vendor.includes('kukus') || vendor.includes('kuku') ||
      vendor.includes('end dive') || vendor.includes('mexican village') || vendor.includes('city centre park') ||
      vendor.includes('ramen') || vendor.includes('old country') || vendor.includes('a&w') || vendor.includes('aw ') ||
      vendor.includes('shelbourne') || vendor.includes('4mile') || vendor.includes('kutatas') ||
      vendor.includes('beacon hill') || vendor.includes('for good measure')) {
    return 'entertainment';
  }

  // Pharmacy / medical
  if (vendor.includes('pharmasave') || vendor.includes('london drugs')) {
    return 'medicals';
  }

  // Costco / wholesale
  if (vendor.includes('costco') || vendor.includes('mm food')) {
    return 'membership';
  }

  // Lovable / software / professional
  if (vendor.includes('lovable')) {
    return 'professional_fees';
  }

  // FedEx / shipping
  if (vendor.includes('fedex') || vendor.includes('shipping')) {
    return 'delivery_freight';
  }

  // Hydro
  if (vendor.includes('hydro')) {
    return 'hydro';
  }

  // Phone
  if (vendor.includes('fido') || vendor.includes('shaw')) {
    return 'phone_internet';
  }

  // Fit4less / gym
  if (vendor.includes('fit4less') || vendor.includes('goodlife')) {
    return 'medicals';
  }

  // Default: grocery/supplies (Thrifty Foods, Walmart food, etc.)
  return 'grocery';
}

export async function generateSaladMasterExcel(expenses: any[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(`Salad Master ${year}`);

  // Filter to business expenses for the year
  const yearExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && e.purpose === 'business' && !e.deleted_at;
  });

  // --- HEADER ROWS ---
  // Row 1: Category groups
  const groupRow = ws.addRow(['', 'SUPPLIES', 'CLOTHING', '', '', 'TRANSPORTATION', '', '', '', '', 'INTEREST', 'ENTERTAINMENT/MEALS', 'ADVERTISING', 'CAR WASH', 'DELIVERY/FREIGHT', 'REPAIRS/MAINTENANCE', 'USE OF HOME', '', '', '', '', 'LICENSE', '', '', '', '', '', 'MEMBERSHIP', '', 'TOTAL']);
  groupRow.font = { bold: true, size: 9 };

  // Row 2: Column headers
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
        // Use formula for transparency: =12.50+34.25+...
        rowValues.push(null); // placeholder
      } else {
        rowValues.push('');
      }
    });
    // Total column placeholder
    rowValues.push(null);

    const dataRow = ws.addRow(rowValues);
    const rowNum = dataRow.number;

    // Set formulas for each category cell
    SM_COLUMNS.forEach((col, i) => {
      const amounts = monthlyData[m][col.key];
      const cell = dataRow.getCell(i + 2);
      if (amounts.length > 0) {
        cell.value = { formula: amounts.map(a => a.toFixed(2)).join('+') } as any;
        cell.numFmt = '#,##0.00';
      }
    });

    // Row total formula (sum of all category cells)
    const firstCol = 'B';
    const lastColLetter = String.fromCharCode(65 + SM_COLUMNS.length); // after all columns
    const totalCell = dataRow.getCell(SM_COLUMNS.length + 2);
    totalCell.value = { formula: `SUM(B${rowNum}:${lastColLetter}${rowNum})` } as any;
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
    const colLetter = String.fromCharCode(66 + i); // B, C, D...
    const cell = totalsRow.getCell(i + 2);
    cell.value = { formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})` } as any;
    cell.numFmt = '#,##0.00';
  });

  // Grand total
  const grandTotalCell = totalsRow.getCell(SM_COLUMNS.length + 2);
  const lastColL = String.fromCharCode(65 + SM_COLUMNS.length);
  grandTotalCell.value = { formula: `SUM(B${totalsRow.number}:${lastColL}${totalsRow.number})` } as any;
  grandTotalCell.numFmt = '#,##0.00';
  grandTotalCell.font = { bold: true };

  // --- DETAIL SHEET ---
  const detailWs = workbook.addWorksheet('Transaction Details');
  const detailHeader = detailWs.addRow(['Date', 'Vendor', 'Amount', 'Category (SM)', 'App Category', 'Notes']);
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
  detailWs.getColumn(6).width = 50;

  // Number format for amount column in detail
  detailWs.getColumn(3).numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `TAX_RETURN_SPREADSHEET_SALAD_MASTER_${year}.xlsx`);
}

export async function generateDeliveryExpensesExcel(expenses: any[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  
  // Filter to delivery-related business expenses
  const deliveryCategories = ['fuel', 'repairs', 'insurance', 'licence', 'interest'];
  const yearExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && e.purpose === 'business' && !e.deleted_at && 
      deliveryCategories.includes(e.category);
  }).sort((a: any, b: any) => a.date.localeCompare(b.date));

  // T2125 Summary sheet
  const summaryWs = workbook.addWorksheet('T2125 Summary');
  summaryWs.addRow(['CRA Form T2125 - Vehicle Expenses', '', year]);
  summaryWs.getRow(1).font = { bold: true, size: 14 };
  summaryWs.addRow([]);
  summaryWs.addRow(['Category', 'Total Amount']);
  summaryWs.getRow(3).font = { bold: true };

  const categoryLabels: Record<string, string> = {
    fuel: 'Fuel',
    repairs: 'Repairs & Maintenance',
    insurance: 'Insurance',
    licence: 'Licence & Registration',
    interest: 'Interest/Leasing',
  };

  let grandTotal = 0;
  deliveryCategories.forEach(cat => {
    const total = yearExpenses
      .filter((e: any) => e.category === cat)
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    if (total > 0) {
      summaryWs.addRow([categoryLabels[cat], total]);
      grandTotal += total;
    }
  });

  summaryWs.addRow([]);
  const totalRow = summaryWs.addRow(['TOTAL', grandTotal]);
  totalRow.font = { bold: true };
  summaryWs.getColumn(1).width = 25;
  summaryWs.getColumn(2).width = 15;
  summaryWs.getColumn(2).numFmt = '$#,##0.00';

  // Detail sheet
  const detailWs = workbook.addWorksheet('Expense Details');
  const headerRow = detailWs.addRow(['Date', 'Vendor', 'Category', 'Amount', 'Card Last 4', 'Notes']);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  yearExpenses.forEach((e: any) => {
    detailWs.addRow([
      e.date,
      e.vendor_name,
      categoryLabels[e.category] || e.category,
      Number(e.amount),
      e.card_last4 || '',
      e.notes || '',
    ]);
  });

  detailWs.getColumn(1).width = 12;
  detailWs.getColumn(2).width = 30;
  detailWs.getColumn(3).width = 22;
  detailWs.getColumn(4).width = 12;
  detailWs.getColumn(4).numFmt = '$#,##0.00';
  detailWs.getColumn(5).width = 12;
  detailWs.getColumn(6).width = 50;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Delivery_Expenses_T2125_${year}.xlsx`);
}
