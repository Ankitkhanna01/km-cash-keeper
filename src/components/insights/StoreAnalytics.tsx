import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useMemo } from 'react';
import { Store, TrendingUp, Hash } from 'lucide-react';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface StoreAnalyticsProps {
  expenses: Expense[];
}

export function StoreAnalytics({ expenses }: StoreAnalyticsProps) {
  const storeData = useMemo(() => {
    const grouped: Record<string, { amount: number; count: number; lastVisit: string }> = {};

    expenses.forEach(exp => {
      const key = exp.vendor_name.trim();
      if (!grouped[key]) {
        grouped[key] = { amount: 0, count: 0, lastVisit: exp.date };
      }
      grouped[key].amount += exp.amount;
      grouped[key].count += 1;
      if (exp.date > grouped[key].lastVisit) {
        grouped[key].lastVisit = exp.date;
      }
    });

    const stores = Object.entries(grouped)
      .map(([name, data]) => ({ name, ...data, avgSpend: data.amount / data.count }))
      .sort((a, b) => b.amount - a.amount);

    const maxAmount = Math.max(...stores.map(s => s.amount), 1);
    const maxVisits = Math.max(...stores.map(s => s.count), 1);

    return { stores, maxAmount, maxVisits };
  }, [expenses]);

  if (storeData.stores.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="p-6 text-center">
          <Store className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No store data yet</p>
          <p className="text-sm text-muted-foreground">Add expenses to see store analytics</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Store className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Store Analytics</h3>
        </div>

        {/* Top stores by spending */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top Stores by Spending
            </p>
            <div className="space-y-3">
              {storeData.stores.slice(0, 5).map((store, index) => (
                <div key={store.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">
                        #{index + 1}
                      </span>
                      <span className="text-sm font-medium truncate max-w-[150px]">
                        {store.name}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      ${store.amount.toFixed(0)}
                    </span>
                  </div>
                  <Progress 
                    value={(store.amount / storeData.maxAmount) * 100} 
                    className="h-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{store.count} visits</span>
                    <span>Avg ${store.avgSpend.toFixed(0)}/visit</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Most frequent stores */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Most Visited Stores
            </p>
            <div className="space-y-2">
              {storeData.stores
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map((store, index) => (
                  <div key={store.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">
                        #{index + 1}
                      </span>
                      <span className="text-sm truncate max-w-[150px]">{store.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-accent-foreground">
                        {store.count}x
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (${store.amount.toFixed(0)})
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
