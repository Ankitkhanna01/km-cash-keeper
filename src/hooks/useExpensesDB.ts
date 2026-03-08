import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ExpenseCategory, ExpensePurpose } from '@/types';
import { parseLocalDate } from '@/lib/dateUtils';

export interface Expense {
  id: string;
  user_id: string;
  date: string;
  vendor_name: string;
  amount: number;
  category: ExpenseCategory;
  notes: string | null;
  receipt_url: string | null;
  card_last4: string | null;
  purpose: ExpensePurpose;
  created_at: string;
  deleted_at?: string | null;
}

const mapExpense = (e: any): Expense => ({
  ...e,
  amount: Number(e.amount),
  category: e.category as ExpenseCategory,
  purpose: (e.purpose || 'business') as ExpensePurpose,
});

export function useExpensesDB() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [trashedExpenses, setTrashedExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data?.map(mapExpense) || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrashed = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      setTrashedExpenses(data?.map(mapExpense) || []);
    } catch (error) {
      console.error('Error fetching trashed expenses:', error);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [user]);

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'deleted_at'>) => {
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
          card_last4: expenseData.card_last4 || null,
        })
        .select()
        .single();

      if (error) throw error;
      
      const newExpense = mapExpense(data);
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

  // Soft-delete: set deleted_at timestamp
  const deleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      setExpenses(prev => prev.filter(expense => expense.id !== id));
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense');
    }
  };

  // Restore from trash
  const restoreExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: null })
        .eq('id', id);

      if (error) throw error;

      const restored = trashedExpenses.find(e => e.id === id);
      if (restored) {
        setTrashedExpenses(prev => prev.filter(e => e.id !== id));
        setExpenses(prev => [{ ...restored, deleted_at: null }, ...prev]);
      }
      return true;
    } catch (error) {
      console.error('Error restoring expense:', error);
      toast.error('Failed to restore expense');
      return false;
    }
  };

  // Permanent delete
  const permanentlyDeleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTrashedExpenses(prev => prev.filter(e => e.id !== id));
      return true;
    } catch (error) {
      console.error('Error permanently deleting expense:', error);
      toast.error('Failed to permanently delete expense');
      return false;
    }
  };

  const emptyTrash = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .not('deleted_at', 'is', null);

      if (error) throw error;
      setTrashedExpenses([]);
    } catch (error) {
      console.error('Error emptying trash:', error);
      toast.error('Failed to empty trash');
    }
  };

  const getExpensesByYear = (year: number) => {
    return expenses.filter(expense => parseLocalDate(expense.date).getFullYear() === year);
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
    trashedExpenses,
    loading,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    permanentlyDeleteExpense,
    emptyTrash,
    fetchTrashed,
    getExpensesByYear,
    getTotalByCategory,
    getStats,
    refetch: fetchExpenses,
  };
}
