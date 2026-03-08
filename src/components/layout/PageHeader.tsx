import { ReactNode } from 'react';
import { UserMenu } from './UserMenu';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  showUserMenu?: boolean;
}

export function PageHeader({ title, subtitle, action, showUserMenu = false }: PageHeaderProps) {
  return (
    <header className="mb-4 sm:mb-6">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {showUserMenu && <UserMenu />}
      </div>
      {action && (
        <div className="mt-3 flex flex-wrap gap-2">
          {action}
        </div>
      )}
    </header>
  );
}
