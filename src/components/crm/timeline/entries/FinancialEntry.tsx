'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFechasFicha } from '@/components/clientes/id/useFechasFicha';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';

type Financial = Extract<TimelineEntry, { kind: 'sale' | 'reservation' | 'web_order' }>;

/** Detalle conservado del historial comercial; ningún cálculo contable nuevo. */
export function FinancialEntry({ entry }: { entry: Financial }) {
  const t = useTranslations('clientes.ficha');
  const { formatear, resuelta } = useMonedaOrganizacion();
  const { instante, plana, locale } = useFechasFicha();
  const f = entry.financial;
  const monto = (valor: string | number | null) => valor === null ? '—' : resuelta ? formatear(valor) : new Intl.NumberFormat(locale).format(Number(valor));
  const traducir = (categoria: string, estado: string | null) => estado && t.has(`actividad.${categoria}.${estado}`) ? t(`actividad.${categoria}.${estado}`) : estado ?? t('actividad.noAplica');
  const href = entry.kind === 'sale' ? `/app/pos/ventas/${f.source_id}` : entry.kind === 'web_order' ? `/app/pos/pedidos-online/${f.source_id}` : `/app/pms/reservas/${f.source_id}`;
  const titulo = entry.kind === 'sale' ? t('actividad.titulos.venta', { numero: f.reference })
    : entry.kind === 'web_order' ? t('actividad.titulos.pedidoWeb', { numero: f.reference })
    : t('actividad.titulos.reserva', { fecha: instante(entry.occurred_at) });
  return (
    <div className="space-y-2 text-xs text-fg-secondary">
      <Link href={href} className="text-sm font-medium text-brand-deep hover:underline">{titulo}</Link>
      <p>{t('actividad.monto', { monto: monto(f.amount) })}</p>
      <div className="flex flex-wrap gap-1.5">
        {f.status && <Badge tono="neutro" tamano="sm">{traducir(entry.kind === 'web_order' ? 'estadosPedido' : 'estadosPago', f.status)}</Badge>}
        {f.payment_status && <Badge tono="informacion" tamano="sm">{t('actividad.pago', { pago: traducir('estadosPago', f.payment_status) })}</Badge>}
        {f.delivery_type && <span>{traducir('estadosPedido', f.delivery_type)}</span>}
      </div>
      {f.notes && <HtmlContentRenderer html={f.notes} className="text-xs text-fg-secondary" />}
      {f.checkin && f.checkout && <p>{plana(f.checkin)} → {plana(f.checkout)}</p>}
      {entry.kind === 'reservation' && (!f.checkin || !f.checkout) && f.end_at && <p>{instante(entry.occurred_at)} → {instante(f.end_at)}</p>}
      {f.spaces.length > 0 && <div className="flex flex-wrap gap-1.5"><span>{t('actividad.espacios')}</span>{f.spaces.map(s => <Badge key={s.id} tono="neutro" tamano="sm">{[s.label, s.type].filter(Boolean).join(' · ')}</Badge>)}</div>}
      {f.folios.map(folio => (
        <div key={folio.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <span>{t('actividad.folioItems', { count: folio.items_count })}</span>
          {folio.pending_count > 0 ? <Badge tono="advertencia" tamano="sm">{t('actividad.folioPendientes', { count: folio.pending_count, monto: monto(folio.pending_amount) })}</Badge>
            : folio.items_count > 0 ? <Badge tono="exito" tamano="sm">{t('actividad.todoPagado')}</Badge> : <span>{t('actividad.sinConsumos')}</span>}
          <span>{t('actividad.saldo', { monto: monto(folio.balance) })}</span>
          <Link href={`/app/pms/folios?reservation=${f.source_id}&folio=${folio.id}`} className="ml-auto text-brand-deep hover:underline">{t('actividad.verFolio')}</Link>
        </div>
      ))}
    </div>
  );
}
