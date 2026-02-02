import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';

interface ExpenseData {
  date: string;
  vendor_name: string;
  amount: number;
  category: string;
  notes: string | null;
}

/**
 * Short Excel Export - Simple format with Date, Store, Item columns
 * Groups items by date and store for easy reading
 */
export function generateShortExcel(expenses: ExpenseData[], year: number): void {
  const wb = XLSX.utils.book_new();

  // Filter expenses for the year and sort by date
  const yearExpenses = expenses
    .filter(e => e.date?.startsWith(year.toString()))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Create data rows - one item per row
  const data: (string | number)[][] = [
    ['Date', 'Store', 'Item']
  ];

  yearExpenses.forEach(expense => {
    const formattedDate = format(parseISO(expense.date), 'dd-MMM-yy');
    const store = expense.vendor_name || '';
    // Use notes as item description, or category if no notes
    const item = expense.notes || expense.category || '';
    
    data.push([formattedDate, store, item]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 },  // Date
    { wch: 20 },  // Store
    { wch: 40 },  // Item
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Expenses ${year}`);
  XLSX.writeFile(wb, `KM_Cash_Keeper_${year}_Short.xlsx`);
}

/**
 * Elaborate Excel Export - Detailed format with Date, Item, Quantity, Tax, Total
 * Includes more transaction details
 */
export function generateElaborateExcel(expenses: ExpenseData[], year: number): void {
  const wb = XLSX.utils.book_new();

  // Filter expenses for the year and sort by date
  const yearExpenses = expenses
    .filter(e => e.date?.startsWith(year.toString()))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Create data rows with detailed columns
  const data: (string | number)[][] = [
    ['Date', 'Store', 'Item Name', 'Description', 'Quantity', 'Unit Price', 'Total Tax', 'Total']
  ];

  yearExpenses.forEach(expense => {
    const formattedDate = format(parseISO(expense.date), 'dd/MM/yyyy');
    const store = expense.vendor_name || '';
    const itemName = expense.category || ''; // Category as item type
    const description = expense.notes || ''; // Notes as item description
    const quantity = 1; // Default quantity per transaction
    const unitPrice = expense.amount;
    const tax = 0; // Tax not tracked separately
    const total = expense.amount;
    
    data.push([
      formattedDate,
      store,
      itemName,
      description,
      quantity,
      Number(unitPrice.toFixed(2)),
      Number(tax.toFixed(2)),
      Number(total.toFixed(2))
    ]);
  });

  // Add totals row
  const totalAmount = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
  data.push([
    '',
    '',
    'TOTAL',
    '',
    yearExpenses.length,
    '',
    0,
    Number(totalAmount.toFixed(2))
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 },  // Date
    { wch: 25 },  // Store
    { wch: 20 },  // Item Name
    { wch: 40 },  // Description
    { wch: 10 },  // Quantity
    { wch: 12 },  // Unit Price
    { wch: 12 },  // Total Tax
    { wch: 12 },  // Total
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Expenses ${year}`);
  XLSX.writeFile(wb, `KM_Cash_Keeper_${year}_Elaborate.xlsx`);
}
