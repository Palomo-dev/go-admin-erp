'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, CheckCircle, ChefHat, AlertCircle, User, Check, Hash, Printer, Loader2, AlertTriangle, RefreshCcw, Flame, StickyNote } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import type { KitchenTicket, KitchenTicketItem, StationFilter } from '@/lib/services/kitchenService';
import { esMedido, formatoCantidad, type ProductoModoVenta } from '@/lib/pos/peso/modoVenta';

interface TicketCardProps {
  ticket: KitchenTicket;
  onStatusChange: (ticketId: number, status: KitchenTicket['status']) => void;
  onItemStatusChange?: (itemId: number, status: KitchenTicketItem['status'], productName?: string) => void;
  onReprint?: (ticket: KitchenTicket) => Promise<void> | void;
  /** Confirmar la alergia de la comanda: hasta entonces no se puede empezar. */
  onConfirmAllergy?: (ticket: KitchenTicket) => Promise<void> | void;
  stationFilter?: StationFilter;
}

/** La comanda tiene alergia sin confirmar: no se empieza (la base también lo impide). */
export function alergiaPendiente(ticket: Pick<KitchenTicket, 'has_allergy' | 'allergy_ack_at'>): boolean {
  return ticket.has_allergy === true && !ticket.allergy_ack_at;
}

/**
 * Cantidad que la cocina debe ver en el ítem. La copia del ítem manda cuando
 * existe (`product_name`, mostrador y mesa desde 2026-09-23): así un cambio
 * en la cuenta no altera en silencio la comanda ya enviada (N3). Las filas
 * viejas de mesa no tienen copia y siguen leyendo la línea de la venta.
 */
export function cantidadComanda(item: Pick<KitchenTicketItem, 'product_name' | 'quantity' | 'sale_items'>): number {
  if (item.product_name) return Number(item.quantity ?? 1);
  return Number(item.sale_items?.quantity ?? item.quantity ?? 1);
}

/**
 * Texto de la cantidad en la comanda: «0,500 kg» en un producto por peso o
 * medida (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6: «Las comandas
 * muestran 0,500 kg») y «2x» en los demás, como siempre. La unidad sale del
 * producto de la línea de la venta (mesas); una comanda del mostrador no la
 * trae y se muestra con los decimales que tenga, en el idioma de la cocina.
 */
export function textoCantidadComanda(
  cantidad: number,
  producto: ProductoModoVenta | null | undefined,
  locale = 'es-CO',
): string {
  if (esMedido(producto)) return formatoCantidad(cantidad, producto, locale);
  return `${formatoCantidad(cantidad, null, locale)}x`;
}

// `label` es la clave en `posComandas.estados`, `estaciones` o `estadosItem`.
const getStatusInfo = (status: KitchenTicket['status']) => {
  switch (status) {
    case 'new':
      return {
        label: 'new',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: AlertCircle,
      };
    case 'preparing':
      return {
        label: 'preparing',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        icon: ChefHat,
      };
    case 'ready':
      return {
        label: 'ready',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: CheckCircle,
      };
    case 'delivered':
      return {
        label: 'delivered',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
        icon: CheckCircle,
      };
    default:
      return {
        label: 'desconocido',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
        icon: AlertCircle,
      };
  }
};

