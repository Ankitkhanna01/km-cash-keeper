import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/hooks/useExpensesDB';

export interface ExpenseReview {
  id: string;
  user_id: string;
  expense_id: string | null;
  review_type: string;
  severity: string;
  message: string;
  details: string | null;
  related_expense_id: string | null;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export function useExpenseReviews() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ExpenseReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('expense_reviews')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReviews((data as ExpenseReview[]) || []);
    } catch (e) {
      console.error('Error fetching reviews:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const resolveReview = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expense_reviews')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setReviews(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error('Error resolving review:', e);
    }
  };

  const resolveAll = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('expense_reviews')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_resolved', false);
      if (error) throw error;
      setReviews([]);
    } catch (e) {
      console.error('Error resolving all reviews:', e);
    }
  };

  const deleteExpenseAndReviews = async (expenseId: string) => {
    try {
      // Reviews cascade-delete with the expense
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);
      if (error) throw error;
      setReviews(prev => prev.filter(r => r.expense_id !== expenseId));
      return true;
    } catch (e) {
      console.error('Error deleting expense:', e);
      return false;
    }
  };

  // Background analysis: detect duplicates and issues after bulk-adding
  const analyzeExpenses = async (newExpenseIds: string[], allExpenses: Expense[]) => {
    if (!user || newExpenseIds.length === 0) return;

    const newExpenses = allExpenses.filter(e => newExpenseIds.includes(e.id));
    const existingExpenses = allExpenses.filter(e => !newExpenseIds.includes(e.id));
    const reviewsToCreate: Omit<ExpenseReview, 'id' | 'created_at' | 'resolved_at' | 'updated_at'>[] = [];

    for (const newExp of newExpenses) {
      // 1. Check for duplicates (same vendor + date + amount within $0.50)
      // Card matching: if both have card_last4 and they match → high confidence
      // If both have card_last4 and they differ → NOT a duplicate (different cards)
      const duplicates = existingExpenses.filter(existing => {
        const sameDate = existing.date === newExp.date;
        const amountClose = Math.abs(existing.amount - newExp.amount) < 0.50;
        const nameA = newExp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameB = existing.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameMatch = nameA.includes(nameB) || nameB.includes(nameA);
        
        // Card-based filtering: if both have card info and they differ, skip
        if (newExp.card_last4 && existing.card_last4 && newExp.card_last4 !== existing.card_last4) {
          return false;
        }
        
        return sameDate && amountClose && nameMatch;
      });

      if (duplicates.length > 0) {
        const dup = duplicates[0];
        const receiptTag = dup.receipt_url ? ' 📎 has receipt' : '';
        const cardInfo = dup.card_last4 ? ` (card ****${dup.card_last4})` : '';
        const newCardInfo = newExp.card_last4 ? ` (card ****${newExp.card_last4})` : '';
        reviewsToCreate.push({
          user_id: user.id,
          expense_id: newExp.id,
          review_type: 'duplicate',
          severity: 'warning',
          message: `Statement "${newExp.vendor_name}" ($${newExp.amount.toFixed(2)} on ${newExp.date}${newCardInfo}) matches existing "${dup.vendor_name}" ($${dup.amount.toFixed(2)} on ${dup.date}${cardInfo})${receiptTag}`,
          details: `Statement: $${newExp.amount.toFixed(2)} on ${newExp.date}${newCardInfo} | Existing: $${dup.amount.toFixed(2)} on ${dup.date}${cardInfo} | Diff: $${Math.abs(newExp.amount - dup.amount).toFixed(2)}`,
          related_expense_id: dup.id,
          is_resolved: false,
        });
      }

      // 2. Check for receipt-backed match (same vendor+date but has receipt)
      const receiptMatches = existingExpenses.filter(existing => {
        if (!existing.receipt_url) return false;
        const daysDiff = Math.abs(new Date(existing.date).getTime() - new Date(newExp.date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 1) return false;
        // Skip if different cards
        if (newExp.card_last4 && existing.card_last4 && newExp.card_last4 !== existing.card_last4) return false;
        const nameA = newExp.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameB = existing.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return nameA.includes(nameB) || nameB.includes(nameA);
      });

      if (receiptMatches.length > 0 && duplicates.length === 0) {
        const rm = receiptMatches[0];
        const diff = Math.abs(newExp.amount - rm.amount);
        if (diff > 0.01) {
          reviewsToCreate.push({
            user_id: user.id,
            expense_id: newExp.id,
            review_type: 'receipt_match',
            severity: diff > rm.amount * 0.3 ? 'warning' : 'info',
            message: `Statement "${newExp.vendor_name}" ($${newExp.amount.toFixed(2)} on ${newExp.date}) vs receipt "${rm.vendor_name}" ($${rm.amount.toFixed(2)} on ${rm.date}) — $${diff.toFixed(2)} ${newExp.amount > rm.amount ? 'more (tip?)' : 'less'}`,
            details: `Statement: $${newExp.amount.toFixed(2)} on ${newExp.date} | Receipt: $${rm.amount.toFixed(2)} on ${rm.date} 📎`,
            related_expense_id: rm.id,
            is_resolved: false,
          });
        }
      }

      // 3. Check for unusual amounts (over $500)
      if (newExp.amount > 500) {
        reviewsToCreate.push({
          user_id: user.id,
          expense_id: newExp.id,
          review_type: 'amount_mismatch',
          severity: 'info',
          message: `Large expense: "${newExp.vendor_name}" for $${newExp.amount.toFixed(2)} — verify this is correct`,
          details: null,
          related_expense_id: null,
          is_resolved: false,
        });
      }

      // 4. Check for missing receipt on higher amounts
      if (newExp.amount > 75 && !newExp.receipt_url) {
        reviewsToCreate.push({
          user_id: user.id,
          expense_id: newExp.id,
          review_type: 'missing_receipt',
          severity: 'info',
          message: `"${newExp.vendor_name}" ($${newExp.amount.toFixed(2)}) — consider adding a receipt for CRA compliance`,
          details: null,
          related_expense_id: null,
          is_resolved: false,
        });
      }
    }

    // Also check new-to-new duplicates
    for (let i = 0; i < newExpenses.length; i++) {
      for (let j = i + 1; j < newExpenses.length; j++) {
        const a = newExpenses[i], b = newExpenses[j];
        if (a.date === b.date && Math.abs(a.amount - b.amount) < 0.50) {
          const nameA = a.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const nameB = b.vendor_name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (nameA.includes(nameB) || nameB.includes(nameA)) {
            reviewsToCreate.push({
              user_id: user.id,
              expense_id: b.id,
              review_type: 'duplicate',
              severity: 'warning',
              message: `Same-batch duplicate: "${a.vendor_name}" ($${a.amount.toFixed(2)} on ${a.date}) and "${b.vendor_name}" ($${b.amount.toFixed(2)} on ${b.date})`,
              details: `Entry 1: $${a.amount.toFixed(2)} on ${a.date} | Entry 2: $${b.amount.toFixed(2)} on ${b.date}`,
              related_expense_id: a.id,
              is_resolved: false,
            });
          }
        }
      }
    }

    if (reviewsToCreate.length > 0) {
      try {
        const { error } = await supabase
          .from('expense_reviews')
          .insert(reviewsToCreate);
        if (error) throw error;
        await fetchReviews();
        return reviewsToCreate.length;
      } catch (e) {
        console.error('Error creating reviews:', e);
        return 0;
      }
    }
    return 0;
  };

  return {
    reviews,
    loading,
    unresolvedCount: reviews.length,
    resolveReview,
    resolveAll,
    deleteExpenseAndReviews,
    analyzeExpenses,
    refetch: fetchReviews,
  };
}
