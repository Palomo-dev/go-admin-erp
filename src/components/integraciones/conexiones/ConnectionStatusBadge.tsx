'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import {
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  XCircle,
  FileEdit,
} from 'lucide-react';

export type ConnectionStatus = 'draft' | 'connected' | 'paused' | 'error' | 'revoked';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const statusConfig: Record<
  ConnectionStatus,
  {
    label: string;
    icon: React.ElementType;
    className: string;
  }
> = {
  draft: {
    label: 'Borrador',
    icon: FileEdit,
    className:
      'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
  },
  connected: {
    label: 'Conectado',
    icon: CheckCircle2,
    className:
      'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  },
  paused: {
    label: 'Pausado',
    icon: PauseCircle,
    className:
      'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  },
  error: {
    label: 'Error',
    icon: AlertCircle,
    className:
      'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  },
  revoked: {
    label: 'Revocado',
    icon: XCircle,
    className:
      'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700',
  },
};

export function ConnectionStatusBadge({
  status,
  showIcon = true,
  size = 'md',
}: ConnectionStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        config.className
      )}
    >
      {showIcon && (
        <Icon className={cn('mr-1', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      )}
      {config.label}
    </Badge>
  );
}

export default ConnectionStatusBadge;
