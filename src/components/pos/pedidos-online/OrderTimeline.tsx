'use client';

import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { 
  Clock, 
  CheckCircle, 
  ChefHat, 
  Package, 
  Truck, 
  XCircle,
  Circle,
  CalendarClock
} from 'lucide-react';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { todayInTz, toPlainDate } from '@/lib/utils/dateCore';

interface AvisoDeLinea {
  moment: string;
}

interface OrderTimelineProps<A extends AvisoDeLinea = AvisoDeLinea> {
  order: WebOrder;
  variant?: 'vertical' | 'horizontal';
  /** Zona horaria de la organización (las horas nunca salen del navegador). */
  timezone?: string;
  /** Avisos al cliente del pedido: van bajo el paso que los disparó. */
  avisos?: A[];
  renderAvisos?: (avisos: A[]) => React.ReactNode;
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

export function OrderTimeline<A extends AvisoDeLinea = AvisoDeLinea>({ order, variant = 'vertical', timezone, avisos, renderAvisos }: OrderTimelineProps<A>) {
  const formatTime = (date?: string) => (date ? formatTimeInTz(date, timezone) : null);
  const formatDateTime = (date?: string) => (date ? formatDateTimeInTz(date, timezone) : null);
  const esHoy = (date: string) => toPlainDate(new Date(date), timezone) === todayInTz(timezone);

  const isCancelled = ['cancelled', 'rejected', 'expired'].includes(order.status);
  const isPickup = !esDomicilio(order.delivery_type);

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
      ...(order.is_scheduled && order.scheduled_at ? [{
        key: 'scheduled',
        label: `Programado para`,
        icon: <CalendarClock className="h-4 w-4" />,
        timestamp: order.scheduled_at,
        isCompleted: true,
        isCurrent: false,
      }] : []),
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
        label: order.status === 'rejected' ? 'Rechazado' : order.status === 'expired' ? 'Expirado' : 'Cancelado',
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
                    ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' 
                    : step.isCurrent 
                      ? 'bg-primary text-primary-foreground' 
                      : step.isCompleted 
                        ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300' 
                        : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {step.isCompleted || step.isCurrent ? step.icon : <Circle className="h-3 w-3 dark:text-gray-400" />}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${step.isCurrent ? 'font-medium dark:text-gray-100' : 'text-muted-foreground dark:text-gray-400'}`}>
                {step.label}
              </span>
              {step.timestamp && (
                <span className="text-[10px] text-muted-foreground dark:text-gray-400">
                  {formatTime(step.timestamp)}
                </span>
              )}
            </div>
            {index < steps.length - 1 && (
              <div 
                className={`
                  h-0.5 w-8 mx-2
                  ${steps[index + 1].isCompleted || steps[index + 1].isCurrent 
                    ? 'bg-green-500 dark:bg-green-600' 
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

  // Vertical (Figma 1981:175699, «Historial del pedido»): punto, paso, hora a
  // la derecha en la zona de la organización, una línea de detalle y, debajo
  // de cada paso, los avisos al cliente que disparó (465:85608).
  const detalle = (k: string): string | null => {
    if (k === 'created') return [order.source === 'website' ? 'Web' : order.source, order.customer_name].filter(Boolean).join(' · ') || null;
    if (k === 'confirmed' && order.estimated_ready_at) return `prometido listo ${formatTime(order.estimated_ready_at)}`;
    if (k === 'ready' && order.estimated_ready_at && order.ready_at) {
      const dif = Math.round((new Date(order.estimated_ready_at).getTime() - new Date(order.ready_at).getTime()) / 60000);
      return `prometido ${formatTime(order.estimated_ready_at)} · ${dif >= 0 ? `${dif} min antes` : `${-dif} min tarde`}`;
    }
    return null;
  };
  const momentoDePaso: Record<string, string> = {
    created: 'recibido', confirmed: 'confirmado', ready: 'listo', in_delivery: 'en_camino', delivered: 'entregado', cancelled: 'rechazado',
  };
  return (
    <ol className="space-y-3.5">
      {steps.map((step) => {
        const hecho = step.isCompleted || step.isCurrent;
        const hora = step.timestamp ? (esHoy(step.timestamp) ? `hoy ${formatTime(step.timestamp)}` : formatDateTime(step.timestamp)) : null;
        const sub = detalle(step.key);
        const avisosPaso = (avisos ?? []).filter((a) => a.moment === momentoDePaso[step.key]);
        return (
          <li key={step.key} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2 shrink-0 rounded-full ${step.isCancelled ? 'bg-danger' : hecho ? 'bg-fg-secondary' : 'bg-line-strong'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`text-[13px] font-semibold ${step.isCancelled ? 'text-danger-text' : hecho ? 'text-fg' : 'text-fg-secondary'}`}>{step.label}</p>
                <span className="shrink-0 text-xs tabular-nums text-fg-secondary">{hora ?? (hecho ? '' : 'pendiente')}</span>
              </div>
              {sub && <p className="text-xs text-fg-muted">{sub}</p>}
              {step.key === 'cancelled' && order.cancellation_reason && (
                <p className="mt-0.5 text-xs text-danger-text">Motivo: {order.cancellation_reason}</p>
              )}
              {avisosPaso.length > 0 && renderAvisos && <div className="mt-1.5">{renderAvisos(avisosPaso)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
