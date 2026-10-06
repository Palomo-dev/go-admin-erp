'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, CalendarClock, Coins, Tag, Building2, DollarSign, Loader2, UtensilsCrossed, Globe, PackageCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { AvisoTonal, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { StatusBadge, PaymentStatusBadge } from '@/components/pos/pedidos-online';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { mesaDelPedido, tipoEntregaEfectivo } from '@/lib/pos/pedidosWeb/tipoEntrega';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderHeaderProps {
  order: WebOrder;
  /** Se cobra en la caja de la sede (pago en el local, sin cobrar todavía). */
  porCobrarEnCaja?: boolean;
  /** Hay reserva de stock activa para el pedido (`stock_reservations` sin liberar). */
  reservaActiva?: boolean;
  /** «Cobrar y entregar» en la cabecera (Figma 1981:175699); sin él, no se pinta. */
  onCobrarYEntregar?: () => void;
  cobrarDeshabilitado?: boolean;
  isLoading?: boolean;
  /** Líneas sin stock de receta de la última confirmación (Figma 1982:903). */
  avisoStock?: string[];
}

export function OrderHeader({
  order,
  porCobrarEnCaja = false,
  reservaActiva = false,
  onCobrarYEntregar,
  cobrarDeshabilitado = false,
  isLoading = false,
  avisoStock = [],
}: OrderHeaderProps) {
  const router = useRouter();
  const t = useTranslations('pedidoWeb');
  const locale = useLocaleIntl();
  const { timezone } = useFormatDate(order.branch_id);
  const { formatear } = useMonedaOrganizacion();

  // Instantes (timestamptz) en la zona de la sede del pedido, nunca en la del navegador.
  const formatDateTime = (date: string) =>
    formatDateTimeInTz(date, timezone, {
      locale,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const esComerAqui = tipoEntregaEfectivo(order) === 'dine_in';
  const mesa = mesaDelPedido(order);
  const canal = t.has(`detalle.canales.${order.source}`) ? t(`detalle.canales.${order.source}`) : order.source;
  const chip = 'gap-1';

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('detalle.volver')}</span>
          </Button>
          <div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold text-fg">{order.order_number}</h1>
              <StatusBadge status={order.status} size="lg" />
            </div>
            <div className="flex items-center gap-x-2 gap-y-1 text-sm text-fg-secondary flex-wrap">
              <span>
                {t('detalle.recibido', { fecha: formatDateTime(order.created_at) })}
                {order.branch?.name ? ` · ${order.branch.name}` : ''}
                {` · ${timezone}`}
              </span>
              {order.is_scheduled && order.scheduled_at && (
                <span className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" aria-hidden="true" />
                  Para: {formatDateTime(order.scheduled_at)}
                </span>
              )}
              {order.sale_id && (
                <Link
                  href={`/app/pos/ventas/${order.sale_id}`}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  {t('detalle.verVenta')}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {!porCobrarEnCaja && <PaymentStatusBadge status={order.payment_status} />}
          {onCobrarYEntregar && (
            <button
              type="button"
              className={clasesBoton({ variante: 'primario', className: 'hidden sm:inline-flex' })}
              onClick={onCobrarYEntregar}
              disabled={isLoading || cobrarDeshabilitado}
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <DollarSign className="size-4" aria-hidden="true" />}
              {t('cobro.cobrarYEntregar')}
            </button>
          )}
        </div>
      </div>

      {/* Chips neutros (Figma 1981:175699): sede, cobro, origen, mesa y reserva */}
      <div className="flex flex-wrap items-center gap-2">
        {order.branch?.name && (
          <Badge tono="neutro" apariencia="contorno" icono={Building2} className={chip}>{order.branch.name}</Badge>
        )}
        {porCobrarEnCaja && (
          <Badge tono="neutro" apariencia="contorno" className={chip}>{t('detalle.porCobrar')}</Badge>
        )}
        <Badge tono="neutro" apariencia="contorno" icono={Globe} className={chip}>
          {t('detalle.origen', { canal, numero: order.order_number })}
        </Badge>
        {esComerAqui && (
          <Badge tono="neutro" apariencia="contorno" icono={UtensilsCrossed} className={chip}>
            {mesa ? t('comerAquiMesa', { mesa }) : t('comerAqui')}
          </Badge>
        )}
        {reservaActiva && (
          <Badge tono="neutro" apariencia="contorno" icono={PackageCheck} className={chip}>{t('detalle.reservaActiva')}</Badge>
        )}
        {order.is_scheduled && (
          <Badge tono="neutro" apariencia="contorno" icono={CalendarClock} className={chip}>Programado</Badge>
        )}
        {order.coupon_code && (
          <Badge tono="neutro" apariencia="contorno" icono={Tag} className={chip}>Cupón: {order.coupon_code}</Badge>
        )}
        {order.tip_amount > 0 && (
          <Badge tono="neutro" apariencia="contorno" icono={Coins} className={chip}>Propina: {formatear(order.tip_amount)}</Badge>
        )}
      </div>

      {/* Stock de receta insuficiente: aviso persistente bajo los chips (Figma 1982:903) */}
      {avisoStock.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          rol="alert"
          compacto
          titulo={t('detalle.avisoStock', { detalle: avisoStock.slice(0, 3).join(' · ') })}
        />
      )}
    </div>
  );
}
