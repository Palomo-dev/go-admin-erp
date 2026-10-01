'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { Users, Plus, RefreshCw, Upload } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { Pagination } from '@/components/kit/Pagination';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { useSegmentosData } from './useSegmentosData';
import { SegmentoEstadoRecuento } from './SegmentoEstadoRecuento';
export function SegmentosPage() {
  const t = useTranslations('crm.segmentosNuevo');
  const formatter = useFormatter();
  const { formatDateTime } = useFormatDate(null);
  const [q, setQ] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<SegmentoRegistro | null>(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, canManage } = useSegmentosData<SegmentoRegistro[]>('/api/crm/segments', revision);
  const waitingForCount = data?.some(s => !!s.count_job_id) === true;
  useEffect(() => {
    if (!waitingForCount) return;
    const timer = setInterval(() => setRevision(n => n + 1), 15000);
    return () => clearInterval(timer);
  }, [waitingForCount]);
  const rows = (data ?? []).filter(s => (!q || `${s.name} ${s.description ?? ''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())) &&
    (type === 'all' || (type === 'dynamic' ? s.is_dynamic !== false : s.is_dynamic === false)));
  const refresh = () => setRevision(n => n + 1);
  const action = async (s: SegmentoRegistro, kind: 'delete' | 'duplicate') => {
    setBusy(true); setActionError(null);
    try {
      await pedirCrm(`/api/crm/segments/${s.id}${kind === 'duplicate' ? '/duplicate' : ''}`, { method: kind === 'delete' ? 'DELETE' : 'POST',
        cuerpo: kind === 'delete' ? { expected_updated_at: s.updated_at } : { name: t('copyName', { name: s.name }).slice(0, 120) } });
      setTarget(null); refresh();
    } catch (e) { setActionError(e instanceof ErrorApiCrm && e.status === 409 ? t('conflict') : t('actionError')); }
    finally { setBusy(false); }
  };
  const actions = <><button className={clasesBoton({ variante: 'secundario' })} onClick={refresh} aria-label={t('retry')}><RefreshCw className="size-4" /></button>
    {canManage && <><Link href="/app/crm/segmentos/nuevo?import=1" className={clasesBoton({ variante: 'secundario' })}><Upload className="size-4" aria-hidden="true" />{t('import')}</Link>
      <Link href="/app/crm/segmentos/nuevo" className={clasesBoton()}><Plus className="size-4" aria-hidden="true" />{t('new')}</Link></>}</>;
  return <div className="space-y-5">
    <PageHeader titulo={t('title')} subtitulo={t('subtitle')} icono={Users} acciones={actions} />
    <div className="flex flex-wrap gap-3"><input aria-label={t('search')} placeholder={t('search')} className={`${CLASE_CAMPO} min-w-48 flex-1`} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
      <SegmentedControl etiqueta={t('type')} valor={type} onValorChange={v => { setType(v); setPage(1); }} opciones={[{ valor: 'all', etiqueta: t('all') }, { valor: 'dynamic', etiqueta: t('dynamic') }, { valor: 'static', etiqueta: t('static') }]} /></div>
    {actionError && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{actionError}</p>}
    {loading ? <div className="space-y-3 rounded-xl border border-line bg-surface p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      : error ? <EmptyState className="rounded-xl border border-line bg-surface" variante={[401, 403].includes(error.status) ? 'forbidden' : 'error'} titulo={t([401, 403].includes(error.status) ? 'forbidden' : 'error')} onReintentar={refresh} />
      : !rows.length ? <EmptyState className="rounded-xl border border-line bg-surface" variante={data?.length ? 'search' : 'empty'} titulo={t(data?.length ? 'noResults' : 'empty')} descripcion={data?.length ? undefined : t('emptyHelp')}
        onLimpiarFiltros={() => { setQ(''); setType('all'); setPage(1); }} accion={!data?.length && canManage ? { etiqueta: t('new'), href: '/app/crm/segmentos/nuevo' } : undefined} />
      : <><div className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.slice((page - 1) * 25, page * 25).map(s => <article key={s.id} className="grid items-center gap-3 p-4 text-sm md:grid-cols-[minmax(0,2fr)_1fr_1fr_minmax(0,2fr)]">
          <div className="space-y-2"><div><Link href={`/app/crm/segmentos/${s.id}`} className="font-semibold text-link hover:underline">{s.name}</Link><p className="mt-1 truncate text-xs text-fg-secondary">{s.description || '—'}</p></div><SegmentoEstadoRecuento segment={s} /></div>
          <div className="text-fg"><span className="rounded-md bg-brand-tint px-2 py-1 text-xs text-brand-deep">{t(s.is_dynamic === false ? 'static' : 'dynamic')}</span>
            <p className="mt-2 text-xs text-fg-secondary">{t('lastCount')}: {s.last_run_at ? formatter.number(s.customer_count) : '—'}</p></div>
          <p className="text-xs text-fg-secondary">{t('updated')}<br />{formatDateTime(s.updated_at)}</p>
          <div className="flex flex-wrap justify-end gap-2"><Link href={`/app/crm/campanas/nuevo?segment_id=${s.id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>{t('useCampaign')}</Link>
            {canManage && <><button disabled={busy} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => void action(s, 'duplicate')}>{t('duplicate')}</button>
              <button disabled={busy} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setTarget(s)}>{t('delete')}</button></>}</div>
        </article>)}
      </div><Pagination pagina={page} tamano={25} total={rows.length} onPaginaChange={setPage} /></>}
    <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
    <Dialogo abierto={!!target} onAbiertoChange={open => { if (!open) setTarget(null); }} titulo={t('delete')} descripcion={t('deleteWarning')}
      primario={{ etiqueta: t('delete'), cargando: busy, destructiva: true, onClick: () => { if (target) void action(target, 'delete'); } }} />
  </div>;
}
