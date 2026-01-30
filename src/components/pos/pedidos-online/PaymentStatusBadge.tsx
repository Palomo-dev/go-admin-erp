'use client';

import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  RotateCcw, 
  XCircle 
} from 'lucide-react';
import type { PaymentStatus } from '@/lib/services/webOrdersService';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  showIcon?: boolean;
}

const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { 
  label: string; 
  color: string; 
  icon: React.ReactNode 
}> = {
  pending: { 
    label: 'Pago pendiente', 
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', 
    icon: <Clock className="h-3 w-3" /> 
  },
  paid: { 
    label: 'Pagado', 
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', 
    icon: <CheckCircle className="h-3 w-3" /> 
  },
  partial: { 
    label: 'Pago parcial', 
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', 
    icon: <AlertCircle className="h-3 w-3" /> 
  },
  refunded: { 
    label: 'Reembolsado', 
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', 
    icon: <RotateCcw className="h-3 w-3" /> 
  },
  failed: { 
    label: 'Fallido', 
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', 
    icon: <XCircle className="h-3 w-3" /> 
  },
};

export function PaymentStatusBadge({ status, showIcon = true }: PaymentStatusBadgeProps) {
  const config = PAYMENT_STATUS_CONFIG[status];

  return (
    <Badge className={`${config.color} flex items-center gap-1`}>
      {showIcon && config.icon}
      {config.label}
    </Badge>
  );
}

export { PAYMENT_STATUS_CONFIG };
