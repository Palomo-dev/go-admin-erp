'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { clasesBoton } from '@/components/kit';
import { cobroDelPedido } from './cobroPedido';
import { esComerAqui, esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { 
  CheckCircle, 
  XCircle, 
  Timer, 
  Package, 
  ChefHat,
  Truck, 
  Printer,
  Receipt,
  Loader2,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderActionsProps {
  order: WebOrder;
  onConfirm?: () => void;
  onReject?: () => void;
  onStartPreparing?: () => void;
  onMarkReady?: () => void;
  onStartDelivery?: () => void;
  onMarkDelivered?: () => void;
  onCancel?: () => void;
  onConvertToSale?: () => void;
  onPrint?: () => void;
  onMarkAsPaid?: () => void;
  /** Cobrar en la caja de la sede (E4); `entregar` también lo marca entregado. */
  onCobrar?: (entregar: boolean) => void;
  /** La sede no tiene caja abierta: «Cobrar y entregar» queda deshabilitado (Figma 1982:841). */
  sinCajaAbierta?: boolean;
  /** «Entra a Caja N · {sede} · abierta», ya traducido; null si no se conoce la caja. */
  cajaEtiqueta?: string | null;
  isLoading?: boolean;
  variant?: 'full' | 'compact';
}

export function OrderActions({
  order,
  onConfirm,
  onReject,
  onStartPreparing,
  onMarkReady,
  onStartDelivery,
  onMarkDelivered,
  onCancel,
  onConvertToSale,
  onPrint,
  onMarkAsPaid,
  onCobrar,
  sinCajaAbierta = false,
  cajaEtiqueta = null,
  isLoading = false,
  variant = 'full',
}: OrderActionsProps) {
  const t = useTranslations('pedidoWeb');
  const isPending = order.status === 'pending';
  const isConfirmed = order.status === 'confirmed';
  const isPreparing = order.status === 'preparing';
  const isReady = order.status === 'ready';
  const isInDelivery = order.status === 'in_delivery';
  const isDelivered = order.status === 'delivered';
  // Recoger y «Comer aquí» no salen a domicilio: de «Listo» pasan a «Entregado».
  const isPickup = !esDomicilio(order.delivery_type);
  // Cancelar también a partir de «Preparando» (Figma 449:208178 y 1981:175699).
  // Ya pagado y en cocina, cancelar exige reembolso: eso va por «Reembolsar pedido».
  const canCancel = ['pending', 'confirmed'].includes(order.status)
    || (['preparing', 'ready'].includes(order.status) && order.payment_status !== 'paid');
  const mesaEnPos = esComerAqui(order) && order.restaurant_table_id ? `/app/pos/mesas/${order.restaurant_table_id}` : null;
  // Un «Comer aquí» agregado a la mesa no tiene venta propia: su venta es la de la mesa.
  const canConvertToSale = isDelivered && !order.sale_id && !order.table_session_id;
  // Cobro en la caja de la sede (pago en el local o contraentrega). Listo para
  // entregar sin cobrar aún: «Cobrar y entregar» es la primaria (Figma 1981:175699).
  const cobro = cobroDelPedido(order);
  const puedeCobrar = !!onCobrar && cobro.puedeCobrar;
  const cobraYEntrega = !!onCobrar && cobro.cobraYEntrega;

  if (variant === 'compact') {
    return (
      <div className="flex gap-2">
        {isPending && (
          <>
            <Button size="sm" onClick={onConfirm} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject} disabled={isLoading}>
              <XCircle className="h-4 w-4" />
            </Button>
          </>
        )}
        {isConfirmed && (
          <Button size="sm" onClick={onStartPreparing} disabled={isLoading}>
            <ChefHat className="h-4 w-4" />
          </Button>
        )}
        {isPreparing && (
          <Button size="sm" onClick={onMarkReady} disabled={isLoading}>
            <Package className="h-4 w-4" />
          </Button>
        )}
        {isReady && !isPickup && (
          <Button size="sm" onClick={onStartDelivery} disabled={isLoading}>
            <Truck className="h-4 w-4" />
          </Button>
        )}
        {((isReady && isPickup) || isInDelivery) && (
          <Button size="sm" onClick={onMarkDelivered} disabled={isLoading}>
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Acciones principales según estado */}
      {isPending && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {t('orderActions.confirmarPedido')}
          </Button>
          <Button variant="destructive" onClick={onReject} disabled={isLoading}>
            <XCircle className="h-4 w-4 mr-2" />
            {t('orderActions.rechazar')}
          </Button>
        </div>
      )}

      {isConfirmed && (
        <Button className="w-full" onClick={onStartPreparing} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Timer className="h-4 w-4 mr-2" />
          )}
          {t('orderActions.iniciarPreparacion')}
        </Button>
      )}

      {isPreparing && (
        <Button className="w-full" onClick={onMarkReady} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Package className="h-4 w-4 mr-2" />
          )}
          {t('orderActions.marcarComoListo')}
        </Button>
      )}

      {isReady && !isPickup && (
        <Button className="w-full" onClick={onStartDelivery} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Truck className="h-4 w-4 mr-2" />
          )}
          {t('orderActions.enviarDomicilio')}
        </Button>
      )}

      {/* «Cobrar y entregar»: primaria de marca, con la caja a la que entra el dinero */}
      {cobraYEntrega && (
        <div className="space-y-2">
          <button
            type="button"
            className={clasesBoton({ variante: 'primario', anchoCompleto: true })}
            onClick={() => onCobrar?.(true)}
            disabled={isLoading || sinCajaAbierta}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <DollarSign className="size-4" aria-hidden="true" />}
            {t('cobro.cobrarYEntregar')}
          </button>
          {sinCajaAbierta ? (
            <>
              <p className="text-sm text-danger-text" role="alert">{t('cobro.sinCajaAcciones')}</p>
              <Link href="/app/pos/cajas" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {t('cobro.abrirCaja')}
              </Link>
            </>
          ) : (
            cajaEtiqueta && <p className="text-sm text-fg-secondary">{cajaEtiqueta}</p>
          )}
          {mesaEnPos && (
            <Link href={mesaEnPos} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('verMesa')}
            </Link>
          )}
          <button
            type="button"
            className={clasesBoton({ variante: 'fantasma', anchoCompleto: true })}
            onClick={() => onCobrar?.(false)}
            disabled={isLoading || sinCajaAbierta}
          >
            <DollarSign className="size-4" aria-hidden="true" />
            {t('cobro.registrarPago')}
          </button>
        </div>
      )}

      {((isReady && isPickup) || isInDelivery) && !cobraYEntrega && (
        <Button className="w-full" onClick={onMarkDelivered} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          {t('cobro.marcarEntregado')}
        </Button>
      )}

      {/* Cobrar antes de que esté listo: secundaria; la primaria es el paso del estado */}
      {puedeCobrar && !cobraYEntrega && (
        <div className="space-y-2">
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}
            onClick={() => onCobrar?.(false)}
            disabled={isLoading || sinCajaAbierta}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <DollarSign className="size-4" aria-hidden="true" />}
            {t('cobro.cobrar')}
          </button>
          {sinCajaAbierta ? (
            <>
              <p className="text-sm text-danger-text" role="alert">{t('cobro.sinCaja')}</p>
              <Link href="/app/pos/cajas" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {t('cobro.abrirCaja')}
              </Link>
            </>
          ) : (
            cajaEtiqueta && <p className="text-sm text-fg-secondary">{cajaEtiqueta}</p>
          )}
        </div>
      )}

      {/* Respaldo: marcar como pagado (solo si no se pasa onCobrar) */}
      {order.payment_status !== 'paid' && !onCobrar && onMarkAsPaid && !isPending && (
        <Button
          variant="outline"
          className="w-full border-green-600 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
          onClick={onMarkAsPaid}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <DollarSign className="h-4 w-4 mr-2" />
          )}
          {t('orderActions.marcarComoPagado')}
        </Button>
      )}

      {/* Acción para convertir a venta */}
      {canConvertToSale && (
        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={onConvertToSale} 
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4 mr-2" />
          )}
          {t('orderActions.crearVenta')}
        </Button>
      )}

      {/* Acciones secundarias (Figma 1981:175699): imprimir la comanda y cancelar */}
      {onPrint && (
        <button type="button" className={clasesBoton({ variante: 'fantasma', anchoCompleto: true })} onClick={onPrint}>
          <Printer className="size-4" aria-hidden="true" />
          {t('ficha.imprimirComanda')}
        </button>
      )}
      {canCancel && onCancel && (
        <button type="button" className={clasesBoton({ variante: 'destructivo', anchoCompleto: true })} onClick={onCancel} disabled={isLoading}>
          <XCircle className="size-4" aria-hidden="true" />
          {t('ficha.cancelarPedido')}
        </button>
      )}
    </div>
  );
}
