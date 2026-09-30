'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { diaRelativo, diasEntrePlanos, fechaCortaInstante, fechaCortaPlana, horaEnZona } from '@/components/crm/kit/fechasCrm';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OportunidadDetalleApi } from './apiOportunidades';

/**
 * Franja de 6 métricas del detalle (Figma 775:473076): monto (moneda y
 * líneas), probabilidad de la etapa, ponderado (monto × probabilidad),
 * cierre esperado (días desde hoy en la zona de la organización),
 * responsable con su comisión y próximo contacto.
 */
export function MetricasOportunidad({ op, usuarios, lineas, ahora = new Date() }: { op: OportunidadDetalleApi; usuarios: readonly OpcionUsuario[]; lineas: number; ahora?: Date }) {
  const t = useTranslations('crm.oportunidad.metricas');
  const idioma = useLocale();
  const { timezone, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion().paraDocumento(op.currency);
  const prob = typeof op.etapa?.probability === 'number' ? op.etapa.probability : null;
  const monto = Number(op.amount) || 0;
  const dias = op.expected_close_date ? diasEntrePlanos(getToday(), op.expected_close_date) : null;
  const prox = diaRelativo(op.next_contact_at, ahora, timezone);
  const proximo = !op.next_contact_at ? '—' : prox?.tipo === 'hoy' ? t('hoy', { hora: prox.hora }) : prox?.tipo === 'manana' ? t('manana', { hora: prox.hora }) : `${fechaCortaInstante(op.next_contact_at, timezone, idioma)} ${horaEnZona(op.next_contact_at, timezone)}`;
  const celdas: { etiqueta: string; valor: string; detalle?: string | null }[] = [
    { etiqueta: t('monto'), valor: formatMoneda(monto, moneda), detalle: t('montoDetalle', { moneda: moneda.code, n: lineas }) },
    { etiqueta: t('probabilidad'), valor: prob === null ? '—' : `${prob} %`, detalle: t('deLaEtapa') },
    { etiqueta: t('ponderado'), valor: prob === null ? '—' : formatMoneda((monto * prob) / 100, moneda), detalle: t('ponderadoDetalle') },
    { etiqueta: t('cierre'), valor: op.expected_close_date ? fechaCortaPlana(op.expected_close_date, idioma, true) : '—', detalle: dias === null ? null : dias >= 0 ? t('enDias', { n: dias }) : t('haceDias', { n: -dias }) },
    { etiqueta: t('responsable'), valor: nombreUsuario(usuarios, op.salesperson_id) ?? t('sinResponsable'), detalle: Number(op.commission_rate) > 0 ? t('comision', { pct: Number(op.commission_rate) }) : null },
    { etiqueta: t('proximo'), valor: proximo, detalle: op.next_action ?? null },
  ];
  return (
    <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3 xl:grid-cols-6">
      {celdas.map((c) => (
        <div key={c.etiqueta} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs text-fg-secondary">{c.etiqueta}</dt>
          <dd className="truncate text-base font-semibold text-fg">{c.valor}</dd>
          {c.detalle && <dd className="truncate text-xs text-fg-muted">{c.detalle}</dd>}
        </div>
      ))}
    </dl>
  );
}
