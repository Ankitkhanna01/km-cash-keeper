import { Card, CardContent } from '@/components/ui/card';
import { useState, useMemo } from 'react';
import { Package, Scale, DollarSign, ChevronRight, Grid3X3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ItemDetailDialog } from './ItemDetailDialog';
import { CategoryDetailDialog } from './CategoryDetailDialog';
import { 
  parseAndCategorizeItems, 
  ItemCategory,
  ITEM_CATEGORY_LABELS,
  ITEM_CATEGORY_ICONS,
  normalizeNameForComparison,
  getBestDisplayName,
} from '@/lib/itemCategorization';

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor_name: string;
  category: string;
  notes: string | null;
}

interface ItemPurchase {
  store: string;
  date: string;
  quantity: number;
  unit: string;
  price: number;
}

interface ItemPatternData {
  name: string;
  cleanName: string;
  category: ItemCategory;
  categoryLabel: string;
  categoryIcon: string;
  totalQuantity: number;
  totalSpent: number;
  avgPrice: number;
  stores: string[];
  purchases: ItemPurchase[];
}

interface CategoryItem {
  name: string;
  totalSpent: number;
  totalQuantity: number;
  icon: string;
}

interface CategorySummary {
  category: ItemCategory;
  label: string;
  icon: string;
  totalItems: number;
  totalSpent: number;
  items: CategoryItem[];
}

interface ItemPatternsProps {
  expenses: Expense[];
}

export function ItemPatterns({ expenses }: ItemPatternsProps) {
  const [selectedItem, setSelectedItem] = useState<ItemPatternData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const { itemData, categorySummary } = useMemo(() => {
    // Use normalized keys to merge similar names
    const items: Record<string, ItemPatternData & { rawNames: string[] }> = {};
    const categoryTotals: Record<ItemCategory, CategorySummary> = {} as Record<ItemCategory, CategorySummary>;

    expenses.forEach(exp => {
      if (!exp.notes) return;

      const parsedItems = parseAndCategorizeItems(exp.notes, exp.vendor_name, exp.date);
      
      parsedItems.forEach(item => {
        // Normalize the key to merge variations like "THRIFTY FOOD" and "Thrifty Foods"
        const normalizedKey = normalizeNameForComparison(item.cleanName);
        
        if (!items[normalizedKey]) {
          items[normalizedKey] = {
            name: item.cleanName,
            cleanName: item.cleanName,
            rawNames: [item.cleanName],
            category: item.category,
            categoryLabel: item.categoryLabel,
            categoryIcon: item.categoryIcon,
            totalQuantity: 0,
            totalSpent: 0,
            avgPrice: 0,
            stores: [],
            purchases: [],
          };
        } else {
          // Collect all name variations
          if (!items[normalizedKey].rawNames.includes(item.cleanName)) {
            items[normalizedKey].rawNames.push(item.cleanName);
          }
        }
        
        items[normalizedKey].totalQuantity += item.quantity;
        items[normalizedKey].totalSpent += item.price;
        items[normalizedKey].purchases.push({
          store: item.store,
          date: item.date,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
        });
        
        // Normalize store names too
        const normalizedStore = getBestDisplayName([item.store]);
        const existingStore = items[normalizedKey].stores.find(
          s => normalizeNameForComparison(s) === normalizeNameForComparison(item.store)
        );
        if (!existingStore) {
          items[normalizedKey].stores.push(normalizedStore);
        }

        // Build category summary
        if (!categoryTotals[item.category]) {
          categoryTotals[item.category] = {
            category: item.category,
            label: item.categoryLabel,
            icon: item.categoryIcon,
            totalItems: 0,
            totalSpent: 0,
            items: [],
          };
        }
        categoryTotals[item.category].totalItems += item.quantity;
        categoryTotals[item.category].totalSpent += item.price;
      });
    });

    // Finalize items - pick best display name and calculate averages
    Object.values(items).forEach(item => {
      item.cleanName = getBestDisplayName(item.rawNames);
      item.name = item.cleanName;
      item.avgPrice = item.totalSpent / item.purchases.length;
    });

    // Build category items list
    Object.values(items).forEach(item => {
      const cat = categoryTotals[item.category];
      if (cat) {
        const existingItem = cat.items.find(
          i => normalizeNameForComparison(i.name) === normalizeNameForComparison(item.cleanName)
        );
        if (!existingItem) {
          cat.items.push({
            name: item.cleanName,
            totalSpent: item.totalSpent,
            totalQuantity: item.totalQuantity,
            icon: item.categoryIcon,
          });
        }
      }
    });

    const sortedItems = Object.values(items).sort((a, b) => b.totalSpent - a.totalSpent);
    const sortedCategories = Object.values(categoryTotals).sort((a, b) => b.totalSpent - a.totalSpent);

    return { 
      itemData: sortedItems, 
      categorySummary: sortedCategories 
    };
  }, [expenses]);

  const handleItemClick = (item: ItemPatternData) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const handleCategoryClick = (category: CategorySummary) => {
    setSelectedCategory(category);
    setCategoryDialogOpen(true);
  };

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
    <>
      <Card variant="elevated">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">What You Buy Most</h3>
          </div>

          <Tabs defaultValue="items" className="w-full">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="items" className="flex-1">
                <Package className="w-4 h-4 mr-1" />
                Items
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex-1">
                <Grid3X3 className="w-4 h-4 mr-1" />
                Categories
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-4">
              {/* Most purchased items */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  Most Purchased Items
                </p>
                <div className="space-y-2">
                  {topByQuantity.map((item, index) => (
                    <button
                      key={item.name}
                      onClick={() => handleItemClick(item)}
                      className="w-full flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                          <span className="text-lg">{item.categoryIcon}</span>
                          <span className="text-sm font-medium truncate max-w-[140px]">
                            {item.cleanName}
                          </span>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap pl-6">
                          <Badge variant="secondary" className="text-xs">
                            {item.categoryLabel}
                          </Badge>
                          {item.stores.slice(0, 1).map(store => (
                            <Badge key={store} variant="outline" className="text-xs">
                              {store}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{item.totalQuantity}x</p>
                          <p className="text-xs text-muted-foreground">
                            ${item.totalSpent.toFixed(2)}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
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
                    <button
                      key={item.name}
                      onClick={() => handleItemClick(item)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                        <span className="text-lg">{item.categoryIcon}</span>
                        <span className="text-sm truncate max-w-[120px]">{item.cleanName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="text-sm font-bold text-primary">
                            ${item.totalSpent.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({item.totalQuantity}x)
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="categories" className="space-y-3">
              <p className="text-sm text-muted-foreground mb-2">
                Tap a category to see all items inside
              </p>
              {categorySummary.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => handleCategoryClick(cat)}
                  className="w-full flex items-start justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{cat.icon}</span>
                      <span className="text-sm font-medium">{cat.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 pl-7">
                      {cat.items.slice(0, 3).map(i => i.name).join(', ')}
                      {cat.items.length > 3 && ` +${cat.items.length - 3} more`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-primary">${cat.totalSpent.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{cat.totalItems} items</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ItemDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={selectedItem}
      />

      <CategoryDetailDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={selectedCategory}
      />
    </>
  );
}
