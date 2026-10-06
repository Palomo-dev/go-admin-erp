'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, MapPin, MessageSquare, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { clasesBoton } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { esDomicilio } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderCustomerCardProps {
  order: WebOrder;
}

/**
 * Cliente del pedido (Figma 1981:175699): nombre, teléfono, correo,
 * documento y pedidos anteriores, con la ficha del cliente y su conversación.
 */
export function OrderCustomerCard({ order }: OrderCustomerCardProps) {
  const t = useTranslations('pedidoWeb.ficha');
  const { timezone } = useOrgTimezone();
  const nombre = order.customer_name || order.customer?.full_name || t('clienteAnonimo');
  const telefono = order.customer_phone || order.customer?.phone;
  const correo = order.customer_email || order.customer?.email;
  const documento = [order.customer?.doc_type, order.customer?.doc_number].filter(Boolean).join(' ');
  const [anteriores, setAnteriores] = useState<{ n: number; ultimo: string | null } | null>(null);

  useEffect(() => {
    if (!order.customer_id) return;
    let vivo = true;
    supabase
      .from('web_orders')
      .select('created_at', { count: 'exact' })
      .eq('organization_id', order.organization_id)
      .eq('customer_id', order.customer_id)
      .neq('id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data, count }) => {
        if (vivo) setAnteriores({ n: count ?? 0, ultimo: data?.[0]?.created_at ?? null });
      });
    return () => {
      vivo = false;
    };
  }, [order.customer_id, order.organization_id, order.id]);

  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-fg-secondary">{etiqueta}</span>
      <span className="min-w-0 break-words text-right text-fg">{valor}</span>
    </div>
  );
  const direccion = esDomicilio(order.delivery_type) && order.delivery_address
    ? [order.delivery_address.address, order.delivery_address.neighborhood, order.delivery_address.city].filter(Boolean).join(', ')
    : '';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="size-4" aria-hidden="true" strokeWidth={1.5} />
          {t('cliente')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {fila(t('nombre'), <span className="font-semibold">{nombre}</span>)}
        {telefono && fila(t('telefono'), <a href={`tel:${telefono}`} className="text-link hover:underline">{telefono}</a>)}
        {correo && fila(t('correo'), <a href={`mailto:${correo}`} className="text-link hover:underline">{correo}</a>)}
        {documento && fila(t('documento'), documento)}
        {anteriores && fila(
          t('pedidosAnteriores'),
          anteriores.n > 0 && anteriores.ultimo
            ? t('anterioresValor', { n: anteriores.n, fecha: formatDateInTz(anteriores.ultimo, timezone) })
            : t('primerPedido'),
        )}
        {direccion && (
          <p className="flex items-start gap-2 border-t border-line pt-2 text-[13px] text-fg">
            <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span>{direccion}</span>
          </p>
        )}
        {order.customer_id && (
          <div className="flex gap-2 pt-1">
            <Link href={`/app/clientes/${order.customer_id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'flex-1' })}>
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('verFicha')}
            </Link>
            <Link
              href={`/app/crm/clientes/${order.customer_id}`}
              aria-label={t('conversacion')}
              title={t('conversacion')}
              className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-8 px-0' })}
            >
              <MessageSquare className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
