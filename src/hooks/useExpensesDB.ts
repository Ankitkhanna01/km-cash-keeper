import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ExpenseCategory } from '@/types';

export interface Expense {
  id: string;
  user_id: string;
  date: string;
  vendor_name: string;
  amount: number;
  category: ExpenseCategory;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

export function useExpensesDB() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setExpenses(data?.map(e => ({
        ...e,
        amount: Number(e.amount),
        category: e.category as ExpenseCategory
      })) || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [user]);

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          date: expenseData.date,
          vendor_name: expenseData.vendor_name,
          amount: expenseData.amount,
          category: expenseData.category,
          notes: expenseData.notes,
          receipt_url: expenseData.receipt_url,
        })
        .select()
        .single();

      if (error) throw error;
      
      const newExpense = {
        ...data,
        amount: Number(data.amount),
        category: data.category as ExpenseCategory
      };
      
      setExpenses(prev => [newExpense, ...prev]);
      return newExpense;
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Failed to add expense');
      return null;
    }
  };

  const updateExpense = async (id: string, updates: Partial<Expense>) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      setExpenses(prev =>
        prev.map(expense => (expense.id === id ? { ...expense, ...updates } : expense))
      );
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Failed to update expense');
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setExpenses(prev => prev.filter(expense => expense.id !== id));
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  };

  const getExpensesByYear = (year: number) => {
    return expenses.filter(expense => new Date(expense.date).getFullYear() === year);
  };

  const getTotalByCategory = (year?: number) => {
    const filtered = year ? getExpensesByYear(year) : expenses;
    return {
      fuel: filtered.filter(e => e.category === 'fuel').reduce((sum, e) => sum + e.amount, 0),
      repairs: filtered.filter(e => e.category === 'repairs').reduce((sum, e) => sum + e.amount, 0),
      insurance: filtered.filter(e => e.category === 'insurance').reduce((sum, e) => sum + e.amount, 0),
      licence: filtered.filter(e => e.category === 'licence').reduce((sum, e) => sum + e.amount, 0),
      interest: filtered.filter(e => e.category === 'interest').reduce((sum, e) => sum + e.amount, 0),
      other: filtered.filter(e => e.category === 'other').reduce((sum, e) => sum + e.amount, 0),
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
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    getExpensesByYear,
    getTotalByCategory,
    getStats,
    refetch: fetchExpenses,
  };
}
