'use client';
import { useAutomationText } from './useAutomationText';
import { FlaskConical, History, Pencil, Trash2, Zap, Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { describeActions, describeTrigger, type HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';
import type { AutomationRuleView } from './useAutomationRules';
interface Props {
  estado?: 'listo' | 'cargando'; rules: AutomationRuleView[]; lookups: HumanizerLookups; canManage: boolean; togglingId: string | null;
  formatDate(value: string | null): string; onToggle(rule: AutomationRuleView): void; onEdit(rule: AutomationRuleView): void;
  onDryRun(rule: AutomationRuleView): void; onHistory(rule: AutomationRuleView): void; onDelete(rule: AutomationRuleView): void;
}
export function RulesTable({ estado, rules, lookups, canManage, togglingId, formatDate, onToggle, onEdit, onDryRun, onHistory, onDelete }: Props) {
  const tr = useAutomationText();
  const columns: ColumnaTabla<AutomationRuleView>[] = [
    { id: 'name', encabezado: tr('Regla'), celda: rule => <div className="min-w-44"><button type="button" disabled={!canManage} className="block max-w-full truncate text-left text-sm font-medium text-fg hover:text-brand-deep disabled:opacity-100" onClick={() => onEdit(rule)}>{rule.name}</button>{rule.description && <p className="truncate text-[13px] leading-[18px] text-fg-secondary">{rule.description}</p>}</div> },
    { id: 'trigger', encabezado: tr('Cuando'), celda: rule => <span className="flex max-w-64 items-start gap-2 text-[13px] leading-[18px] text-fg-secondary"><Zap className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /><span className="line-clamp-2">{describeTrigger(rule, lookups)}</span></span> },
    { id: 'actions', encabezado: tr('Acciones'), celda: rule => <span className="flex max-w-64 items-start gap-2 text-[13px] leading-[18px] text-fg-secondary"><Play className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /><span className="line-clamp-2">{describeActions(rule.actions, lookups)}</span></span> },
    { id: 'last', encabezado: tr('Última ejecución'), celda: rule => <span className="whitespace-nowrap text-[13px] leading-[18px] text-fg-secondary">{rule.last_run_at ? formatDate(rule.last_run_at) : tr('Nunca')}</span> },
    { id: 'runs', encabezado: tr('Ejecuciones'), variante: 'importe', celda: rule => rule.runs_count ?? 0 },
    { id: 'active', encabezado: tr('Activa'), ancho: 70, celda: rule => <Switch id={`rule-active-${rule.id}`} checked={rule.is_active} disabled={!canManage || togglingId !== null} aria-label={tr('Activar o pausar {p0}', { p0: rule.name })} onCheckedChange={() => onToggle(rule)} /> },
  ];
  return <DataTable estado={estado} filasEsqueleto={6} altoFilaEsqueleto={56} mostrarCabeceraCargando={false} columnas={columns} filas={rules} obtenerId={rule => rule.id} etiqueta={tr('Reglas de automatización')} etiquetaFila={rule => rule.name} densidad="compacta"
    className="[&_thead_th]:h-9 [&_thead_th]:font-semibold [&_tbody_td]:py-2.5"
    acciones={rule => [
      { id: 'history', etiqueta: tr('Historial'), icono: History, onSelect: () => onHistory(rule) },
      { id: 'test', etiqueta: tr('Probar en seco'), icono: FlaskConical, onSelect: () => onDryRun(rule), deshabilitada: !canManage },
      { id: 'edit', etiqueta: tr('Editar'), icono: Pencil, onSelect: () => onEdit(rule), deshabilitada: !canManage },
      { id: 'delete', etiqueta: tr('Eliminar'), icono: Trash2, onSelect: () => onDelete(rule), deshabilitada: !canManage, destructiva: true },
    ]} />;
}
