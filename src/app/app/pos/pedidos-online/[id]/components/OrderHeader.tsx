'use client';

import { ExternalLink, CalendarClock, CheckCircle2, Coins, Tag, Building2, DollarSign, Loader2, Mail, Printer, ShoppingBag, UtensilsCrossed, Globe, PackageCheck, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { AvisoTonal, PageHeader, RowActionsMenu, clasesBoton } from '@/components/kit';
import type { AccionFila } from '@/components/kit/acciones';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { StatusBadge, PaymentStatusBadge } from '@/components/pos/pedidos-online';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { todayInTz, toPlainDate } from '@/lib/utils/dateCore';
import { mesaCortaDelPedido, tipoEntregaEfectivo, zonaDelPedido } from '@/lib/pos/pedidosWeb/tipoEntrega';
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
  /** «Caja N · {sede} · abierta», ya traducido (resumen bajo los chips). */
  cajaEtiqueta?: string | null;
  onImprimirComanda?: () => void;
  onMarcarEntregado?: () => void;
  onReenviarAviso?: () => void;
  onCancelar?: () => void;
}

export function OrderHeader({
  order,
  porCobrarEnCaja = false,
  reservaActiva = false,
  onCobrarYEntregar,
  cobrarDeshabilitado = false,
  isLoading = false,
  avisoStock = [],
  cajaEtiqueta = null,
  onImprimirComanda,
  onMarcarEntregado,
  onReenviarAviso,
  onCancelar,
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
  const mesaCorta = mesaCortaDelPedido(order);
  const zona = zonaDelPedido(order);
  const esHoy = toPlainDate(new Date(order.created_at), timezone) === todayInTz(timezone);
  const canal = t.has(`detalle.canales.${order.source}`) ? t(`detalle.canales.${order.source}`) : order.source;
  const chip = 'gap-1';

  const listoHora = order.ready_at ? formatTimeInTz(order.ready_at, timezone) : null;
  const resumen = order.status === 'ready' && listoHora
    ? [
        esComerAqui && mesaCorta
          ? t('ficha.resumenListoMesa', { hora: listoHora, mesa: zona ? `${mesaCorta} (${zona})` : mesaCorta })
          : t('ficha.resumenListo', { hora: listoHora }),
        porCobrarEnCaja && cajaEtiqueta ? t('ficha.seCobraEnCaja', { caja: cajaEtiqueta }) : null,
      ].filter(Boolean).join(' ')
    : null;
  const menu: AccionFila[] = [
    ...(onMarcarEntregado ? [{ id: 'entregado', etiqueta: t('cobro.marcarEntregado'), icono: CheckCircle2, onSelect: onMarcarEntregado }] : []),
    ...(onReenviarAviso ? [{ id: 'aviso', etiqueta: t('ficha.reenviarAviso'), icono: Mail, onSelect: onReenviarAviso }] : []),
    ...(order.sale_id ? [{ id: 'venta', etiqueta: t('detalle.verVenta'), icono: ExternalLink, onSelect: () => router.push(`/app/pos/ventas/${order.sale_id}`) }] : []),
    ...(onCancelar ? [{ id: 'cancelar', etiqueta: t('ficha.cancelarPedido'), icono: XCircle, destructiva: true, onSelect: onCancelar }] : []),
  ];
  const fecha = formatDateTime(order.created_at);

  return (
    <div className="space-y-3">
      <PageHeader
        titulo={order.order_number}
        badge={<StatusBadge status={order.status} size="lg" />}
        icono={ShoppingBag}
        migas={[
          { etiqueta: 'POS', href: '/app/pos' },
          { etiqueta: t('ficha.pedidosOnline'), href: '/app/pos/pedidos-online' },
          { etiqueta: order.order_number },
        ]}
        subtitulo={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>
              {t('detalle.recibido', { fecha: esHoy ? t('ficha.hoyFecha', { fecha }) : fecha })}
              {order.branch?.name ? ` · ${order.branch.name}` : ''}
              {` · ${timezone}`}
            </span>
            {order.is_scheduled && order.scheduled_at && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                {t('ficha.programadoPara', { fecha: formatDateTime(order.scheduled_at) })}
              </span>
            )}
          </span>
        }
        acciones={
          <>
            {!porCobrarEnCaja && order.payment_status === 'paid' && <PaymentStatusBadge status={order.payment_status} />}
            {onImprimirComanda && (
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={onImprimirComanda}>
                <Printer className="size-4" aria-hidden="true" strokeWidth={1.5} />
                {t('ficha.imprimirComanda')}
              </button>
            )}
            {onCobrarYEntregar && (
              <button
                type="button"
                className={clasesBoton({ variante: 'primario' })}
                onClick={onCobrarYEntregar}
                disabled={isLoading || cobrarDeshabilitado}
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <DollarSign className="size-4" aria-hidden="true" />}
                {t('cobro.cobrarYEntregar')}
              </button>
            )}
            {menu.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="md" titulo={order.order_number} acciones={menu} />}
          </>
        }
        movil={{
          subtitulo: [t.has(`ficha.estados.${order.status}`) ? t(`ficha.estados.${order.status}`) : order.status, formatear(order.total)].join(' · '),
          accion: menu.length > 0 ? <RowActionsMenu orientacion="vertical" tamano="md" titulo={order.order_number} acciones={menu} /> : undefined,
        }}
      />

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
            {mesaCorta ? t('comerAquiMesa', { mesa: mesaCorta }) : t('comerAqui')}
          </Badge>
        )}
        {reservaActiva && (
          <Badge tono="neutro" apariencia="contorno" icono={PackageCheck} className={chip}>{t('detalle.reservaActiva')}</Badge>
        )}
        {order.is_scheduled && (
          <Badge tono="neutro" apariencia="contorno" icono={CalendarClock} className={chip}>{t('orderHeader.programado')}</Badge>
        )}
        {order.coupon_code && (
          <Badge tono="neutro" apariencia="contorno" icono={Tag} className={chip}>{t('orderHeader.cupon', { coupon_code: order.coupon_code })}</Badge>
        )}
        {order.tip_amount > 0 && (
          <Badge tono="neutro" apariencia="contorno" icono={Coins} className={chip}>{t('orderHeader.propina', { valor: formatear(order.tip_amount) })}</Badge>
        )}
      </div>

      {/* Resumen del estado (Figma 1981:175699): cuándo quedó listo y dónde se cobra */}
      {resumen && <p className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] text-fg">{resumen}</p>}

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
