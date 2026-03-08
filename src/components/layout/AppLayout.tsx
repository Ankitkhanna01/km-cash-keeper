import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <main className="pb-20 px-3 sm:px-4 pt-4 sm:pt-6 max-w-lg mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
