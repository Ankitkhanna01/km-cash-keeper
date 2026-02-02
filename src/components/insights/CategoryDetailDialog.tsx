import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { DollarSign, Package, Grid3X3 } from 'lucide-react';
import { ItemCategory } from '@/lib/itemCategorization';

interface CategoryItem {
  name: string;
  totalSpent: number;
  totalQuantity: number;
  icon: string;
}

interface CategoryDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: {
    category: ItemCategory;
    label: string;
    icon: string;
    totalItems: number;
    totalSpent: number;
    items: CategoryItem[];
  } | null;
}

export function CategoryDetailDialog({ open, onOpenChange, category }: CategoryDetailProps) {
  const isMobile = useIsMobile();

  if (!category) return null;

  const content = (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-primary">${category.totalSpent.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Total Spent</p>
        </div>
        <div className="bg-chart-2/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-chart-2">{category.totalItems}</p>
          <p className="text-xs text-muted-foreground">Items Purchased</p>
        </div>
      </div>

      {/* Items in this category */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Package className="w-4 h-4" />
          Items in this Category ({category.items.length})
        </h4>
        <ScrollArea className="h-[250px]">
          <div className="space-y-2 pr-4">
            {category.items
              .sort((a, b) => b.totalSpent - a.totalSpent)
              .map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground">#{index + 1}</span>
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium truncate max-w-[140px]">{item.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">${item.totalSpent.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{item.totalQuantity}x</p>
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
              <span className="text-xl">{category.icon}</span>
              <span>{category.label}</span>
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
            <span className="text-xl">{category.icon}</span>
            <span>{category.label}</span>
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
