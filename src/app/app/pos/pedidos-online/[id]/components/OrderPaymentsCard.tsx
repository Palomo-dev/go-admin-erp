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

interface OrderPaymentsCardProps {
  order: WebOrder;
  pagos: PagoDelPedido[];
  /** Se cobra en la caja de la sede y aún no se ha cobrado. */
  porCobrarEnCaja: boolean;
  /** «Caja N · {sede} · abierta», ya traducido; null sin caja abierta. */
  cajaEtiqueta: string | null;
}

const CLAVE_ESTADO: Record<PaymentStatus, string> = {
  pending: 'porCobrar',
  paid: 'pagado',
  partial: 'parcial',
  refunded: 'reembolsado',
  failed: 'fallido',
};

/** Tarjeta «Pagos» (Figma 1981:175699): estado del cobro y pagos reales del pedido. */
export function OrderPaymentsCard({ order, pagos, porCobrarEnCaja, cajaEtiqueta }: OrderPaymentsCardProps) {
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
              etiqueta={`${nombreMetodo(metodoDeCobroEnCaja(order.payment_method))} · ${t('pagos.alEntregar')}`}
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
      </CardContent>
    </Card>
  );
}
