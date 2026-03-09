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
export function classifyExpense(expense: any): string {
  const vendor = (expense.vendor_name || '').toLowerCase();
  const notes = (expense.notes || '').toLowerCase();
  const category = expense.category || 'other';

  // Fuel/Gas (vehicle)
  if (category === 'fuel' || vendor.includes('esso') || vendor.includes('petro') || 
      vendor.includes('chevron') || vendor.includes('shell') || vendor.includes('mobil') ||
      vendor.includes('hi quadra') || vendor.includes('hi-quadra') ||
      vendor.includes('7-eleven') && notes.includes('gas')) {
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
      vendor.includes('bc transit') || vendor.includes('compass') || vendor.includes('city') && vendor.includes('taxi') ||
      vendor.includes('uber')) {
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

  // Haircut / grooming
  if (vendor.includes('sonu hair') || vendor.includes('haircut')) {
    return 'grooming';
  }

  // Clothing
  if (vendor.includes('winners') || vendor.includes('old navy') || vendor.includes('foot locker') ||
      vendor.includes('homesense')) {
    return 'clothing';
  }

  // Restaurants / meals / entertainment
  if (vendor.includes('subway') || vendor.includes('noodlebox') || vendor.includes('dosa paragon') ||
      vendor.includes('baan thai') || vendor.includes('pho u') || vendor.includes('sizzling tandoor') ||
      vendor.includes('himalayan') || vendor.includes('bin 4') || vendor.includes('browns social') ||
      vendor.includes('marhaba') || vendor.includes('starbucks') || vendor.includes('tim horton') ||
      vendor.includes('royal spice') || vendor.includes('kukus') || vendor.includes('kuku') ||
      vendor.includes('end dive') || vendor.includes('mexican village') || vendor.includes('city centre park') ||
      vendor.includes('ramen') || vendor.includes('old country') || vendor.includes('a&w') || 
      vendor.includes('shelbourne') || vendor.includes('4mile') || vendor.includes('kutatas') ||
      vendor.includes('beacon hill') || vendor.includes('for good measure') ||
      vendor.includes('dragon wok') || vendor.includes('freshslice') || vendor.includes('pizza') ||
      vendor.includes('ricardos') || vendor.includes('torquay') || vendor.includes('rock salt') ||
      vendor.includes('rhino coffee') || vendor.includes('doordash') ||
      (vendor === 'aw' || vendor.startsWith('aw '))) {
    return 'entertainment';
  }

  // Pharmacy / medical
  if (vendor.includes('pharmasave') || vendor.includes('london drugs') ||
      vendor.includes('fit4less') || vendor.includes('goodlife') ||
      vendor.includes('medicare') || vendor.includes('shoppers drug')) {
    return 'medicals';
  }

  // Costco / wholesale / MM Food
  if (vendor.includes('costco') || vendor.includes('mm food') || vendor.includes('wholesale')) {
    return 'membership';
  }

  // Lovable / software / professional
  if (vendor.includes('lovable') || vendor.includes('upwork') || vendor.includes('incite ai') ||
      vendor.includes('scarface trade')) {
    return 'professional_fees';
  }

  // FedEx / shipping
  if (vendor.includes('fedex') || vendor.includes('shipping')) {
    return 'delivery_freight';
  }

  // Phone / Internet
  if (vendor.includes('fido') || vendor.includes('shaw') || vendor.includes('fraser valley wireless')) {
    return 'phone_internet';
  }

  // Donations / gifts / advertising
  if (vendor.includes('operation smile') || vendor.includes('impact guru') ||
      vendor.includes('donation') || vendor.includes('fundrais') ||
      vendor.includes('4 mile liquor') || vendor.includes('liquor co') ||
      vendor.includes('cascadia liquor') || vendor.includes('bc liquor')) {
    return 'advertising';
  }

  // Dollarama / dollar stores → grocery/supplies
  if (vendor.includes('dollarama') || vendor.includes('dollar')) {
    return 'grocery';
  }

  // Default: grocery/supplies
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

    const firstCol = 'B';
    const lastColLetter = String.fromCharCode(65 + SM_COLUMNS.length);
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
    const colLetter = String.fromCharCode(66 + i);
    const cell = totalsRow.getCell(i + 2);
    cell.value = { formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})` } as any;
    cell.numFmt = '#,##0.00';
  });

  const grandTotalCell = totalsRow.getCell(SM_COLUMNS.length + 2);
  const lastColL = String.fromCharCode(65 + SM_COLUMNS.length);
  grandTotalCell.value = { formula: `SUM(B${totalsRow.number}:${lastColL}${totalsRow.number})` } as any;
  grandTotalCell.numFmt = '#,##0.00';
  grandTotalCell.font = { bold: true };

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

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `TAX_RETURN_SPREADSHEET_SALAD_MASTER_${year}.xlsx`);
}

export async function generateDeliveryExpensesExcel(expenses: any[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  
  // All vehicle/delivery-related categories
  const deliveryCategories = ['fuel', 'repairs', 'insurance', 'licence', 'interest'];
  
  // Also include business expenses classified as vehicle-related by vendor
  const yearExpenses = expenses.filter(e => {
    const d = parseISO(e.date);
    if (d.getFullYear() !== year || e.deleted_at) return false;
    if (e.purpose !== 'business') return false;
    
    // Include by category
    if (deliveryCategories.includes(e.category)) return true;
    
    // Include by SM classification (vehicle-related columns)
    const smClass = classifyExpense(e);
    return ['gas', 'car', 'car_maintenance', 'car_gas', 'drivers_insurance', 
            'car_wash', 'transportation', 'licence', 'repairs'].includes(smClass);
  }).sort((a: any, b: any) => a.date.localeCompare(b.date));

  // T2125 Summary sheet
  const summaryWs = workbook.addWorksheet('T2125 Summary');
  summaryWs.addRow(['CRA Form T2125 - Vehicle & Delivery Expenses', '', year]);
  summaryWs.getRow(1).font = { bold: true, size: 14 };
  summaryWs.addRow([]);
  summaryWs.addRow(['Category', 'Total Amount', 'Count']);
  summaryWs.getRow(3).font = { bold: true };
  summaryWs.getRow(3).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  });

  const t2125Categories: Record<string, string> = {
    gas: 'Fuel / Gas',
    repairs: 'Repairs & Maintenance',
    car_wash: 'Car Wash',
    drivers_insurance: 'Vehicle Insurance (ICBC)',
    licence: 'Licence & Registration',
    transportation: 'Transportation (Ferries, Car Share, Taxi)',
    car: 'Car Purchase / Lease',
    car_maintenance: 'Car Maintenance',
    car_gas: 'Gas (Car)',
    interest: 'Interest / Leasing',
  };

  // Group by SM classification
  const groupedTotals: Record<string, { total: number; count: number }> = {};
  yearExpenses.forEach(e => {
    const smClass = classifyExpense(e);
    if (!groupedTotals[smClass]) groupedTotals[smClass] = { total: 0, count: 0 };
    groupedTotals[smClass].total += Number(e.amount);
    groupedTotals[smClass].count++;
  });

  let grandTotal = 0;
  Object.entries(groupedTotals)
    .sort(([, a], [, b]) => b.total - a.total)
    .forEach(([cat, data]) => {
      const label = t2125Categories[cat] || cat;
      summaryWs.addRow([label, data.total, data.count]);
      grandTotal += data.total;
    });

  summaryWs.addRow([]);
  const totalRow = summaryWs.addRow(['TOTAL', grandTotal, yearExpenses.length]);
  totalRow.font = { bold: true };
  summaryWs.getColumn(1).width = 40;
  summaryWs.getColumn(2).width = 15;
  summaryWs.getColumn(2).numFmt = '$#,##0.00';
  summaryWs.getColumn(3).width = 10;

  // Monthly breakdown sheet
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
    const colLetter = String.fromCharCode(65 + i);
    mTotalRow.getCell(i + 1).value = { formula: `SUM(${colLetter}2:${colLetter}${mTotalRow.number - 1})` } as any;
    mTotalRow.getCell(i + 1).numFmt = '$#,##0.00';
  }

  monthlyWs.getColumn(1).width = 40;
  for (let i = 2; i <= 14; i++) {
    monthlyWs.getColumn(i).width = 12;
    monthlyWs.getColumn(i).numFmt = '$#,##0.00';
  }

  // Detail sheet
  const detailWs = workbook.addWorksheet('Expense Details');
  const dHeaderRow = detailWs.addRow(['Date', 'Vendor', 'Category', 'Amount', 'Card Last 4', 'Notes']);
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
  detailWs.getColumn(3).width = 35;
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
        // Pattern: "Item Name (xN) - $price" or "Item Name (N.N kg) - $price" or "Item Name - $price"
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
          return; // skip unparseable lines
        }

        ws.addRow([
          isFirstLine ? formattedDate : '',
          isFirstLine ? store : '',
          itemName,
          totalPrice > 0 ? totalPrice : '',
          qty,
          unitPrice > 0 ? unitPrice : '',
          '', '', '', '', // GST, PST, Total Tax, Tip (not available from data)
          isFirstLine ? Number(expense.amount) : '',
          isFirstLine ? (expense.purpose || '') : '',
          isFirstLine ? (expense.card_last4 || '') : '',
        ]);
        isFirstLine = false;
      });
    } else {
      // No line items - single row
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

  // Number formats
  [4, 6, 9, 10, 11].forEach(col => { ws.getColumn(col).numFmt = '#,##0.00'; });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Expenses_Receipt_${year}.xlsx`);
}
