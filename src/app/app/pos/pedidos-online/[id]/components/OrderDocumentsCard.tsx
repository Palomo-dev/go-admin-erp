'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilaDato, ListaDatos } from '@/components/kit';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderDocumentsCardProps {
  order: WebOrder;
  factura: { id: string; numero: string | null } | null;
  comandaId: number | null;
  /** «Caja N · {sede} · abierta», ya traducido; null sin caja abierta. */
  cajaEtiqueta: string | null;
}

/**
 * Tarjeta «Documentos y trazabilidad» (Figma 1981:175699): venta POS,
 * factura, comanda, origen y caja del pedido, con los datos de la base.
 * Origen y caja en texto normal.
 */
export function OrderDocumentsCard({ order, factura, comandaId, cajaEtiqueta }: OrderDocumentsCardProps) {
  const t = useTranslations('pedidoWeb');
  const canal = t.has(`detalle.canales.${order.source}`) ? t(`detalle.canales.${order.source}`) : order.source;
  const pendiente = 'text-fg-muted';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
          <FileText className="h-4 w-4 dark:text-gray-300" aria-hidden="true" />
          {t('documentos.titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ListaDatos>
          <FilaDato
            etiqueta={t('documentos.venta')}
            valor={
              order.sale_id ? (
                <Link href={`/app/pos/ventas/${order.sale_id}`} className="text-brand hover:underline">
                  {t('detalle.verVenta')}
                </Link>
              ) : (
                <span className={pendiente}>{t('documentos.seCreaAlConfirmar')}</span>
              )
            }
          />
          <FilaDato
            etiqueta={t('documentos.factura')}
            valor={factura?.numero ? factura.numero : <span className={pendiente}>{t('documentos.seEmiteAlCobrar')}</span>}
          />
          <FilaDato
            etiqueta={t('documentos.comanda')}
            valor={comandaId ? t('documentos.comandaValor', { id: comandaId }) : <span className={pendiente}>{t('documentos.sinComanda')}</span>}
          />
          <FilaDato etiqueta={t('documentos.origen')} valor={t('documentos.origenValor', { canal, numero: order.order_number })} />
          <FilaDato etiqueta={t('documentos.caja')} valor={cajaEtiqueta ?? t('documentos.sinCaja')} />
        </ListaDatos>
      </CardContent>
    </Card>
  );
}
