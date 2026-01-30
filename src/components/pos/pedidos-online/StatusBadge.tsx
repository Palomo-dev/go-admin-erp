'use client';

import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChefHat, 
  Package, 
  Truck 
} from 'lucide-react';
import type { WebOrderStatus } from '@/lib/services/webOrdersService';

interface StatusBadgeProps {
  status: WebOrderStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const STATUS_CONFIG: Record<WebOrderStatus, { 
  label: string; 
  color: string; 
  icon: React.ReactNode 
}> = {
  pending: { 
    label: 'Pendiente', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', 
    icon: <Clock className="h-3 w-3" /> 
  },
  confirmed: { 
    label: 'Confirmado', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', 
    icon: <CheckCircle className="h-3 w-3" /> 
  },
  preparing: { 
    label: 'Preparando', 
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', 
    icon: <ChefHat className="h-3 w-3" /> 
  },
  ready: { 
    label: 'Listo', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', 
    icon: <Package className="h-3 w-3" /> 
  },
  in_delivery: { 
    label: 'En camino', 
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', 
    icon: <Truck className="h-3 w-3" /> 
  },
  delivered: { 
    label: 'Entregado', 
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', 
    icon: <CheckCircle className="h-3 w-3" /> 
  },
  cancelled: { 
    label: 'Cancelado', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', 
    icon: <XCircle className="h-3 w-3" /> 
  },
  rejected: { 
    label: 'Rechazado', 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', 
    icon: <XCircle className="h-3 w-3" /> 
  },
};

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1',
  };

  return (
    <Badge className={`${config.color} ${sizeClasses[size]} flex items-center gap-1`}>
      {showIcon && config.icon}
      {config.label}
    </Badge>
  );
}

export function getStatusLabel(status: WebOrderStatus): string {
  return STATUS_CONFIG[status].label;
}

export { STATUS_CONFIG };
