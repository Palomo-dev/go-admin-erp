'use client';

import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { 
  Clock, 
  CheckCircle, 
  Package, 
  Truck, 
  XCircle,
  Circle,
  CalendarClock
} from 'lucide-react';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { todayInTz, toPlainDate } from '@/lib/utils/dateCore';
import { useTranslations } from 'next-intl';
import { claveEstadoPedido } from '@/lib/pos/pedidosWeb/rubroPedidos';
import { ICONO_PREPARAR, useRubroPedidos } from './rubroPedidosUi';

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
  /**
   * Hitos del envío del pedido (Figma 3239-355997): UNA sola línea de tiempo. Entran después de
   * «En preparación» con su hora real y su fuente («Logística» o la transportadora); reemplazan
   * «Listo», «En camino» y «Entregado» del pedido, que hasta ahora se quedaban en «pendiente».
   */
  pasosEnvio?: PasoEnvioHistorial[];
}

/** Un hito del envío ya resuelto para pintar (textos en el idioma de la organización). */
export interface PasoEnvioHistorial {
  clave: string;
  /** Estado canónico del hito (`transport_events.canonical_status`). */
  canonico: string;
  estado: 'hecho' | 'fallo' | 'actual' | 'pendiente';
  hora: string | null;
  etiqueta: string;
  detalle: string | null;
  /** «Logística» o el nombre de la transportadora. */
  fuente: string | null;
  /** Lo que va a la derecha mientras está pendiente («aprox 23:05»). */
  horaPendiente?: string | null;
  /** Momento de aviso al cliente cuyos chips van debajo. */
  momentoAviso?: string | null;
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

export function OrderTimeline<A extends AvisoDeLinea = AvisoDeLinea>({ order, variant = 'vertical', timezone, avisos, renderAvisos, pasosEnvio }: OrderTimelineProps<A>) {
  const t = useTranslations('pedidoWeb');
  // «En preparación» con gorro de chef solo en restaurante; en una tienda, «Alistando».
  const rubro = useRubroPedidos();
  const IconoPreparar = ICONO_PREPARAR[rubro];
  const formatTime = (date?: string) => (date ? formatTimeInTz(date, timezone) : null);
  const formatDateTime = (date?: string) => (date ? formatDateTimeInTz(date, timezone) : null);
  const esHoy = (date: string) => toPlainDate(new Date(date), timezone) === todayInTz(timezone);

  const isCancelled = ['cancelled', 'rejected', 'expired'].includes(order.status);
  const isPickup = !esDomicilio(order.delivery_type);

  const getSteps = (): TimelineStep[] => {
    const baseSteps: TimelineStep[] = [
      {
        key: 'created',
        label: t('orderTimeline.pasos.created'),
        icon: <Clock className="h-4 w-4" />,
        timestamp: order.created_at,
        isCompleted: true,
        isCurrent: order.status === 'pending',
      },
      ...(order.is_scheduled && order.scheduled_at ? [{
        key: 'scheduled',
        label: t('orderTimeline.pasos.scheduled'),
        icon: <CalendarClock className="h-4 w-4" />,
        timestamp: order.scheduled_at,
        isCompleted: true,
        isCurrent: false,
      }] : []),
      {
        key: 'confirmed',
        label: t('orderTimeline.pasos.confirmed'),
        icon: <CheckCircle className="h-4 w-4" />,
        timestamp: order.confirmed_at,
        isCompleted: !!order.confirmed_at,
        isCurrent: order.status === 'confirmed',
      },
      {
        key: 'preparing',
        label: t(`orderTimeline.pasos.${claveEstadoPedido('preparing', rubro)}`),
        icon: <IconoPreparar className="h-4 w-4" />,
        timestamp: order.status === 'preparing' ? undefined : undefined,
        isCompleted: ['preparing', 'ready', 'in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'preparing',
      },
      {
        key: 'ready',
        label: t('orderTimeline.pasos.ready'),
        icon: <Package className="h-4 w-4" />,
        timestamp: order.ready_at,
        isCompleted: !!order.ready_at || ['in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'ready',
      },
    ];

    if (!isPickup) {
      baseSteps.push({
        key: 'in_delivery',
        label: t('orderTimeline.pasos.in_delivery'),
        icon: <Truck className="h-4 w-4" />,
        timestamp: undefined,
        isCompleted: ['in_delivery', 'delivered'].includes(order.status),
        isCurrent: order.status === 'in_delivery',
      });
    }

    baseSteps.push({
      key: 'delivered',
      label: t('orderTimeline.pasos.delivered'),
      icon: <CheckCircle className="h-4 w-4" />,
      timestamp: order.delivered_at,
      isCompleted: order.status === 'delivered',
      isCurrent: order.status === 'delivered',
    });

    if (isCancelled) {
      baseSteps.push({
        key: 'cancelled',
        label: t(`orderTimeline.pasos.${order.status === 'rejected' ? 'rejected' : order.status === 'expired' ? 'expired' : 'cancelled'}`),
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

  interface Fila {
    key: string;
    label: string;
    hora: string | null;
    pendiente: string | null;
    hecho: boolean;
    tono: 'normal' | 'actual' | 'fallo' | 'cancelado';
    sub: string | null;
    fuente: string | null;
    momento: string | null;
    motivoCancelacion: boolean;
  }
  const horaDe = (ts: string | null | undefined) => (ts ? (esHoy(ts) ? `hoy ${formatTime(ts)}` : formatDateTime(ts)) : null);
  const deStep = (step: TimelineStep): Fila => {
    const hecho = step.isCompleted || step.isCurrent;
    return {
      key: step.key,
      label: step.label,
      hora: horaDe(step.timestamp),
      pendiente: hecho ? null : 'pendiente',
      hecho,
      tono: step.isCancelled ? 'cancelado' : 'normal',
      sub: detalle(step.key),
      fuente: null,
      momento: momentoDePaso[step.key] ?? null,
      motivoCancelacion: step.key === 'cancelled',
    };
  };

  // Con envío: los pasos del pedido hasta «En preparación» y, desde ahí, los hitos del envío.
  const conEnvio = !isPickup && !!pasosEnvio && pasosEnvio.length > 0;
  let filas: Fila[];
  if (conEnvio && pasosEnvio) {
    const listoEnEnvio = pasosEnvio.some((p) => p.canonico === 'ready_for_pickup');
    const entregadoEnEnvio = pasosEnvio.some((p) => p.canonico === 'delivered' && p.estado !== 'pendiente');
    const delPedido = steps.filter((s) => !['in_delivery', 'delivered', 'cancelled'].includes(s.key) && !(s.key === 'ready' && listoEnEnvio));
    const delEnvio: Fila[] = pasosEnvio.map((p) => ({
      key: `envio-${p.clave}`,
      label: p.etiqueta,
      hora: p.estado === 'pendiente' ? null : horaDe(p.hora),
      pendiente: p.estado === 'pendiente' ? p.horaPendiente ?? 'pendiente' : null,
      hecho: p.estado !== 'pendiente',
      tono: p.estado === 'fallo' ? 'fallo' : p.estado === 'actual' ? 'actual' : 'normal',
      sub: p.detalle,
      fuente: p.estado === 'pendiente' ? null : p.fuente,
      momento: p.momentoAviso ?? null,
      motivoCancelacion: false,
    }));
    const cierre = steps.filter((s) => s.key === 'cancelled' || (s.key === 'delivered' && order.status === 'delivered' && !entregadoEnEnvio));
    // Si el pedido ya se entregó sin hito del envío, el «Entregado» pendiente del envío sobra.
    const envioSinPendienteDuplicado = cierre.some((s) => s.key === 'delivered') ? delEnvio.filter((f) => !(f.key.endsWith('pendiente-delivered'))) : delEnvio;
    filas = [...delPedido.map(deStep), ...envioSinPendienteDuplicado, ...cierre.map(deStep)];
  } else {
    filas = steps.map(deStep);
  }

  const punto = (f: Fila) =>
    f.tono === 'cancelado' ? 'bg-danger' : f.tono === 'fallo' ? 'bg-warning' : f.tono === 'actual' ? 'bg-brand' : f.hecho ? 'bg-fg-secondary' : 'bg-line-strong';
  return (
    <ol className="space-y-3.5">
      {filas.map((fila) => {
        const avisosPaso = fila.momento ? (avisos ?? []).filter((a) => a.moment === fila.momento) : [];
        return (
          <li key={fila.key} className="flex gap-3">
            <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${punto(fila)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`flex flex-wrap items-center gap-1.5 text-[13px] font-semibold ${fila.tono === 'cancelado' ? 'text-danger-text' : fila.tono === 'fallo' ? 'text-warning-text' : fila.hecho ? 'text-fg' : 'text-fg-secondary'}`}>
                  {fila.label}
                  {fila.fuente && (
                    <span className="rounded-full border border-line-info bg-info-subtle px-1.5 py-px text-[11px] font-medium text-info-text">{fila.fuente}</span>
                  )}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-fg-secondary">{fila.hora ?? fila.pendiente ?? ''}</span>
              </div>
              {fila.sub && <p className="text-xs text-fg-muted">{fila.sub}</p>}
              {fila.motivoCancelacion && order.cancellation_reason && (
                <p className="mt-0.5 text-xs text-danger-text">{t('orderTimeline.motivo', { cancellation_reason: order.cancellation_reason })}</p>
              )}
              {avisosPaso.length > 0 && renderAvisos && <div className="mt-1.5">{renderAvisos(avisosPaso)}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
