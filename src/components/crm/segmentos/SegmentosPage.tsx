'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useFormatter } from 'next-intl';
import { Users, Plus, RefreshCw, Upload, Copy, Trash2, Send, Pencil } from 'lucide-react';
import { useMigasAreaCrm } from '../campanas/migasCrm';
import { PageHeader } from '@/components/kit/PageHeader';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { SearchInput } from '@/components/kit/SearchInput';
import { EmptyState } from '@/components/kit/EmptyState';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { BadgeTono } from '@/components/kit/BadgeTono';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { Pagination } from '@/components/kit/Pagination';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { useRouter } from 'next/navigation';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { useSegmentosData } from './useSegmentosData';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { SegmentoEstadoRecuento } from './SegmentoEstadoRecuento';
function SegmentosContent() {
  const migas = useMigasAreaCrm('/app/crm/segmentos');
  const t = useTranslations('crm.segmentosNuevo');
  const formatter = useFormatter();
  const router = useRouter();
  const { formatDateTime } = useFormatDate(null);
  const [q, setQ] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<SegmentoRegistro | null>(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, canManage } = useSegmentosData<SegmentoRegistro[]>('/api/crm/segments', revision);
  const intent = useRef<AbortController | null>(null);
  useEffect(() => () => intent.current?.abort(), []);
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
    if (!canManage || intent.current) return;
    const controller = new AbortController(); intent.current = controller;
    setBusy(true); setActionError(null);
    try {
      await pedirCrm(`/api/crm/segments/${s.id}${kind === 'duplicate' ? '/duplicate' : ''}`, { method: kind === 'delete' ? 'DELETE' : 'POST', signal: controller.signal,
        cuerpo: kind === 'delete' ? { expected_updated_at: s.updated_at } : { name: t('copyName', { name: s.name }).slice(0, 120) } });
      if (!controller.signal.aborted) { setTarget(null); refresh(); }
    } catch (e) { if (!controller.signal.aborted) setActionError(e instanceof ErrorApiCrm && e.status === 409 ? t('conflict') : t('actionError')); }
    finally { intent.current = null; if (!controller.signal.aborted) setBusy(false); }
  };
  const rowActions = (s: SegmentoRegistro) => [
    { id: 'edit', etiqueta: t('edit'), icono: Pencil, onSelect: () => router.push(`/app/crm/segmentos/${s.id}?edit=1`), oculta: !canManage },
    { id: 'campaign', etiqueta: t('useCampaign'), icono: Send, onSelect: () => router.push(`/app/crm/campanas/nuevo?segment_id=${s.id}`) },
    { id: 'duplicate', etiqueta: t('duplicate'), icono: Copy, onSelect: () => void action(s, 'duplicate'), oculta: !canManage, deshabilitada: busy, motivo: t('saving') },
    { id: 'delete', etiqueta: t('delete'), icono: Trash2, onSelect: () => setTarget(s), oculta: !canManage, destructiva: true, deshabilitada: busy, motivo: t('saving') },
  ];
  const columns: ColumnaTabla<SegmentoRegistro>[] = [
    { id: 'name', encabezado: t('title'), ancho: '26%', celda: s => <div><Link href={`/app/crm/segmentos/${s.id}`} className="font-medium text-fg hover:text-link hover:underline">{s.name}</Link><p className="mt-0.5 truncate text-[13px] leading-[18px] text-fg-secondary">{s.description || '—'}</p></div> },
    { id: 'type', encabezado: t('type'), ancho: '11%', celda: s => <BadgeTono tono={s.is_dynamic === false ? 'neutro' : 'marca'}>{t(s.is_dynamic === false ? 'static' : 'dynamic')}</BadgeTono> },
    { id: 'count', encabezado: t('customers'), ancho: '10%', celda: s => <span className="tabular-nums text-fg-secondary">{s.last_run_at ? formatter.number(s.customer_count, { useGrouping: true }) : '—'}</span> },
    { id: 'channels', encabezado: t('contactable'), ancho: '20%', celda: s => <SegmentoEstadoRecuento segment={s} onlyChannels /> },
    { id: 'updated', encabezado: t('updated'), ancho: '14%', celda: s => <span className="text-[13px] leading-[18px] text-fg-secondary">{formatDateTime(s.updated_at)}</span> },
    { id: 'usage', encabezado: t('usedIn'), celda: s => s.usage ? <span className="text-[13px] leading-[18px] text-fg-secondary">{s.usage.campaigns + s.usage.voice_campaigns ? t('campaignUsage', { count: s.usage.campaigns + s.usage.voice_campaigns }) : s.usage.sequences ? t('sequenceUsage', { count: s.usage.sequences }) : <BadgeTono tono="neutro">{t('unused')}</BadgeTono>}</span> : '—' },
  ];
  const actions = <>{canManage && <><Link href="/app/crm/segmentos/nuevo?import=1" className={clasesBoton({ variante: 'secundario' })}><Upload className="size-4" aria-hidden="true" />{t('import')}</Link>
      <Link href="/app/crm/segmentos/nuevo" className={clasesBoton()}><Plus className="size-4" aria-hidden="true" />{t('new')}</Link></>}<RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('title')} acciones={[{ id: 'refresh', etiqueta: t('retry'), icono: RefreshCw, onSelect: refresh }]} /></>;
  return <div className="space-y-4 bg-canvas p-4 sm:p-6">
    <PageHeader migas={migas} titulo={t('title')} subtitulo={t('subtitle')} icono={Users} acciones={actions} />
    {(loading || error || (data?.length ?? 0) > 0) && <div className="flex flex-wrap items-center gap-2"><SearchInput etiqueta={t('search')} placeholder={t('search')} pistaAtajo={false} className="min-w-48 flex-1" value={q} onChange={v => { setQ(v); setPage(1); }} />
      <ChipsOpcion etiqueta={t('type')} valor={type} onValorChange={v => { setType(v); setPage(1); }} opciones={[{ valor: 'all', etiqueta: t('all') }, { valor: 'dynamic', etiqueta: t('dynamic') }, { valor: 'static', etiqueta: t('static') }]} /></div>}
    {actionError && <p role="alert" className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">{actionError}</p>}
    {error ? <EmptyState variante={[401, 403].includes(error.status) ? 'forbidden' : 'error'} titulo={t('error')} accionPrimaria onReintentar={refresh} className="rounded-xl border border-line bg-surface min-h-[370px] pt-24 pb-12 [&>div:last-child]:mt-12" />
      : !loading && !data?.length ? <EmptyState icono={Users} titulo={t('empty')} descripcion={t('emptyHelp')} accion={canManage ? { etiqueta: t('new'), href: '/app/crm/segmentos/nuevo', icono: Plus } : undefined} className="rounded-xl border border-line bg-surface min-h-[390px] pt-24 pb-12 [&>div:last-child]:mt-12" />
      :     <DataTable columnas={columns} filas={rows.slice((page - 1) * 25, page * 25)} obtenerId={s => s.id} etiqueta={t('title')} etiquetaFila={s => s.name}
      estado={loading ? 'cargando' : rows.length ? 'listo' : data?.length ? 'sinResultados' : 'vacio'}
      onFilaClick={s => router.push(`/app/crm/segmentos/${s.id}`)} acciones={rowActions} altoFila={59} filasEsqueleto={6} mostrarCabeceraCargando={false} altoFilaEsqueleto={48} varianteEsqueleto="figma"
      error={{ titulo: t('error'), accionPrimaria: true, className: 'min-h-[370px]'  }} sinPermiso={{ titulo: t('forbidden') }}
      vacio={{ titulo: t('empty'), className: 'min-h-[390px]', icono: Users, descripcion: t('emptyHelp'), accion: canManage ? { etiqueta: t('new'), href: '/app/crm/segmentos/nuevo', icono: Plus } : undefined, accionPrimaria: true }}
      sinResultados={{ titulo: t('noResults') }} onReintentar={refresh} onLimpiarFiltros={() => { setQ(''); setType('all'); setPage(1); }}
      tarjetaMovil={s => <div><p className="font-medium">{s.name}</p><p className="mt-1 text-xs text-fg-secondary">{s.description}</p><div className="mt-2"><SegmentoEstadoRecuento segment={s} /></div></div>}
      pie={rows.length > 25 ? <Pagination pagina={page} tamano={25} total={rows.length} onPaginaChange={setPage} layout="compact" densidad="compacta" /> : undefined} pieFuera />}
    <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
    <Dialogo abierto={!!target} onAbiertoChange={open => { if (!open) setTarget(null); }} titulo={t('delete')} descripcion={t('deleteWarning')}
      primario={{ etiqueta: t('delete'), cargando: busy, destructiva: true, onClick: () => { if (target) void action(target, 'delete'); } }} />
  </div>;
}
export function SegmentosPage() {
  const { organization } = useOrganization();
  return <SegmentosContent key={organization?.id ?? 'sin-org'} />;
}
