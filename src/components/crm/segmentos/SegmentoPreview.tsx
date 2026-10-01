'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import type { CifrasSegmento } from '@/lib/services/crm/segmentosAudiencia';
import type { ClienteSegmento } from '@/lib/services/crm/segmentosLogica';
import { SegmentoCifras } from './SegmentoCifras';
export function SegmentoPreview({ filter }: { filter: unknown }) {
  const t = useTranslations('crm.segmentosNuevo');
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
  return <aside className="space-y-4" aria-label={t('preview')} aria-busy={state.loading}>
    <h2 className="text-base font-semibold text-fg">{t('preview')}</h2>
    {state.error ? <div role="alert" className="space-y-3 rounded-lg border border-line-warning bg-warning-subtle p-4 text-sm text-warning-text">
      <p>{t('previewError')}</p><button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setRevision(n => n + 1)}>{t('retry')}</button>
    </div> : <SegmentoCifras counts={state.data?.counts ?? null} loading={state.loading} />}
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-fg">{t('samples')}</h3>
      {state.loading ? <Skeleton className="h-28 w-full" /> : <ul className="space-y-3">
        {state.data?.samples.map(c => <li key={c.id} className="text-sm text-fg"><p>{c.full_name || '—'}</p><p className="text-xs text-fg-secondary">{c.city || '—'} · {c.email || '—'}</p></li>)}
      </ul>}
    </div>
  </aside>;
}
