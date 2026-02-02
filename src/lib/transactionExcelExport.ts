import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, parseISO } from 'date-fns';
import { cleanItemName, categorizeItem, ITEM_CATEGORY_LABELS } from './itemCategorization';

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
  cleanName: string;
  itemCategory: string;
  quantity: number;
  unit: string;
  price: number;
}

function parseLineItems(notes: string | null): ParsedLineItem[] {
  if (!notes) return [];
  
  const items: ParsedLineItem[] = [];
  const lines = notes.split('\n');
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Pattern 1: "Item Name (x2) - $5.99" (count-based items)
    const countMatch = trimmedLine.match(/^(.+?)\s*\(x(\d+(?:\.\d+)?)\)\s*-\s*\$?([\d.]+)/i);
    if (countMatch) {
      const [, name, qty, price] = countMatch;
      const cleanName = cleanItemName(name);
      const category = categorizeItem(cleanName);
      items.push({
        name: name.trim(),
        cleanName,
        itemCategory: ITEM_CATEGORY_LABELS[category],
        quantity: parseFloat(qty) || 1,
        unit: 'ea',
        price: parseFloat(price) || 0,
      });
      return;
    }
    
    // Pattern 2: "Item Name (1.5 kg) - $3.50" (weight/volume-based items)
    const weightMatch = trimmedLine.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\s*(kg|g|lb|oz|L|ml|ea|each|pc|pcs)\)\s*-\s*\$?([\d.]+)/i);
    if (weightMatch) {
      const [, name, qty, unit, price] = weightMatch;
      const cleanName = cleanItemName(name);
      const category = categorizeItem(cleanName);
      items.push({
        name: name.trim(),
        cleanName,
        itemCategory: ITEM_CATEGORY_LABELS[category],
        quantity: parseFloat(qty) || 1,
        unit: unit.toLowerCase(),
        price: parseFloat(price) || 0,
      });
      return;
    }
    
    // Pattern 3: Simple "Item Name - $5.99" format (single item, no quantity shown)
    const simpleMatch = trimmedLine.match(/^(.+?)\s*-\s*\$?([\d.]+)$/);
    if (simpleMatch) {
      const [, name, price] = simpleMatch;
      const cleanName = cleanItemName(name);
      const category = categorizeItem(cleanName);
      items.push({
        name: name.trim(),
        cleanName,
        itemCategory: ITEM_CATEGORY_LABELS[category],
        quantity: 1,
        unit: 'ea',
        price: parseFloat(price) || 0,
      });
      return;
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

  // Add header row with Category column
  worksheet.addRow(['Date', 'Store', 'Item Name', 'Category', 'Quantity', 'Unit', 'Unit Price', 'Total']);
  
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
      // Add each line item as a separate row with clean name and category
      lineItems.forEach(item => {
        worksheet.addRow([
          formattedDate,
          store,
          item.cleanName,
          item.itemCategory,
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
      const itemName = expense.notes || expense.category || 'Uncategorized';
      const cleanName = cleanItemName(itemName);
      const itemCat = categorizeItem(cleanName);
      worksheet.addRow([
        formattedDate,
        store,
        cleanName,
        ITEM_CATEGORY_LABELS[itemCat],
        1,
        'ea',
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
  worksheet.getColumn(4).width = 18;
  worksheet.getColumn(5).width = 10;
  worksheet.getColumn(6).width = 8;
  worksheet.getColumn(7).width = 12;
  worksheet.getColumn(8).width = 12;

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}_Elaborate.xlsx`);
}
