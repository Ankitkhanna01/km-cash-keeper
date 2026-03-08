export interface Trip {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  kilometres: number;
  category: 'business' | 'personal' | 'uncategorized';
  createdAt: string;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  vendorName: string;
  amount: number;
  category: ExpenseCategory;
  receiptImage?: string;
  notes?: string;
  createdAt: string;
}

export type ExpenseCategory = 
  | 'fuel'
  | 'repairs'
  | 'insurance'
  | 'licence'
  | 'interest'
  | 'other';

export type ExpensePurpose = 'business' | 'personal' | 'mixed';

export const EXPENSE_PURPOSE_LABELS: Record<ExpensePurpose, string> = {
  business: 'Business',
  personal: 'Personal',
  mixed: 'Mixed',
};

export const EXPENSE_PURPOSE_COLORS: Record<ExpensePurpose, string> = {
  business: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
  personal: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400',
  mixed: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Fuel',
  repairs: 'Repairs & Maintenance',
  insurance: 'Insurance',
  licence: 'Licence & Registration',
  interest: 'Interest/Leasing',
  other: 'Other',
};

export const EXPENSE_CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  fuel: '⛽',
  repairs: '🔧',
  insurance: '🛡️',
  licence: '📋',
  interest: '💳',
  other: '📦',
};

export interface TaxReport {
  year: number;
  totalKilometres: number;
  businessKilometres: number;
  personalKilometres: number;
  businessUsePercentage: number;
  expenses: {
    fuel: number;
    repairs: number;
    insurance: number;
    licence: number;
    interest: number;
    other: number;
    total: number;
  };
  deductibleAmount: number;
}
