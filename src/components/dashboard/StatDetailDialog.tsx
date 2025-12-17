import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ReactNode } from 'react';

interface StatDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function StatDetailDialog({ open, onOpenChange, title, children }: StatDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          {children}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface FilterTabsProps {
  children: ReactNode;
  defaultValue?: string;
}

export function FilterTabs({ children, defaultValue = "daily" }: FilterTabsProps) {
  return (
    <Tabs defaultValue={defaultValue} className="w-full">
      <TabsList className="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="daily">Daily</TabsTrigger>
        <TabsTrigger value="monthly">Monthly</TabsTrigger>
        <TabsTrigger value="yearly">Yearly</TabsTrigger>
      </TabsList>
      {children}
    </Tabs>
  );
}

export { TabsContent };
