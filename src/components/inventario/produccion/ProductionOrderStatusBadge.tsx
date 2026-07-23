'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock, Play, CheckCircle, XCircle } from 'lucide-react';
import type { ProductionOrderStatus } from '@/lib/services/productionOrderService';

interface StatusConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
}

const STATUS_CONFIG: Record<ProductionOrderStatus, StatusConfig> = {
  draft: { label: 'Borrador', color: 'secondary', icon: <FileText className="h-3 w-3" /> },
  confirmed: { label: 'Confirmada', color: 'default', icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: 'En proceso', color: 'default', icon: <Play className="h-3 w-3" /> },
  completed: { label: 'Completada', color: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelada', color: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export const STATUS_LABELS = STATUS_CONFIG;

interface ProductionOrderStatusBadgeProps {
  status: ProductionOrderStatus;
}

export function ProductionOrderStatusBadge({ status }: ProductionOrderStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant={config.color as 'default' | 'secondary' | 'destructive' | 'outline'}
      className={
        status === 'completed'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100'
          : status === 'in_progress'
          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100'
          : status === 'cancelled'
          ? ''
          : ''
      }
    >
      <span className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </span>
    </Badge>
  );
}
