'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import { DataTable, EmptyState, FormSection, PanelAdaptable, StatCard, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { VoiceAgentMetrics } from '@/lib/services/crm/voiceAgentMetrics';
export function AgentMetricsPanel({ agent, onClose }: { agent: { id: string; name: string }; onClose: () => void }) {
  const t = useTranslations('crm.agentesIa'); const { timezone } = useOrgTimezone(); const locale = useLocaleIntl();
  const [period, setPeriod] = useState('30d'); const [offset, setOffset] = useState(0); const [data, setData] = useState<VoiceAgentMetrics | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const revision = useRef(0);
  const load = useCallback(async () => { const current = ++revision.current; setLoading(true); setError(false); try { const result = await pedirCrm<VoiceAgentMetrics>(`/api/crm/voice-agents/${agent.id}/metrics?periodo=${period}&offset=${offset}`); if (current === revision.current) setData(result.data); } catch { if (current === revision.current) setError(true); } finally { if (current === revision.current) setLoading(false); } }, [agent.id, offset, period]);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
  type Row = VoiceAgentMetrics['rows'][number];
  const columns: ColumnaTabla<Row>[] = [
    { id: 'customer', encabezado: t('customer'), celda: row => row.customer_name ?? t('unknown') },
    { id: 'date', encabezado: t('date'), celda: row => formatDateTimeInTz(row.created_at, timezone, { locale, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
    { id: 'status', encabezado: t('status'), celda: row => <StatusBadge estado={row.status} etiqueta={t(`statuses.${row.status}`)} tono={row.status === 'failed' ? 'peligro' : row.status === 'completed' ? 'exito' : 'neutro'} /> },
    { id: 'duration', encabezado: t('duration'), celda: row => row.duration_seconds === null ? '—' : `${row.duration_seconds}s` },
    { id: 'outcome', encabezado: t('outcome'), celda: row => row.outcome ?? '—' },
    { id: 'source', encabezado: t('source'), celda: row => t(`sources.${row.source}`) },
    { id: 'action', encabezado: t('openCall'), celda: row => row.call_id ? <Link className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} href={`/app/crm/llamadas?call=${encodeURIComponent(row.call_id)}`}>{t('openCall')}</Link> : <span className="text-xs text-fg-muted">{t('noCall')}</span> },
  ];
  return <PanelAdaptable abierto onAbiertoChange={open => !open && onClose()} titulo={`${agent.name} · ${t('metrics')}`} icono={BarChart3}>
    <div className="space-y-5"><label className="flex items-center gap-3 text-sm text-fg">{t('period')}<select className="h-10 rounded-md border border-line bg-surface px-3" value={period} onChange={e => { setPeriod(e.target.value); setOffset(0); setData(null); }}><option value="7d">{t('period7')}</option><option value="30d">{t('period30')}</option><option value="90d">{t('period90')}</option></select></label>
    {error ? <EmptyState variante="error" titulo={t('metricsError')} onReintentar={() => void load()} /> : <>
      <div className="grid grid-cols-2 gap-3"><StatCard etiqueta={t('calls')} valor={data?.total ?? '—'} cargando={loading} /><StatCard etiqueta={t('effective')} valor={data ? `${data.total ? Math.round(data.effective / data.total * 100) : 0}%` : '—'} cargando={loading} detalle={data ? t('totalRows', { total: data.effective }) : undefined} /><StatCard etiqueta={t('duration')} valor={data?.average_duration_seconds === null || !data ? '—' : `${data.average_duration_seconds}s`} cargando={loading} /><StatCard etiqueta={t('credits')} valor={data?.credits_consumed ?? '—'} cargando={loading} detalle={t('creditsHint')} /></div>
      {!loading && data?.total === 0 ? <EmptyState titulo={t('metricsEmpty')} /> : <><FormSection titulo={t('outcomes')}><ul className="space-y-2">{data?.statuses.map(status => <li key={status.status} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm"><span>{t(`statuses.${status.status}`)}</span><span className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden><span className="block h-full bg-brand-action" style={{ width: `${data.total ? status.total / data.total * 100 : 0}%` }} /></span><span className="tabular-nums">{status.total}</span></li>)}</ul></FormSection><FormSection titulo={t('toolUsage')}><ul className="space-y-2 text-sm">{data?.tools.map(tool => <li key={`${tool.tool}:${tool.status}`} className="flex items-center justify-between gap-3"><span>{t.has(`tools.${tool.tool}`) ? t(`tools.${tool.tool}`) : tool.tool} · {t(`toolStatuses.${tool.status}`)}</span><strong>{tool.total}</strong></li>)}</ul></FormSection></>}
      {!loading && <FormSection titulo={t('omissions')}><dl className="grid gap-2 text-sm">{(['rne_excluded', 'law_rescheduled', 'other_skipped'] as const).map(key => <div key={key} className="flex items-center justify-between gap-3"><dt>{t(`omissionLabels.${key}`)}</dt><dd className="tabular-nums">{data?.omissions?.[key] ?? '—'}</dd></div>)}</dl></FormSection>}
      <DataTable columnas={columns} filas={data?.rows ?? []} obtenerId={row => row.id} etiqueta={t('recentCalls')} estado={loading ? 'cargando' : 'listo'} vacio={{ titulo: t('metricsEmpty') }} pie={<div className="flex items-center justify-between gap-3 p-3"><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>{t('back')}</button><span className="text-xs text-fg-muted">{t('totalRows', { total: data?.total ?? 0 })}</span><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={loading || !data || offset + 20 >= data.total} onClick={() => setOffset(value => value + 20)}>{t('next')}</button></div>} />
    </>}</div>
  </PanelAdaptable>;
}
