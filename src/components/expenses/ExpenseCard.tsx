import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Expense, EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_ICONS } from '@/types';
import { formatDateForDisplay } from '@/lib/dateUtils';
import { Trash2 } from 'lucide-react';

interface ExpenseCardProps {
  expense: Expense;
  onDelete?: (id: string) => void;
}

export function ExpenseCard({ expense, onDelete }: ExpenseCardProps) {
  return (
    <Card variant="default" className="animate-fade-in">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="text-2xl">
              {EXPENSE_CATEGORY_ICONS[expense.category]}
            </div>
            <div>
              <p className="font-semibold text-foreground">{expense.vendorName}</p>
              <p className="text-xs text-muted-foreground">
                {EXPENSE_CATEGORY_LABELS[expense.category]}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDateForDisplay(expense.date)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <p className="text-lg font-bold text-primary">
              ${expense.amount.toFixed(2)}
            </p>
            {onDelete && (
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => onDelete(expense.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        {expense.notes && (
          <p className="text-sm text-muted-foreground mt-2 pl-10">
            {expense.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
