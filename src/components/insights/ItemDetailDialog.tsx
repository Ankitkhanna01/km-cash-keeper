import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDateForDisplay } from '@/lib/dateUtils';
import { Calendar, Store, Package, DollarSign, TrendingUp } from 'lucide-react';

interface ItemPurchase {
  store: string;
  date: string;
  quantity: number;
  unit: string;
  price: number;
}

interface ItemDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    name: string;
    categoryIcon: string;
    categoryLabel: string;
    totalQuantity: number;
    totalSpent: number;
    avgPrice: number;
    purchases: ItemPurchase[];
    stores: string[];
  } | null;
}

export function ItemDetailDialog({ open, onOpenChange, item }: ItemDetailProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const content = (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">{item.totalQuantity}x</p>
          <p className="text-xs text-muted-foreground">Total Bought</p>
        </div>
        <div className="bg-chart-2/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-chart-2">${item.totalSpent.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Total Spent</p>
        </div>
        <div className="bg-chart-3/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-chart-3">${item.avgPrice.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Avg Price</p>
        </div>
      </div>

      {/* Category & Stores */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Category:</span>
          <Badge variant="secondary">
            {item.categoryIcon} {item.categoryLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Store className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Stores:</span>
          {item.stores.map(store => (
            <Badge key={store} variant="outline" className="text-xs">
              {store}
            </Badge>
          ))}
        </div>
      </div>

      {/* Purchase History */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Purchase History ({item.purchases.length} purchases)
        </h4>
        <ScrollArea className="h-[200px]">
          <div className="space-y-2 pr-4">
            {item.purchases
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((purchase, index) => (
                <div
                  key={`${purchase.date}-${purchase.store}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">{purchase.store}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateForDisplay(purchase.date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">${purchase.price.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {purchase.quantity} {purchase.unit}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <span className="text-xl">{item.categoryIcon}</span>
              <span className="capitalize">{item.name}</span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{item.categoryIcon}</span>
            <span className="capitalize">{item.name}</span>
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
