import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { AddExpenseDialog } from '@/components/expenses/AddExpenseDialog';
import { CategorySummary } from '@/components/expenses/CategorySummary';
import { StatementReconciliation } from '@/components/expenses/StatementReconciliation';
import { ExpenseReviewInbox } from '@/components/expenses/ExpenseReviewInbox';
import { useExpensesDB, Expense } from '@/hooks/useExpensesDB';
import { useExpenseReviews } from '@/hooks/useExpenseReviews';
import { parseLocalDate } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Expenses() {
  const { expenses, loading, addExpense, deleteExpense, getTotalByCategory, refetch } = useExpensesDB();
  const { analyzeExpenses } = useExpenseReviews();

  const currentYear = new Date().getFullYear();
  const yearExpenses = expenses.filter(
    (e) => parseLocalDate(e.date).getFullYear() === currentYear
  );
  const categoryTotals = getTotalByCategory(currentYear);

  const handleAddExpense = async (expenseData: {
    date: string;
    vendor_name: string;
    amount: number;
    category: Expense['category'];
    notes: string | null;
    receipt_url: string | null;
  }) => {
    const result = await addExpense(expenseData);
    if (result) {
      toast.success('Expense added successfully');
    }
    return result;
  };

  const handleDelete = async (id: string) => {
    await deleteExpense(id);
    toast.success('Expense deleted');
  };

  // After bulk-adding from statement, run background analysis
  const handleBulkAdded = async (newExpenseIds: string[]) => {
    // Small delay to let DB settle
    await new Promise(r => setTimeout(r, 1000));
    await refetch();
    
    // Re-fetch to get updated list including new expenses
    const { data: allExpenses } = await (await import('@/integrations/supabase/client')).supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (allExpenses) {
      const mapped = allExpenses.map(e => ({
        ...e,
        amount: Number(e.amount),
        category: e.category as Expense['category']
      }));
      const flagCount = await analyzeExpenses(newExpenseIds, mapped);
      if (flagCount && flagCount > 0) {
        toast.info(`Found ${flagCount} issue${flagCount > 1 ? 's' : ''} to review`, {
          description: 'Tap "Review" to see flagged expenses',
          duration: 5000,
        });
      }
    }
  };

  // Map DB expense to component format
  const mapExpenseForCard = (expense: Expense) => ({
    id: expense.id,
    date: expense.date,
    vendorName: expense.vendor_name,
    amount: expense.amount,
    category: expense.category,
    notes: expense.notes || undefined,
    createdAt: expense.created_at,
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Expenses"
        subtitle="T2125 Categories"
        action={
          <div className="flex gap-2 items-center">
            <ExpenseReviewInbox onExpenseDeleted={refetch} />
            <StatementReconciliation 
              expenses={expenses} 
              onAddExpense={handleAddExpense}
              onBulkAdded={handleBulkAdded}
            />
            <AddExpenseDialog 
              onAdd={handleAddExpense} 
              existingExpenses={expenses.map(e => ({
                vendor_name: e.vendor_name,
                date: e.date,
                amount: e.amount
              }))}
            />
          </div>
        }
      />

      <CategorySummary totals={categoryTotals} className="mb-6" />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Expenses
        </h3>
        {yearExpenses.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No expenses recorded</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap + to add your first expense
            </p>
          </div>
        ) : (
          yearExpenses.map((expense) => (
            <ExpenseCard
              key={expense.id}
              expense={mapExpenseForCard(expense)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </AppLayout>
  );
}
