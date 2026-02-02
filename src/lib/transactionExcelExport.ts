import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, parseISO } from 'date-fns';

interface ExpenseData {
  date: string;
  vendor_name: string;
  amount: number;
  category: string;
  notes: string | null;
}

async function saveWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename);
}

/**
 * Short Excel Export - Simple format with Date, Store, Item columns
 * Groups items by date and store for easy reading
 */
export async function generateShortExcel(expenses: ExpenseData[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Expenses ${year}`);

  // Filter expenses for the year and sort by date
  const yearExpenses = expenses
    .filter(e => e.date?.startsWith(year.toString()))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Add header row
  worksheet.addRow(['Date', 'Store', 'Item']);
  
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  // Add data rows
  yearExpenses.forEach(expense => {
    const formattedDate = format(parseISO(expense.date), 'dd-MMM-yy');
    const store = expense.vendor_name || '';
    const item = expense.notes || expense.category || '';
    
    worksheet.addRow([formattedDate, store, item]);
  });

  // Set column widths
  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 20;
  worksheet.getColumn(3).width = 40;

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}_Short.xlsx`);
}

interface ParsedLineItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

function parseLineItems(notes: string | null): ParsedLineItem[] {
  if (!notes) return [];
  
  const items: ParsedLineItem[] = [];
  const lines = notes.split('\n');
  
  lines.forEach(line => {
    // Match patterns like: "Item Name (x2) - $5.99" or "Item Name (0.5kg) - $3.50"
    const match = line.match(/^(.+?)\s*\((?:x)?(\d*\.?\d+)\s*(kg|g|lb|L|ml|pc|)?\)\s*-\s*\$?([\d.]+)/i);
    if (match) {
      const [, name, qty, unit, price] = match;
      items.push({
        name: name.trim(),
        quantity: parseFloat(qty) || 1,
        unit: unit || 'pc',
        price: parseFloat(price) || 0,
      });
    }
  });
  
  return items;
}

/**
 * Elaborate Excel Export - Detailed format with Date, Item, Quantity, Tax, Total
 * Includes individual line items from receipt scans
 */
export async function generateElaborateExcel(expenses: ExpenseData[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Expenses ${year}`);

  // Filter expenses for the year and sort by date
  const yearExpenses = expenses
    .filter(e => e.date?.startsWith(year.toString()))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Add header row
  worksheet.addRow(['Date', 'Store', 'Item Name', 'Quantity', 'Unit', 'Unit Price', 'Total']);
  
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
  });

  let totalItems = 0;
  let grandTotal = 0;

  // Add data rows - expand line items from notes
  yearExpenses.forEach(expense => {
    const formattedDate = format(parseISO(expense.date), 'dd/MM/yyyy');
    const store = expense.vendor_name || '';
    const lineItems = parseLineItems(expense.notes);
    
    if (lineItems.length > 0) {
      // Add each line item as a separate row
      lineItems.forEach(item => {
        worksheet.addRow([
          formattedDate,
          store,
          item.name,
          item.quantity,
          item.unit,
          Number(item.price.toFixed(2)),
          Number((item.quantity * item.price).toFixed(2))
        ]);
        totalItems++;
        grandTotal += item.quantity * item.price;
      });
    } else {
      // Fallback: add expense as single row if no line items parsed
      const itemName = expense.notes || expense.category || '';
      worksheet.addRow([
        formattedDate,
        store,
        itemName,
        1,
        'pc',
        Number(expense.amount.toFixed(2)),
        Number(expense.amount.toFixed(2))
      ]);
      totalItems++;
      grandTotal += expense.amount;
    }
  });

  // Add totals row
  const totalsRow = worksheet.addRow([
    '',
    'TOTAL',
    '',
    totalItems,
    '',
    '',
    Number(grandTotal.toFixed(2))
  ]);
  totalsRow.font = { bold: true };

  // Set column widths
  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 25;
  worksheet.getColumn(3).width = 35;
  worksheet.getColumn(4).width = 10;
  worksheet.getColumn(5).width = 8;
  worksheet.getColumn(6).width = 12;
  worksheet.getColumn(7).width = 12;

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}_Elaborate.xlsx`);
}
