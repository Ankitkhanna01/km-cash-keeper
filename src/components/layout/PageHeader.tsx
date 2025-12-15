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
    <header className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {action && <div>{action}</div>}
        {showUserMenu && <UserMenu />}
      </div>
    </header>
  );
}
