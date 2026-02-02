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

/**
 * Elaborate Excel Export - Detailed format with Date, Item, Quantity, Tax, Total
 * Includes more transaction details
 */
export async function generateElaborateExcel(expenses: ExpenseData[], year: number): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Expenses ${year}`);

  // Filter expenses for the year and sort by date
  const yearExpenses = expenses
    .filter(e => e.date?.startsWith(year.toString()))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Add header row
  worksheet.addRow(['Date', 'Store', 'Item Name', 'Description', 'Quantity', 'Unit Price', 'Total Tax', 'Total']);
  
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
    const formattedDate = format(parseISO(expense.date), 'dd/MM/yyyy');
    const store = expense.vendor_name || '';
    const itemName = expense.category || '';
    const description = expense.notes || '';
    const quantity = 1;
    const unitPrice = expense.amount;
    const tax = 0;
    const total = expense.amount;
    
    worksheet.addRow([
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
  const totalsRow = worksheet.addRow([
    '',
    '',
    'TOTAL',
    '',
    yearExpenses.length,
    '',
    0,
    Number(totalAmount.toFixed(2))
  ]);
  totalsRow.font = { bold: true };

  // Set column widths
  worksheet.getColumn(1).width = 12;
  worksheet.getColumn(2).width = 25;
  worksheet.getColumn(3).width = 20;
  worksheet.getColumn(4).width = 40;
  worksheet.getColumn(5).width = 10;
  worksheet.getColumn(6).width = 12;
  worksheet.getColumn(7).width = 12;
  worksheet.getColumn(8).width = 12;

  await saveWorkbook(workbook, `KM_Cash_Keeper_${year}_Elaborate.xlsx`);
}
