'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AvisoTonal, FilaDato, ListaDatos, StatusBadge } from '@/components/kit';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { metodoDeCobroEnCaja } from '@/lib/pos/pedidosWeb/metodosCaja';
import { ordenarPagos, textoMetodoPago, tonoEstadoPago } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import { estadoTarjetaPagos, historialIntentos } from '@/lib/pos/pedidosWeb/intentosPago';
import { ChipPasarela } from '@/components/pos/pedidos-online/pagos/ChipPasarela';
import { HistorialIntentos } from '@/components/pos/pedidos-online/pagos/HistorialIntentos';
import { CuerpoPagosIntentos, InsigniaPagos, type PedidoConStock } from '@/components/pos/pedidos-online/pagos/TarjetaPagosIntentos';
import type { DatosIntentosPago } from '@/components/pos/pedidos-online/pagos/useIntentosPago';
import type { PaymentStatus } from '@/lib/services/webOrdersService';
import type { PagoDelPedido } from '../hooks/useTrazabilidadPedido';
import type { CambioPedido } from '../hooks/useCambiosPedido';
import { IconoCabecera } from './IconoCabecera';

interface OrderPaymentsCardProps {
  order: PedidoConStock;
  pagos: PagoDelPedido[];
  /** Se cobra en la caja de la sede y aún no se ha cobrado. */
  porCobrarEnCaja: boolean;
  /** «Caja N · {sede} · abierta», ya traducido; null sin caja abierta. */
  cajaEtiqueta: string | null;
  /** Cambios de productos (link de diferencia, reembolso parcial, saldo a favor), del más reciente. */
  cambios?: CambioPedido[];
  /** Abre el link pendiente de un cambio. */
  onVerCambio?: () => void;
  /** Marca hecho un reembolso manual (sin él, no se muestra la acción). */
  onReembolsoHecho?: (id: string) => void;
  /**
   * Intentos de pago y vencimiento (`useIntentosPago`). Con ellos la tarjeta muestra el método
   * elegido y los intentos (estados A–G del diseño 2026-11-24); sin ellos, la de siempre.
   */
  intentosPago?: DatosIntentosPago;
  /** Copia de arriba en el celular con pago rechazado (el «Reenviar» va en la barra fija). */
  movil?: boolean;
  /** Contraentrega (estado F): «Ver «Pago contra entrega»» lleva a esa tarjeta. */
  onVerContraentrega?: () => void;
}

const CLAVE_ESTADO: Record<PaymentStatus, string> = {
  pending: 'porCobrar',
  paid: 'pagado',
  partial: 'parcial',
  refunded: 'reembolsado',
  failed: 'fallido',
};

const TONO_ESTADO_PEDIDO: Partial<Record<PaymentStatus, 'exito' | 'advertencia' | 'peligro'>> = {
  paid: 'exito',
  partial: 'advertencia',
  failed: 'peligro',
};

/** Procesadores de pago (Tesorería): donde se concilia lo que cobró la pasarela. */
const RUTA_PROCESADORES = '/app/finanzas/tesoreria/procesadores-pago';

/**
 * Tarjeta «Pagos» (Figma `2725:192149`, antes `1981:175699`): estado del cobro y los pagos
 * reales del pedido —pasarela con su chip, submétodo, referencia, fecha, importe y estado—,
 * uno debajo del otro. Contra entrega: «Se cobra al entregar» con la caja de la sede.
 *
 * Con `intentosPago` (diseño 2026-11-24): insignia de estado y, en los estados A–C2, E, F y G,
 * el método elegido, el vencimiento y los intentos (`CuerpoPagosIntentos`); en D (pagado) lo de
 * siempre más el historial. Fuera de esos estados, la tarjeta queda exactamente igual.
 */
