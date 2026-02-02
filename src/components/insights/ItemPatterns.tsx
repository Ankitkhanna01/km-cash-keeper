import { Card, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { Package, Scale, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface ParsedItem {
  name: string;
  quantity: number;
  price: number;
  store: string;
}

interface ItemPatternData {
  name: string;
  totalQuantity: number;
  totalSpent: number;
  avgPrice: number;
  stores: string[];
  purchases: number;
}

interface ItemPatternsProps {
  expenses: Expense[];
}

export function ItemPatterns({ expenses }: ItemPatternsProps) {
  const itemData = useMemo(() => {
    const items: Record<string, ItemPatternData> = {};

    expenses.forEach(exp => {
      if (!exp.notes) return;

      // Parse items from notes format: "Item Name (x2) - $5.99"
      const lines = exp.notes.split('\n');
      lines.forEach(line => {
        const match = line.match(/^(.+?)\s*\(x(\d+)\)\s*-\s*\$?([\d.]+)/i);
        if (match) {
          const [, name, qty, price] = match;
          const cleanName = name.trim().toLowerCase();
          
          if (!items[cleanName]) {
            items[cleanName] = {
              name: name.trim(),
              totalQuantity: 0,
              totalSpent: 0,
              avgPrice: 0,
              stores: [],
              purchases: 0,
            };
          }
          
          items[cleanName].totalQuantity += parseInt(qty);
          items[cleanName].totalSpent += parseFloat(price);
          items[cleanName].purchases += 1;
          if (!items[cleanName].stores.includes(exp.vendor_name)) {
            items[cleanName].stores.push(exp.vendor_name);
          }
        }
      });
    });

    // Calculate averages
    Object.values(items).forEach(item => {
      item.avgPrice = item.totalSpent / item.purchases;
    });

    return Object.values(items).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [expenses]);

  if (itemData.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="p-6 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No item data yet</p>
          <p className="text-sm text-muted-foreground">
            Scan receipts to see what you buy most
          </p>
        </CardContent>
      </Card>
    );
  }

  // Top items by quantity
  const topByQuantity = [...itemData].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);
  // Top items by spending
  const topBySpending = itemData.slice(0, 5);

  return (
    <Card variant="elevated">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">What You Buy Most</h3>
        </div>

        <div className="space-y-4">
          {/* Most purchased items */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Most Purchased Items
            </p>
            <div className="space-y-3">
              {topByQuantity.map((item, index) => (
                <div key={item.name} className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                      <span className="text-sm font-medium capitalize truncate max-w-[180px]">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {item.stores.slice(0, 2).map(store => (
                        <Badge key={store} variant="secondary" className="text-xs">
                          {store}
                        </Badge>
                      ))}
                      {item.stores.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{item.stores.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{item.totalQuantity}x</p>
                    <p className="text-xs text-muted-foreground">
                      ${item.totalSpent.toFixed(2)} total
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Most spent on items */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Highest Spending Items
            </p>
            <div className="space-y-2">
              {topBySpending.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                    <span className="text-sm capitalize truncate max-w-[150px]">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-primary">
                      ${item.totalSpent.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({item.totalQuantity}x)
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
