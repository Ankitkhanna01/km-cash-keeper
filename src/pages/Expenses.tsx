import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { AddExpenseDialog } from '@/components/expenses/AddExpenseDialog';
import { CategorySummary } from '@/components/expenses/CategorySummary';
import { useExpensesDB, Expense } from '@/hooks/useExpensesDB';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Expenses() {
  const { expenses, loading, addExpense, deleteExpense, getTotalByCategory } = useExpensesDB();

  const currentYear = new Date().getFullYear();
  const yearExpenses = expenses.filter(
    (e) => new Date(e.date).getFullYear() === currentYear
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
  };

  const handleDelete = async (id: string) => {
    await deleteExpense(id);
    toast.success('Expense deleted');
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
        action={<AddExpenseDialog onAdd={handleAddExpense} />}
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
