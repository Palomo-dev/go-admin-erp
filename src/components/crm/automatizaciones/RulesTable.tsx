'use client';
import { useAutomationText } from './useAutomationText';
import { FlaskConical, History, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { describeActions, describeTrigger, type HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';
import type { AutomationRuleView } from './useAutomationRules';
interface Props {
  rules: AutomationRuleView[]; lookups: HumanizerLookups; canManage: boolean; togglingId: string | null;
  formatDate(value: string | null): string; onToggle(rule: AutomationRuleView): void; onEdit(rule: AutomationRuleView): void;
  onDryRun(rule: AutomationRuleView): void; onHistory(rule: AutomationRuleView): void; onDelete(rule: AutomationRuleView): void;
}
export function RulesTable({ rules, lookups, canManage, togglingId, formatDate, onToggle, onEdit, onDryRun, onHistory, onDelete }: Props) {
  const tr = useAutomationText();
  return <div className="overflow-x-auto rounded-xl border border-line bg-surface"><Table>
    <TableHeader className="bg-subtle"><TableRow>{['Regla','Cuando','Acciones','Última ejecución','Ejecuciones','Activa',''].map((label,i) => <TableHead key={i}>{tr(label)}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rules.map(rule => <TableRow key={rule.id}>
      <TableCell className="max-w-64"><button type="button" disabled={!canManage} className="block max-w-full truncate text-left font-medium text-fg hover:text-brand disabled:opacity-100" onClick={() => onEdit(rule)}>{rule.name}</button>{rule.description && <p className="truncate text-xs text-fg-secondary">{rule.description}</p>}</TableCell>
      <TableCell className="max-w-64"><p className="line-clamp-2 text-xs text-fg-secondary">{describeTrigger(rule,lookups)}</p></TableCell>
      <TableCell className="max-w-64"><p className="line-clamp-2 text-xs text-fg-secondary">{describeActions(rule.actions,lookups)}</p></TableCell>
      <TableCell className="whitespace-nowrap text-xs text-fg-secondary">{rule.last_run_at ? formatDate(rule.last_run_at) : tr('Nunca')}</TableCell>
      <TableCell className="text-right tabular-nums">{rule.runs_count ?? 0}</TableCell>
      <TableCell><Switch id={`rule-active-${rule.id}`} checked={rule.is_active} disabled={!canManage || togglingId !== null} aria-label={tr("Activar o pausar {p0}", { p0: rule.name })} onCheckedChange={() => onToggle(rule)} /></TableCell>
      <TableCell><RowActionsMenu titulo={rule.name} acciones={[
        { id:'history',etiqueta:tr('Historial'),icono:History,onSelect:() => onHistory(rule) },
        { id:'test',etiqueta:tr("Probar en seco"),icono:FlaskConical,onSelect:() => onDryRun(rule),deshabilitada:!canManage },
        { id:'edit',etiqueta:tr('Editar'),icono:Pencil,onSelect:() => onEdit(rule),deshabilitada:!canManage },
        { id:'delete',etiqueta:tr('Eliminar'),icono:Trash2,onSelect:() => onDelete(rule),deshabilitada:!canManage,destructiva:true },
      ]} /></TableCell>
    </TableRow>)}</TableBody>
  </Table></div>;
}
