import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { AddExpenseDialog } from '@/components/expenses/AddExpenseDialog';
import { CategorySummary } from '@/components/expenses/CategorySummary';
import { useExpenses } from '@/hooks/useExpenses';
import { toast } from 'sonner';

export default function Expenses() {
  const { expenses, addExpense, deleteExpense, getTotalByCategory } = useExpenses();

  const currentYear = new Date().getFullYear();
  const yearExpenses = expenses.filter(
    (e) => new Date(e.date).getFullYear() === currentYear
  );
  const categoryTotals = getTotalByCategory(currentYear);

  const handleAddExpense = (expenseData: Parameters<typeof addExpense>[0]) => {
    addExpense(expenseData);
    toast.success('Expense added successfully');
  };

  const handleDelete = (id: string) => {
    deleteExpense(id);
    toast.success('Expense deleted');
  };

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
              expense={expense}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </AppLayout>
  );
}
