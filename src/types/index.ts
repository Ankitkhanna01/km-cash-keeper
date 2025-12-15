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
