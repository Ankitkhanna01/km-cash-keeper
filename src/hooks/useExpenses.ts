import { useLocalStorage } from './useLocalStorage';
import { Expense, ExpenseCategory } from '@/types';
import { parseLocalDate } from '@/lib/dateUtils';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export function useExpenses() {
  const [expenses, setExpenses] = useLocalStorage<Expense[]>('driverTax_expenses', []);

  const addExpense = (expenseData: Omit<Expense, 'id' | 'createdAt'>) => {
    const newExpense: Expense = {
      ...expenseData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [newExpense, ...prev]);
    return newExpense;
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses((prev) =>
      prev.map((expense) => (expense.id === id ? { ...expense, ...updates } : expense))
    );
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((expense) => expense.id !== id));
  };

  const getExpensesByYear = (year: number) => {
    return expenses.filter((expense) => parseLocalDate(expense.date).getFullYear() === year);
  };

  const getExpensesByCategory = (category: ExpenseCategory, year?: number) => {
    const filtered = year ? getExpensesByYear(year) : expenses;
    return filtered.filter((expense) => expense.category === category);
  };

  const getTotalByCategory = (year?: number) => {
    const filtered = year ? getExpensesByYear(year) : expenses;
    return {
      fuel: filtered.filter((e) => e.category === 'fuel').reduce((sum, e) => sum + e.amount, 0),
      repairs: filtered.filter((e) => e.category === 'repairs').reduce((sum, e) => sum + e.amount, 0),
      insurance: filtered.filter((e) => e.category === 'insurance').reduce((sum, e) => sum + e.amount, 0),
      licence: filtered.filter((e) => e.category === 'licence').reduce((sum, e) => sum + e.amount, 0),
      interest: filtered.filter((e) => e.category === 'interest').reduce((sum, e) => sum + e.amount, 0),
      other: filtered.filter((e) => e.category === 'other').reduce((sum, e) => sum + e.amount, 0),
    };
  };

  const getStats = (year?: number) => {
    const filtered = year ? getExpensesByYear(year) : expenses;
    const totals = getTotalByCategory(year);
    const total = Object.values(totals).reduce((sum, val) => sum + val, 0);

    return {
      totalExpenses: filtered.length,
      totalAmount: total,
      byCategory: totals,
    };
  };

  return {
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpensesByYear,
    getExpensesByCategory,
    getTotalByCategory,
    getStats,
  };
}