export function OrderPaymentsCard({
  order,
  pagos,
  porCobrarEnCaja,
  cajaEtiqueta,
  cambios = [],
  onVerCambio,
  onReembolsoHecho,
  intentosPago,
  movil = false,
  onVerContraentrega,
}: OrderPaymentsCardProps) {
  const t = useTranslations('pedidoWeb');
  const tm = useTranslations('detallesMarca.pagos');
  const { formatDateTime, timezone } = useFormatDate(order.branch_id);
  const { formatear } = useMonedaOrganizacion();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const nombreMetodo = (codigo: string) => (t.has(`cobro.metodos.${codigo}`) ? t(`cobro.metodos.${codigo}`) : etiquetaMetodo(codigo));
  const lista = ordenarPagos(pagos);
  const conPasarela = lista.some((p) => p.pasarela && tonoEstadoPago(p.estado) === 'exito');
  // Estados A–G (diseño 2026-11-24); `null` = la tarjeta de siempre.
  const estado = intentosPago ? estadoTarjetaPagos(order, intentosPago.intentos) : null;

  const listaPagos =
    lista.length > 0 ? (
      <ul className="divide-y divide-line">
        {lista.map((p) => (
          <li key={p.id} className="py-2 first:pt-0 last:pb-0">
            <ListaDatos etiqueta={tm('pagoDe', { metodo: textoMetodoPago(p, (s) => tm(`submetodos.${s}`), nombreMetodo) })}>
              <FilaDato
                etiqueta={tm('metodo')}
                valor={
                  <span className="inline-flex min-w-0 items-center justify-end gap-1.5">
                    {p.pasarela && <ChipPasarela pasarela={p.pasarela} />}
                    <span className="truncate">{textoMetodoPago(p, (s) => tm(`submetodos.${s}`), nombreMetodo)}</span>
                  </span>
                }
                accesorio={tonoEstadoPago(p.estado) === 'exito' ? undefined : <StatusBadge estado={p.estado} tamano="sm" />}
              />
              {p.referencia && <FilaDato etiqueta={tm('referencia')} valor={<span className="font-mono text-[13px]">{p.referencia}</span>} />}
              {p.fecha && <FilaDato etiqueta={tm('fecha')} valor={formatDateTime(p.fecha)} />}
              <FilaDato
                etiqueta={tonoEstadoPago(p.estado) === 'exito' ? tm('cobrado') : tm('importe')}
                valor={formatear(p.monto)}
                tono={tonoEstadoPago(p.estado) === 'exito' ? 'fuerte' : 'neutro'}
              />
            </ListaDatos>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconoCabecera icono={CreditCard} />
          <span className="flex-1">{t('pagos.titulo')}</span>
          {estado && <InsigniaPagos estado={estado} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {intentosPago && estado && estado !== 'D' ? (
          <>
            <CuerpoPagosIntentos
              order={order}
              estado={estado}
              datos={intentosPago}
              timezone={timezone}
              movil={movil}
              onVerContraentrega={onVerContraentrega}
            />
            {/* Contraentrega con el anticipo ya cobrado: el pago real sigue aquí («Ver el anticipo»). */}
            {estado === 'F' && listaPagos}
          </>
        ) : (
          <>
            <ListaDatos>
              <FilaDato
                etiqueta={t('pagos.estado')}
                valor={t(`pagos.${CLAVE_ESTADO[order.payment_status] ?? 'porCobrar'}`)}
                tono={TONO_ESTADO_PEDIDO[order.payment_status] ?? 'fuerte'}
              />
            </ListaDatos>

            {porCobrarEnCaja && (
              <ListaDatos className="rounded-lg bg-subtle px-3 py-2">
                <FilaDato etiqueta={tm('metodo')} valor={nombreMetodo(metodoDeCobroEnCaja(order.payment_method) ?? order.payment_method ?? 'cash')} />
                <FilaDato etiqueta={tm('seCobraAlEntregar')} valor={formatear(order.total)} tono="fuerte" />
                <FilaDato etiqueta={cajaEtiqueta ?? t('pagos.sinCaja')} valor={t('pagos.sinCobrar')} tamano="sm" />
              </ListaDatos>
            )}

            {listaPagos ?? (!porCobrarEnCaja && <p className="text-sm text-fg-secondary">{t('pagos.sinPagos')}</p>)}

            {conPasarela && (
              <p className="text-[13px] text-fg-secondary">
                {tm.rich('concilia', {
                  enlace: (chunks) => (
                    <Link href={RUTA_PROCESADORES} className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}

            {/* D · pagado por pasarela: lo de hoy y, debajo, los intentos (rechazos previos incluidos). */}
            {intentosPago && estado === 'D' && (
              <HistorialIntentos
                intentos={historialIntentos('D', order, intentosPago.intentos, intentosPago.venceAt)}
                concepto="order"
                plazoMinutos={intentosPago.plazoMinutos}
                timezone={timezone}
                formatear={formatear}
              />
            )}
          </>
        )}

        {cambios
          .filter((c) => c.late_payment_at)
          .map((c) => (
            <AvisoTonal
              key={`tardio-${c.id}`}
              tono="advertencia"
              titulo={t('cambio.pagoTardio.titulo', { monto: formatear(Math.abs(Number(c.delta_total))) })}
              descripcion={t('cambio.pagoTardio.descripcion', { fecha: formatDateTime(c.late_payment_at as string) })}
            />
          ))}

        {cambios.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-secondary">{t('cambio.lineaTiempo')}</p>
            <ol className="space-y-2">
              {cambios.map((c) => {
                const delta = Number(c.delta_total);
                const fecha = c.applied_at ?? c.cancelled_at ?? c.created_at;
                return (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-fg">{t(`cambio.estados.${c.estado}`)}</span>
                      <span className="font-medium text-fg">{delta > 0 ? '+' : delta < 0 ? '−' : ''}{formatear(Math.abs(delta))}</span>
                    </div>
                    <p className="text-xs text-fg-secondary">
                      {formatDateTime(fecha)}
                      {c.refund_mode && ` · ${t(`cambio.modos.${c.refund_mode}`)}`}
                      {c.refund_status === 'manual_pending' && ` · ${t('cambio.reembolsoPendiente')}`}
                      {c.refund_status === 'done' && ` · ${t('cambio.reembolsoHecho')}`}
                    </p>
                    {c.estado === 'pending_payment' && onVerCambio && (
                      <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={onVerCambio}>
                        {t('cambio.verLink')}
                      </button>
                    )}
                    {c.refund_status === 'manual_pending' && onReembolsoHecho && (
                      <button type="button" className="text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => onReembolsoHecho(c.id)}>
                        {t('cambio.marcarReembolsoHecho')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