const getStationInfo = (station: string | null) => {
  switch (station) {
    case 'hot_kitchen':
      return { label: 'hot_kitchen', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'cold_kitchen':
      return { label: 'cold_kitchen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'bar':
      return { label: 'bar', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' };
    default:
      return { label: 'general', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
  }
};

const getItemStatusInfo = (status: string | undefined) => {
  switch (status) {
    case 'pending':
      return { label: 'pending', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' };
    case 'in_progress':
      return { label: 'in_progress', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20' };
    case 'ready':
      return { label: 'ready', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20' };
    case 'delivered':
      return { label: 'delivered', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-900/20' };
    default:
      return { label: 'pending', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' };
  }
};

export function TicketCard({ ticket, onStatusChange, onItemStatusChange, onReprint, onConfirmAllergy, stationFilter = 'all' }: TicketCardProps) {
  const t = useTranslations('posComandas');
  const locale = useLocale();
  const { timezone } = useOrgTimezone();
  const [updatingItems, setUpdatingItems] = useState<Set<number>>(new Set());
  const [isReprinting, setIsReprinting] = useState(false);
  const [isConfirmingAllergy, setIsConfirmingAllergy] = useState(false);
  const esAjuste = ticket.ticket_type === 'adjustment';
  const bloqueadaPorAlergia = alergiaPendiente(ticket);
  const notasAlergia = (ticket.kitchen_ticket_items || [])
    .filter((i) => i.is_allergy && i.status !== 'cancelled' && i.notes)
    .map((i) => `${i.product_name || i.sale_items?.products?.name || ''}: ${i.notes}`);

  const handleConfirmAllergy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onConfirmAllergy || isConfirmingAllergy) return;
    setIsConfirmingAllergy(true);
    try {
      await onConfirmAllergy(ticket);
    } finally {
      setIsConfirmingAllergy(false);
    }
  };

  const handleReprint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onReprint || isReprinting) return;
    setIsReprinting(true);
    try {
      await onReprint(ticket);
    } finally {
      setIsReprinting(false);
    }
  };
  const statusInfo = getStatusInfo(ticket.status);
  const StatusIcon = statusInfo.icon;
  
  const tableName = ticket.table_sessions?.restaurant_tables?.name || (ticket.source === 'pos' ? 'POS' : t('tarjeta.mesa'));
  const zoneName = ticket.table_sessions?.restaurant_tables?.zone || '';
  const serverName = ticket.table_sessions?.serverName || ticket.server_name || null;

  const timeElapsed = React.useMemo(() => {
    const created = new Date(ticket.created_at);
    // Si el ticket ya está listo o entregado, usar ready_at para congelar el tiempo
    const endTime = ticket.ready_at ? new Date(ticket.ready_at) : new Date();
    const diff = Math.floor((endTime.getTime() - created.getTime()) / 60000);
    return diff;
  }, [ticket.created_at, ticket.ready_at]);

  // Urgencia por tiempo de espera (no aplica a tickets ya listos o entregados)
  const isFinal = ticket.status === 'ready' || ticket.status === 'delivered';
  const timeUrgency: 'ok' | 'warning' | 'critical' = isFinal
    ? 'ok'
    : timeElapsed >= 20
    ? 'critical'
    : timeElapsed >= 10
    ? 'warning'
    : 'ok';

  const timeUrgencyClasses: Record<typeof timeUrgency, string> = {
    ok: 'text-gray-600 dark:text-gray-400',
    warning: 'text-orange-600 dark:text-orange-400 font-semibold',
    critical: 'text-red-600 dark:text-red-400 font-bold',
  };

  const cardUrgencyBorder: Record<typeof timeUrgency, string> = {
    ok: '',
    warning: 'ring-1 ring-orange-300 dark:ring-orange-700',
    critical: 'ring-2 ring-red-400 dark:ring-red-600',
  };

  const getNextStatus = (): KitchenTicket['status'] | null => {
    switch (ticket.status) {
      case 'new':
        return 'preparing';
      case 'preparing':
        return 'ready';
      case 'ready':
        return 'delivered';
      default:
        return null;
    }
  };

  const nextStatus = getNextStatus();

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-shadow ${cardUrgencyBorder[timeUrgency]} ${bloqueadaPorAlergia ? 'ring-2 ring-red-500 dark:ring-red-500' : ''}`}>
      {/* Header */}
      <div className={esAjuste
        ? 'bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 p-3 sm:p-4 border-b border-amber-300 dark:border-amber-700'
        : 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-3 sm:p-4 border-b border-blue-200 dark:border-blue-800'}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {tableName}
              </h3>
              {zoneName && (
                <Badge variant="outline" className="text-xs">
                  {zoneName}
                </Badge>
              )}
              {esAjuste && (
                <Badge className="text-xs bg-amber-500 text-white hover:bg-amber-500 inline-flex items-center gap-1">
                  <RefreshCcw className="h-3 w-3" />
                  {ticket.adjusts_ticket_id ? t('ajusteDe', { id: ticket.adjusts_ticket_id }) : t('ajuste')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-gray-600 dark:text-gray-400">
              <div className={`flex items-center gap-1 ${timeUrgencyClasses[timeUrgency]}`}>
                <Clock className="h-4 w-4" />
                <span>{t('tarjeta.minutos', { n: timeElapsed })}</span>
                {timeUrgency === 'critical' && (
                  <span title={t('tarjeta.esperaElevada')} className="inline-flex">
                    <Flame aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="sr-only">{t('tarjeta.esperaElevada')}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Hash className="h-4 w-4" />
                <span>{t('tarjeta.ticket', { id: ticket.id })}</span>
              </div>
              {serverName && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>{serverName}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {onReprint && (
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 bg-white/70 dark:bg-gray-900/40"
                title={t('tarjeta.reimprimir')}
                onClick={handleReprint}
                disabled={isReprinting}
              >
                {isReprinting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Badge className={`${statusInfo.color} flex items-center gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {t(`estados.${statusInfo.label}`)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Alergia: aviso arriba y confirmación obligatoria antes de empezar */}
      {ticket.has_allergy && (
        <div
          className={bloqueadaPorAlergia
            ? 'bg-red-600 text-white p-3 sm:p-4 space-y-2'
            : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300 px-3 sm:px-4 py-2 text-xs'}
          role={bloqueadaPorAlergia ? 'alert' : undefined}
        >
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{bloqueadaPorAlergia ? t('alergiaPendiente') : t('alergiaConfirmada', { hora: formatTimeInTz(ticket.allergy_ack_at, timezone) })}</span>
          </div>
          {bloqueadaPorAlergia && notasAlergia.length > 0 && (
            <ul className="text-sm list-disc pl-6">
              {notasAlergia.map((n) => <li key={n} className="break-words">{n}</li>)}
            </ul>
          )}
          {bloqueadaPorAlergia && onConfirmAllergy && (
            <Button
              onClick={handleConfirmAllergy}
              disabled={isConfirmingAllergy}
              className="w-full bg-white text-red-700 hover:bg-red-50"
            >
              {isConfirmingAllergy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {t('confirmarAlergia')}
            </Button>
          )}
        </div>
      )}

      {/* Items */}
      <div className="p-3 sm:p-4 space-y-3">
        {ticket.kitchen_ticket_items?.map((item) => {
          const product = item.sale_items?.products;
          const stationInfo = getStationInfo(item.station);
          const itemStatusInfo = getItemStatusInfo(item.status);
          const isItemReady = item.status === 'ready' || item.status === 'delivered';
          const isCancelled = item.status === 'cancelled' || !!item.cancelled_at;
          const matchesStation = stationFilter === 'all' || item.station === stationFilter;
          // La copia del ítem (nombre, cantidad) manda sobre la línea de la venta.
          const itemQuantity = cantidadComanda(item);
          const productName = item.product_name || product?.name || t('tarjeta.producto');
          const delta = Math.abs(Number(item.quantity_delta) || 0);
          const ajusteLabel = item.adjustment_kind === 'increase' ? t('mas', { cantidad: delta })
            : item.adjustment_kind === 'decrease' ? t('menos', { cantidad: delta })
            : item.adjustment_kind === 'void' ? t('anular')
            : item.adjustment_kind === 'note' ? t('notaCambiada')
            : null;
          const itemClickable = !!onItemStatusChange && !isCancelled && !bloqueadaPorAlergia;
          const variantData = product?.variant_data || item.variant_data;
          const itemModifiers = (() => {
            const saleItemNotes = item.sale_items?.notes;
            const mods = saleItemNotes && typeof saleItemNotes === 'object' ? saleItemNotes.modifiers || [] : [];
            if (mods.length > 0) return mods;
            return item.modifiers || [];
          })();
          
          const handleItemClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!onItemStatusChange || !itemClickable || updatingItems.has(item.id)) return;
            // Marcar como actualizando para evitar doble-click
            setUpdatingItems(prev => new Set(prev).add(item.id));
            // Ciclar entre estados: pending -> in_progress -> ready
            const nextStatus = item.status === 'pending' ? 'in_progress' : 
                              item.status === 'in_progress' ? 'ready' : 
                              item.status === 'ready' ? 'pending' : 'pending';
            onItemStatusChange(item.id, nextStatus as KitchenTicketItem['status'], productName);
            // Liberar después de 1.5s
            setTimeout(() => {
              setUpdatingItems(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
              });
            }, 1500);
          };
          
          return (
            <div
              key={item.id}
              className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                isCancelled
                  ? 'bg-red-50/60 dark:bg-red-900/10 border-red-200 dark:border-red-900'
                  : isItemReady
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-gray-50 dark:bg-gray-800/50 border-transparent hover:border-blue-300 dark:hover:border-blue-700'
              } ${itemClickable ? 'cursor-pointer' : ''} ${!matchesStation ? 'opacity-35' : ''}`}
              onClick={itemClickable ? (e) => handleItemClick(e) : undefined}
            >
              <div className="flex items-start gap-3 flex-1">
                {/* Indicador de estado del item */}
                <div className={`mt-1 flex-shrink-0 ${onItemStatusChange ? 'cursor-pointer' : ''}`}>
                  {isItemReady ? (
                    <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : item.status === 'in_progress' ? (
                    <div className="h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center">
                      <ChefHat className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {ajusteLabel && (
                      <Badge className={`text-xs ${item.adjustment_kind === 'void' || item.adjustment_kind === 'decrease' ? 'bg-red-600 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-500'} text-white`}>
                        {ajusteLabel}
                      </Badge>
                    )}
                    <span className={`font-semibold ${isCancelled ? 'text-red-700 dark:text-red-400 line-through' : isItemReady ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                      {textoCantidadComanda(itemQuantity, product as ProductoModoVenta | undefined, locale)}
                    </span>
                    <span className={`${isCancelled ? 'text-red-700 dark:text-red-400 line-through' : isItemReady ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-gray-100'} break-words`}>
                      {productName}
                    </span>
                  </div>
                  {isCancelled && (
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                      {item.cancel_reason ? t('anuladoMotivo', { motivo: item.cancel_reason }) : t('anulado')}
                    </p>
                  )}
                  {item.adjustment_reason && !isCancelled && (
                    <p className="text-xs text-amber-800 dark:text-amber-300 mb-1">
                      {t('motivo', { motivo: item.adjustment_reason })}
                    </p>
                  )}

                  {variantData && Object.keys(variantData).length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      {Object.entries(variantData).filter(([, v]) => !!v).map(([attr, value]) => (
                        <Badge key={attr} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
                          {attr}: {value}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {itemModifiers.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      {itemModifiers.map((mod: { name: string }, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                          {mod.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${stationInfo.color} text-xs`}>
                      {t(`estaciones.${stationInfo.label}`)}
                    </Badge>
                    {!isCancelled && (
                      <Badge className={`${itemStatusInfo.bgColor} ${itemStatusInfo.color} text-xs`}>
                        {t(`estadosItem.${itemStatusInfo.label}`)}
                      </Badge>
                    )}
                    {product?.categories?.name && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {product.categories.name}
                      </span>
                    )}
                    {ticket.source === 'pos' && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        POS
                      </Badge>
                    )}
                  </div>
                  
                  {item.notes && (
                    <p className={item.is_allergy
                      ? 'mt-2 text-sm font-bold text-red-700 dark:text-red-400 flex items-start gap-1'
                      : 'mt-2 text-sm text-gray-600 dark:text-gray-400 italic'}>
                      {item.is_allergy ? (
                        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <StickyNote aria-hidden="true" className="mr-1 inline h-4 w-4 align-text-bottom" />
                      )}
                      {item.is_allergy && <span className="uppercase">{t('alergia')}:</span>}
                      {typeof item.notes === 'object' ? (item.notes as { extra?: string } | null)?.extra : item.notes}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {nextStatus && (
        <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={() => onStatusChange(ticket.id, nextStatus)}
            disabled={bloqueadaPorAlergia && (nextStatus === 'preparing' || nextStatus === 'ready')}
            title={bloqueadaPorAlergia ? t('alergiaPendiente') : undefined}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {nextStatus === 'preparing' && t('tarjeta.comenzar')}
            {nextStatus === 'ready' && t('tarjeta.marcarListo')}
            {nextStatus === 'delivered' && t('tarjeta.marcarEntregado')}
          </Button>
        </div>
      )}
    </Card>
  );
}
