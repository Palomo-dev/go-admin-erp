'use client';

import { 
  Clock, 
  CheckCircle, 
  ChefHat, 
  Package, 
  Truck, 
  XCircle,
  Circle
} from 'lucide-react';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderTimelineProps {
  order: WebOrder;
  variant?: 'vertical' | 'horizontal';
}

interface TimelineStep {
  key: string;
  label: string;
  icon: React.ReactNode;
  timestamp?: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isCancelled?: boolean;
}

export function OrderTimeline({ order, variant = 'vertical' }: OrderTimelineProps) {
  const formatTime = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (date?: string) => {
    if (!date) return null;
    return new Date(date).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isCancelled = ['cancelled', 'rejected'].includes(order.status);
  const isPickup = order.delivery_type === 'pickup';

  const getSteps = (): TimelineStep[] => {
    const baseSteps: TimelineStep[] = [
      {
        key: 'created',
        label: 'Pedido recibido',
        icon: <Clock className="h-4 w-4" />,
        timestamp: order.created_at,
        isCompleted: true,
        isCurrent: order.status === 'pending',
      },
      {
        key: 'confirmed',
        label: 'Confirmado',
        icon: <CheckCircle className="h-4 w-4" />,
        timestamp: order.confirmed_at,
        isCompleted: !!order.confirmed_at,
        isCurrent: order.status === 'confirmed',
      },
      {
        key: 'preparing',
        label: 'En preparación',
        icon: <ChefHat className="h-4 w-4" />,
        timestamp: order.status === 'preparing' ? undefined : undefined,
        isCompleted: ['preparing', 'ready', 'in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'preparing',
      },
      {
        key: 'ready',
        label: 'Listo',
        icon: <Package className="h-4 w-4" />,
        timestamp: order.ready_at,
        isCompleted: !!order.ready_at || ['in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'ready',
      },
    ];

    if (!isPickup) {
      baseSteps.push({
        key: 'in_delivery',
        label: 'En camino',
        icon: <Truck className="h-4 w-4" />,
        timestamp: undefined,
        isCompleted: ['in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'in_delivery',
      });
    }

    baseSteps.push({
      key: 'delivered',
      label: isPickup ? 'Entregado' : 'Entregado',
      icon: <CheckCircle className="h-4 w-4" />,
      timestamp: order.delivered_at,
      isCompleted: order.status === 'delivered',
      isCurrent: order.status === 'delivered',
    });

    if (isCancelled) {
      baseSteps.push({
        key: 'cancelled',
        label: order.status === 'rejected' ? 'Rechazado' : 'Cancelado',
        icon: <XCircle className="h-4 w-4" />,
        timestamp: order.cancelled_at,
        isCompleted: true,
        isCurrent: true,
        isCancelled: true,
      });
    }

    return baseSteps;
  };

  const steps = getSteps();

  if (variant === 'horizontal') {
    return (
      <div className="flex items-center justify-between w-full overflow-x-auto py-4">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${step.isCancelled 
                    ? 'bg-red-100 text-red-600' 
                    : step.isCurrent 
                      ? 'bg-primary text-primary-foreground' 
                      : step.isCompleted 
                        ? 'bg-green-100 text-green-600' 
                        : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {step.isCompleted || step.isCurrent ? step.icon : <Circle className="h-3 w-3" />}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${step.isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
              {step.timestamp && (
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(step.timestamp)}
                </span>
              )}
            </div>
            {index < steps.length - 1 && (
              <div 
                className={`
                  h-0.5 w-8 mx-2
                  ${steps[index + 1].isCompleted || steps[index + 1].isCurrent 
                    ? 'bg-green-500' 
                    : 'bg-muted'
                  }
                `}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={step.key} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${step.isCancelled 
                  ? 'bg-red-100 text-red-600' 
                  : step.isCurrent 
                    ? 'bg-primary text-primary-foreground' 
                    : step.isCompleted 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-muted text-muted-foreground'
                }
              `}
            >
              {step.isCompleted || step.isCurrent ? step.icon : <Circle className="h-3 w-3" />}
            </div>
            {index < steps.length - 1 && (
              <div 
                className={`
                  w-0.5 flex-1 min-h-[24px]
                  ${steps[index + 1].isCompleted || steps[index + 1].isCurrent 
                    ? 'bg-green-500' 
                    : 'bg-muted'
                  }
                `}
              />
            )}
          </div>
          <div className="flex-1 pb-4">
            <p className={`font-medium ${step.isCancelled ? 'text-red-600' : step.isCurrent ? 'text-primary' : ''}`}>
              {step.label}
            </p>
            {step.timestamp && (
              <p className="text-sm text-muted-foreground">
                {formatDateTime(step.timestamp)}
              </p>
            )}
            {step.key === 'cancelled' && order.cancellation_reason && (
              <p className="text-sm text-red-600 mt-1">
                Motivo: {order.cancellation_reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
