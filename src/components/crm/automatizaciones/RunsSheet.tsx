'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CrmSelectControl } from '../agentes/CrmSelectControl';
import { ArrowLeft, Download, History, RefreshCw } from 'lucide-react';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { PageHeader } from '@/components/kit/PageHeader';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { DateRangeButton } from '@/components/kit/DateRangeButton';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateDisplay';
import { filasACsv } from '@/lib/utils/csv';
import { describeRunStatus, describeSkipReason } from '@/lib/services/crm/automation/ruleHumanizer';
import { actionEntry } from '@/lib/services/crm/automation/ruleCatalog';
import { fetchRuns, type AutomationRunView, type AutomationRuleView } from './useAutomationRules';
import { useAutomationText } from './useAutomationText';
import type { RangoFechas } from '@/components/kit/rangoFechas';

type RunRow = AutomationRunView & { opportunity_id?: string | null; trigger_payload?: Record<string, unknown> | null };
interface Props {
  open: boolean; onOpenChange(open: boolean): void; ruleId: string | null; ruleName: string | null;
  rules?: AutomationRuleView[];
}

/** El historial es un lienzo completo; sólo lee ejecuciones reales, nunca pruebas en seco. */
export function RunsSheet({ open, onOpenChange, ruleId, ruleName, rules = [] }: Props) {
  const tr = useAutomationText();
  const { formatDateTime, getToday } = useFormatDate();
  const { timezone } = useOrgTimezone();
  const [runs, setRuns] = useState<RunRow[]>([]), [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null), [tick, setTick] = useState(0);
  const [selectedRule, setSelectedRule] = useState(ruleId ?? '');
  const [status, setStatus] = useState('all');
  const [range, setRange] = useState<RangoFechas>(() => ({ desde: addPlainDays(getToday(), -6), hasta: getToday() }));
  useEffect(() => { setSelectedRule(ruleId ?? ''); }, [ruleId]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null); setRuns([]);
    fetchRuns(selectedRule || undefined)
      .then(data => { if (!cancelled) setRuns(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : tr('Error desconocido')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, selectedRule, tick, tr]);
  const shown = useMemo(() => runs.filter(run => {
    const day = toPlainDate(new Date(run.created_at), timezone);
    return day >= range.desde && day <= range.hasta && (status === 'all' || run.status === status);
  }), [runs, range, status, timezone]);
  const ruleLabel = (run: AutomationRunView) => rules.find(rule => rule.id === run.automation_rule_id)?.name ?? (run.automation_rule_id === ruleId ? ruleName : null) ?? tr('Regla no disponible');
  const detail = (run: AutomationRunView) => run.error_message ?? (run.skip_reason ? tr(describeSkipReason(run.skip_reason)) : (run.result?.results ?? []).map(result => `${tr(actionEntry(result.type)?.label ?? result.type)}${result.status === 'failed' ? tr(' — error: {p0}', { p0: result.error ?? tr('Sin detalle') }) : tr(' — ok')}`).join(' · ') || tr('Sin detalle'));
  const columns: ColumnaTabla<RunRow>[] = [
    { id: 'when', encabezado: tr('Cuándo'), ancho: 132, celda: run => <span className="whitespace-nowrap text-[13px]">{formatDateTime(run.created_at)}</span> },
    { id: 'rule', encabezado: tr('Regla'), celda: run => <span className="text-sm font-medium">{ruleLabel(run)}</span> },
    { id: 'record', encabezado: tr('Registro'), ancho: 160, celda: run => run.opportunity_id ? <Link className="text-sm text-fg hover:text-brand-deep" href={`/app/crm/oportunidades/${encodeURIComponent(run.opportunity_id)}`}>{typeof run.trigger_payload?.opportunity_name === 'string' ? run.trigger_payload.opportunity_name : tr('Oportunidad {p0}', { p0: run.opportunity_id.slice(0, 8) })}</Link> : <span className="text-fg-muted">—</span> },
    { id: 'status', encabezado: tr('Resultado'), ancho: 142, celda: run => { const value = describeRunStatus(run.status); return <StatusBadge estado={run.status} etiqueta={tr(value.label)} tono={value.tone === 'success' ? 'exito' : value.tone === 'danger' ? 'peligro' : value.tone === 'info' ? 'informacion' : value.tone === 'warning' ? 'advertencia' : 'neutro'} />; } },
    { id: 'detail', encabezado: tr('Detalle'), celda: run => <span className="block min-w-0 text-[13px] leading-[18px] text-fg-secondary [overflow-wrap:anywhere]">{detail(run)}</span> },
  ];
  const download = () => {
    const blob = new Blob([filasACsv(columns.map(column => column.encabezado), shown.map(run => [formatDateTime(run.created_at), ruleLabel(run), '', tr(describeRunStatus(run.status).label), detail(run)]))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'automation-runs.csv'; link.click(); URL.revokeObjectURL(url);
  };
  if (!open) return null;
  return <div className="space-y-4 bg-canvas p-4 sm:p-6" data-figma-node="1373:1161">
    <PageHeader titulo={tr('Historial de ejecuciones')} subtitulo={tr('Qué hizo cada regla y por qué se omitió o falló')} icono={History} volverA="/app/crm/automatizaciones" onVolver={() => onOpenChange(false)} migas={[{ etiqueta: 'CRM' }, { etiqueta: tr('Automatizaciones') }]} movil={{ ocultarBarra: true }} acciones={<><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma' })} onClick={() => onOpenChange(false)}><ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />{tr('Volver')}</button><button type="button" aria-label={tr('Actualizar')} disabled={loading} className={clasesBoton({ patron: 'button', variante: 'fantasma', className: 'size-10 px-0' })} onClick={() => setTick(value => value + 1)}><RefreshCw className="size-4" strokeWidth={1.5} aria-hidden /></button><button type="button" disabled={loading || !shown.length} className={clasesBoton({ patron: 'button', variante: 'secundario' })} onClick={download}><Download className="size-4" strokeWidth={1.5} aria-hidden />{tr('Exportar')}</button></>} />
    <div className="flex flex-wrap items-center gap-2"><CrmSelectControl aria-label={tr('Regla')} className="min-w-52 flex-1" value={selectedRule} onChange={setSelectedRule} options={[{ value: '', label: tr('Regla: todas') }, ...rules.map(rule => ({ value: rule.id, label: rule.name }))]} /><DateRangeButton hoy={getToday()} valor={range} onValorChange={setRange} etiqueta={tr('Periodo')} className="min-w-52 flex-1" /><ChipsOpcion etiqueta={tr('Filtrar por estado')} opciones={[{ valor: 'all', etiqueta: tr('Todas') }, { valor: 'completed', etiqueta: tr('Ejecutadas') }, { valor: 'skipped', etiqueta: tr('Omitidas') }, { valor: 'failed', etiqueta: tr('Con error') }]} valor={status} onValorChange={setStatus} /></div>
    <DataTable columnas={columns} filas={shown} obtenerId={run => run.id} etiqueta={tr('Historial de ejecuciones')} estado={loading ? 'cargando' : error ? 'error' : undefined} error={{ titulo: tr("No se pudo cargar el historial"), descripcion: error ?? undefined, accionPrimaria: true }} onReintentar={() => setTick(value => value + 1)} vacio={{ titulo: tr("Todavía no hay ejecuciones. Cuando la regla se dispare, aparecerán aquí.") }} densidad="compacta" className="[&_thead_th]:h-9 [&_thead_th]:font-semibold [&_tbody_td]:h-[59px]" mostrarCabeceraCargando={false} />
    <p className="text-xs text-fg-muted">{tr('Últimas 50 ejecuciones reales del servidor. Las pruebas en seco no se registran aquí.')}</p>
  </div>;
}
