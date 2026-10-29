'use client';

import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilaDato, ListaDatos } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { metodoDeCobroEnCaja } from '@/lib/pos/pedidosWeb/metodosCaja';
import type { PaymentStatus, WebOrder } from '@/lib/services/webOrdersService';
import type { PagoDelPedido } from '../hooks/useTrazabilidadPedido';
import type { CambioPedido } from '../hooks/useCambiosPedido';

interface OrderPaymentsCardProps {
  order: WebOrder;
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
}

const CLAVE_ESTADO: Record<PaymentStatus, string> = {
  pending: 'porCobrar',
  paid: 'pagado',
  partial: 'parcial',
  refunded: 'reembolsado',
  failed: 'fallido',
};

/** Tarjeta «Pagos» (Figma 1981:175699): estado del cobro y pagos reales del pedido. */
export function OrderPaymentsCard({ order, pagos, porCobrarEnCaja, cajaEtiqueta, cambios = [], onVerCambio, onReembolsoHecho }: OrderPaymentsCardProps) {
  const t = useTranslations('pedidoWeb');
  const { formatDateTime } = useFormatDate(order.branch_id);
  const { formatear } = useMonedaOrganizacion();
  const nombreMetodo = (codigo: string) => (t.has(`cobro.metodos.${codigo}`) ? t(`cobro.metodos.${codigo}`) : codigo);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
          <CreditCard className="h-4 w-4 dark:text-gray-300" aria-hidden="true" />
          {t('pagos.titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ListaDatos>
          <FilaDato
            etiqueta={t('pagos.estado')}
            valor={t(`pagos.${CLAVE_ESTADO[order.payment_status] ?? 'porCobrar'}`)}
            tono="fuerte"
          />
        </ListaDatos>

        {porCobrarEnCaja && (
          <ListaDatos className="rounded-lg bg-subtle px-3 py-2">
            <FilaDato
              etiqueta={`${nombreMetodo(metodoDeCobroEnCaja(order.payment_method) ?? order.payment_method ?? 'cash')} · ${t('pagos.alEntregar')}`}
              valor={formatear(order.total)}
              tono="fuerte"
            />
            <FilaDato
              etiqueta={cajaEtiqueta ?? t('pagos.sinCaja')}
              valor={t('pagos.sinCobrar')}
              tamano="sm"
            />
          </ListaDatos>
        )}

        {pagos.length > 0 ? (
          <ListaDatos>
            {pagos.map((p) => (
              <FilaDato
                key={p.id}
                etiqueta={nombreMetodo(p.metodo)}
                valor={formatear(p.monto)}
                descripcion={p.fecha ? formatDateTime(p.fecha) : undefined}
              />
            ))}
          </ListaDatos>
        ) : (
          !porCobrarEnCaja && <p className="text-sm text-fg-secondary">{t('pagos.sinPagos')}</p>
        )}

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
