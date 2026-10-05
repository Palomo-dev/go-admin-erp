'use client';
import { useTranslations, useFormatter } from 'next-intl';
import { StatCard } from '@/components/kit/StatCard';
import type { CifrasSegmento } from '@/lib/services/crm/segmentosAudiencia';
export function SegmentoCifras({ counts, loading }: { counts: CifrasSegmento | null; loading?: boolean }) {
  const t = useTranslations('crm.segmentosNuevo');
  const formatter = useFormatter();
  const number = (n: number | undefined) => n === undefined ? '—' : formatter.number(n, { useGrouping: true });
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard etiqueta={t('total')} valor={number(counts?.total)} cargando={loading}
      detalle={counts ? `${formatter.number(counts.base > 0 ? counts.total / counts.base : 0, { style: 'percent', maximumFractionDigits: 2 })} · ${t('base')}` : undefined} />
    <StatCard etiqueta={t('voiceContactable')} valor={number(counts?.voice_contactable)} cargando={loading}
      detalle={counts ? `${number(counts.with_phone)} · ${t('phone')} · ${number(counts.rne_excluded)} · ${t('rne')}` : undefined} />
    <StatCard etiqueta={t('email')} valor={number(counts?.email_contactable)} cargando={loading} />
    <StatCard etiqueta={t('whatsapp')} valor={number(counts?.whatsapp_contactable)} cargando={loading} />
  </div>;
}
