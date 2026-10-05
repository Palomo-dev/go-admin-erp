'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Pencil, Play, ExternalLink, Calendar, ClipboardList, StickyNote, GitBranch, Ban } from 'lucide-react';
import { PageHeader, DataTable, EmptyState, Tarjeta, KpiStrip, StatCard, StatusBadge, AvatarIniciales, PaginationCompact, type ColumnaTabla } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { VoiceAgentMetrics } from '@/lib/services/crm/voiceAgentMetrics';
const TOOL_ICONS: Record<string, typeof Bot> = { book_meeting: Calendar, create_task: ClipboardList, log_objection: StickyNote, move_opportunity_stage: GitBranch, log_consent_opt_out: Ban };
export function AgentMetricsPanel({ agent, onClose, onEdit, onTest }: { agent: { id: string; name: string }; onClose: () => void; onEdit?: () => void; onTest?: () => void }) {
  const t = useTranslations('crm.agentesIa'); const { timezone } = useOrgTimezone(); const locale = useLocaleIntl();
  const [period, setPeriod] = useState('30d'), [offset, setOffset] = useState(0), [data, setData] = useState<VoiceAgentMetrics | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const revision = useRef(0);
  const invalidate = useCallback(() => { revision.current++; }, []);
  const load = useCallback(async () => {
    const current = ++revision.current; setLoading(true); setError(false);
    try { const result = await pedirCrm<VoiceAgentMetrics>(`/api/crm/voice-agents/${agent.id}/metrics?periodo=${period}&offset=${offset}`); if (current === revision.current) setData(result.data); }
    catch { if (current === revision.current) setError(true); }
    finally { if (current === revision.current) setLoading(false); }
  }, [agent.id, offset, period]);
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
  type Row = VoiceAgentMetrics['rows'][number];
  const duration = (value: number | null) => value === null ? '—' : `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;
  const columns: ColumnaTabla<Row>[] = [
    { id: 'customer', encabezado: t('customer'), celda: row => <span className="flex items-center gap-2"><AvatarIniciales nombre={row.customer_name ?? t('unknown')} /><span>{row.customer_name ?? t('unknown')}</span></span> },
    { id: 'source', encabezado: t('source'), celda: row => t(`sources.${row.source}`) },
    { id: 'status', encabezado: t('status'), celda: row => <StatusBadge estado={row.status} etiqueta={t(`statuses.${row.status}`)} tono={row.status === 'failed' ? 'peligro' : row.status === 'completed' ? 'exito' : row.status === 'transferred' ? 'informacion' : row.status === 'skipped' ? 'advertencia' : 'neutro'} /> },
    { id: 'duration', encabezado: t('callDuration'), celda: row => <span className="whitespace-nowrap">{duration(row.duration_seconds)}</span> },
    { id: 'outcome', encabezado: t('outcome'), celda: row => row.outcome ?? '—' },
    { id: 'date', encabezado: t('date'), celda: row => <span className="whitespace-nowrap text-[13px] text-fg-secondary">{formatDateTimeInTz(row.created_at, timezone, { locale, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
    { id: 'action', encabezado: '', ancho: 48, celda: row => row.call_id ? <Link className={clasesBoton({ patron: 'button', variante: 'fantasma', tamano: 'sm', className: 'size-8 px-0' })} href={`/app/crm/llamadas/${encodeURIComponent(row.call_id)}`} aria-label={`${t('openCall')} · ${row.customer_name ?? t('unknown')}`}><ExternalLink className="size-4" strokeWidth={1.5} aria-hidden /></Link> : <span className="sr-only">{t('noCall')}</span> },
  ];
  return <div className="space-y-4 bg-canvas p-4 lg:p-6" data-figma-node="1311:86823">
    <PageHeader titulo={agent.name} subtitulo={t('metricsSubtitle')} icono={Bot} volverA="/app/crm/agentes-ia" onVolver={onClose} migas={[{ etiqueta: 'CRM' }, { etiqueta: t('agents') }, { etiqueta: agent.name }]} movil={{ ocultarBarra: true }} acciones={<><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma' })} onClick={onClose}>{t('back')}</button>{onTest && <button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} onClick={onTest}><Play className="size-4" strokeWidth={1.5} aria-hidden />{t('testTitle')}</button>}{onEdit && <button type="button" className={clasesBoton({ patron: 'button' })} onClick={onEdit}><Pencil className="size-4" strokeWidth={1.5} aria-hidden />{t('edit')}</button>}</>} />
    <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] text-fg-secondary">{t('period')}</span><div role="radiogroup" aria-label={t('period')} className="flex gap-2">{['7d', '30d', '90d'].map(value => <button key={value} type="button" role="radio" aria-checked={period === value} onClick={() => { setPeriod(value); setOffset(0); setData(null); }} className={`rounded-full border px-2 py-0.5 text-xs font-medium leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${period === value ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong bg-surface text-fg-secondary'}`}>{t(`period${value.slice(0, -1)}`)}</button>)}</div></div>
    {error ? <EmptyState variante="error" titulo={t('metricsError')} onReintentar={() => void load()} accionPrimaria /> : <>
      <KpiStrip><StatCard etiqueta={`${t('calls')} (${t(`period${period.slice(0, -1)}`)})`} valor={data?.total ?? '—'} cargando={loading} varianteCarga="compacta" tamano="sm" className="gap-2 [&>span.tabular-nums]:text-lg" detalle={t('metricsCallsHint')} /><StatCard etiqueta={t('effective')} valor={data ? `${data.total ? Math.round(data.effective / data.total * 100) : 0}%` : '—'} cargando={loading} varianteCarga="compacta" tamano="sm" className="gap-2 [&>span.tabular-nums]:text-lg" tono="exito" detalle={data ? t('effectiveHint', { total: data.effective }) : undefined} /><StatCard etiqueta={t('duration')} valor={data ? duration(data.average_duration_seconds) : '—'} cargando={loading} varianteCarga="compacta" tamano="sm" className="gap-2 [&>span.tabular-nums]:text-lg" /><StatCard etiqueta={t('credits')} valor={data?.credits_consumed ?? '—'} cargando={loading} varianteCarga="compacta" tamano="sm" className="gap-2 [&>span.tabular-nums]:text-lg" detalle={t('creditsHint')} /></KpiStrip>
      {!loading && data?.total === 0 ? <EmptyState titulo={t('metricsEmpty')} /> : <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Tarjeta titulo={t('outcomes')} descripcion={data ? t('totalRows', { total: data.total }) : undefined} className="[&>div]:sm:px-4"><ul className="space-y-2.5">{data?.statuses.map(status => <li key={status.status} className="space-y-1.5 text-[13px] leading-[18px]"><div className="flex items-center justify-between gap-3"><span className="text-fg-secondary">{t(`statuses.${status.status}`)}</span><span className="tabular-nums">{status.total} · {data.total ? Math.round(status.total / data.total * 100) : 0}%</span></div><span className="block h-2 overflow-hidden rounded-full bg-subtle" aria-hidden><span className={`block h-full rounded-full ${status.status === 'failed' ? 'bg-danger' : status.status === 'skipped' ? 'bg-warning' : 'bg-brand'}`} style={{ width: `${data.total ? status.total / data.total * 100 : 0}%` }} /></span></li>)}</ul></Tarjeta>
        <Tarjeta titulo={t('toolUsage')} className="[&>div]:sm:px-4"><ul className="space-y-2.5 text-sm">{data?.tools.map(tool => { const Icon = TOOL_ICONS[tool.tool] ?? Bot; return <li key={`${tool.tool}:${tool.status}`} className="flex items-center gap-2"><Icon className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} aria-hidden /><span className="min-w-0 flex-1">{t.has(`tools.${tool.tool}`) ? t(`tools.${tool.tool}`) : tool.tool}</span><span className="tabular-nums">{tool.total}</span><StatusBadge estado={tool.status} etiqueta={t(`toolStatuses.${tool.status}`)} tono={tool.status === 'applied' ? 'exito' : tool.status === 'suggested' ? 'informacion' : tool.status === 'failed' ? 'peligro' : 'neutro'} /></li>; })}</ul>
          {!loading && <details className="mt-4 text-xs text-fg-secondary"><summary className="cursor-pointer">{t('omissions')}</summary><dl className="mt-2 grid gap-2">{(['rne_excluded', 'law_rescheduled', 'other_skipped'] as const).map(key => <div key={key} className="flex items-center justify-between gap-3"><dt>{t(`omissionLabels.${key}`)}</dt><dd className="tabular-nums">{data?.omissions?.[key] ?? '—'}</dd></div>)}</dl></details>}
        </Tarjeta>
      </div>}
      <DataTable columnas={columns} filas={data?.rows ?? []} obtenerId={row => row.id} etiqueta={t('recentCalls')} estado={loading ? 'cargando' : 'listo'} vacio={{ titulo: t('metricsEmpty') }} mostrarCabeceraCargando={false} />
      {data && data.total > data.limit && <PaginationCompact pagina={Math.floor(offset / data.limit) + 1} tamano={data.limit} total={data.total} cargando={loading} onPaginaChange={page => setOffset((page - 1) * data.limit)} />}
    </>}
  </div>;
}
