import { Badge } from '@/components/ui/badge';

interface AccountStatusBadgeProps {
  status: 'current' | 'overdue' | 'paid' | 'partial';
}

export function AccountStatusBadge({ status }: AccountStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'current':
        return {
          label: 'Al día',
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800'
        };
      case 'overdue':
        return {
          label: 'Vencida',
          variant: 'destructive' as const,
          className: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800'
        };
      case 'paid':
        return {
          label: 'Pagada',
          variant: 'secondary' as const,
          className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800'
        };
      case 'partial':
        return {
          label: 'Parcial',
          variant: 'outline' as const,
          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
        };
      default:
        return {
          label: 'Desconocido',
          variant: 'outline' as const,
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 border-gray-200 dark:border-gray-800'
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Badge 
      variant={config.variant}
      className={config.className}
    >
      {config.label}
    </Badge>
  );
}
