'use client';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Ban, Mail, MessageSquare, Phone, RefreshCw } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import type { CifrasSegmento } from '@/lib/services/crm/segmentosAudiencia';
import type { ClienteSegmento } from '@/lib/services/crm/segmentosLogica';
export function SegmentoPreview({ filter }: { filter: unknown }) {
  const t = useTranslations('crm.segmentosNuevo');
  const formatter = useFormatter();
  const { organization } = useOrganization();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: boolean; data: { counts: CifrasSegmento; samples: ClienteSegmento[] } | null }>({ loading: true, error: false, data: null });
  const serialized = JSON.stringify(filter);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState({ loading: true, error: false, data: null });
    const debounce = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 5000);
      void pedirCrm<{ counts: CifrasSegmento; samples: ClienteSegmento[] }>('/api/crm/segments/preview', {
        method: 'POST', cuerpo: { filter_json: JSON.parse(serialized) }, signal: controller.signal,
      }).then(({ data }) => { if (!cancelled) setState({ loading: false, error: false, data }); })
        .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); })
        .finally(() => clearTimeout(timeout));
    }, 400);
    return () => { cancelled = true; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [serialized, revision, organization?.id]);
  const counts = state.data?.counts;
  const number = (value?: number) => typeof value === 'number' ? formatter.number(value, { useGrouping: true }) : '—';
  const channels = [
    { icon: Phone, label: t('voiceContactable'), value: counts?.voice_contactable },
    { icon: Ban, label: t('rne'), value: counts?.rne_excluded },
    { icon: Mail, label: t('email'), value: counts?.email_contactable },
    { icon: MessageSquare, label: t('whatsapp'), value: counts?.whatsapp_contactable },
  ];
  return <aside className="space-y-3" aria-label={t('preview')} aria-busy={state.loading}>
    <div className={`space-y-2 rounded-xl p-4 ${state.error ? 'bg-warning-subtle text-warning-text' : 'border border-line-brand bg-brand-tint text-fg'}`}>
      <div className="flex items-center justify-between text-xs leading-4 text-fg-secondary"><span>{t('total')}</span><RefreshCw className="size-4 text-brand" aria-hidden="true" strokeWidth={1.5} /></div>
      {state.error ? <div role="alert" className="space-y-2 text-[13px] leading-[18px]"><p>{t('previewError')}</p><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setRevision(n => n + 1)}><RefreshCw className="size-4" aria-hidden="true" strokeWidth={1.5} />{t('retry')}</button></div>
        : state.loading ? <Skeleton className="h-9 w-2/3" /> : <><p className="text-[28px] font-semibold leading-9 tabular-nums">{t('matchCustomers', { n: number(counts?.total) })}</p><p className="text-xs leading-4 text-fg-secondary">{counts ? t('matchBase', { n: number(counts.base), pct: formatter.number(counts.base > 0 ? counts.total / counts.base : 0, { style: 'percent', maximumFractionDigits: 1 }) }) : '—'}</p></>}
    </div>
    <section className={`space-y-3 rounded-xl border border-line bg-surface p-4 ${state.error ? 'opacity-50' : ''}`} aria-label={t('contactable')}>
      <h2 className="text-base font-semibold leading-[22px] text-fg">{t('contactable')}</h2>
      {channels.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center justify-between gap-3 text-[13px] leading-[18px] text-fg"><span className="flex items-center gap-2"><Icon className="size-4 text-fg-secondary" aria-hidden="true" strokeWidth={1.5} />{label}</span><span className="tabular-nums">{state.loading ? <Skeleton className="h-4 w-10" /> : number(value)}</span></div>)}
    </section>
    {!state.error && <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="mb-2 text-base font-semibold leading-[22px] text-fg">{t('samples')}</h3>
      {state.loading ? <Skeleton className="h-28 w-full" /> : <ul className="space-y-3">
        {state.data?.samples.map(c => <li key={c.id} className="text-[13px] leading-[18px] text-fg-secondary"><p>{c.full_name || '—'}{c.city ? ` · ${c.city}` : ''}</p></li>)}
      </ul>}
    </div>}
  </aside>;
}
