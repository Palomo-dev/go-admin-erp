'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Tarjeta de una regla (brief 6.2): nombre, disparador en lenguaje humano,
 * interruptor con estado visible (texto e icono, no solo color), última
 * ejecución y contador. Las acciones secundarias van en botones con
 * `aria-label` y tooltip.
 */

import { CheckCircle2, PauseCircle, FlaskConical, History, Pencil, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  describeActions,
  describeConditions,
  describeTrigger,
  formatRelativeTime,
  type HumanizerLookups,
} from '@/lib/services/crm/automation/ruleHumanizer';
import { StaggerItem } from '@/components/shared/motion';
import type { AutomationRuleView } from './useAutomationRules';

interface Props {
  canManage?: boolean;
  rule: AutomationRuleView;
  lookups: HumanizerLookups;
  /** Texto de la fecha absoluta (ya en la zona horaria de la organización). */
  lastRunAbsolute: string;
  toggling: boolean;
  onToggle: (rule: AutomationRuleView) => void;
  onDryRun: (rule: AutomationRuleView) => void;
  onHistory: (rule: AutomationRuleView) => void;
  onEdit: (rule: AutomationRuleView) => void;
  onDelete: (rule: AutomationRuleView) => void;
}

function IconAction({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" disabled={disabled} size="icon" variant="ghost" aria-label={label} onClick={onClick} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RuleCard({ rule, lookups, lastRunAbsolute, toggling, onToggle, onDryRun, onHistory, onEdit, onDelete, canManage = false }: Props) {
  const tr = useAutomationText();
  const conditions = describeConditions(rule.conditions, lookups);
  const actions = describeActions(rule.actions, lookups);
  const switchId = `rule-active-${rule.id}`;
  const runs = rule.runs_count ?? 0;

  return (
    <StaggerItem
      as="li"
      className={cn(
        // `min-w-0`: como celda de la rejilla, sin esto el nombre truncado fijaba
        // el ancho mínimo y la tarjeta sobresalía a 375 px (UX móvil ronda 1).
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 shadow-sm transition-colors',
        'dark:bg-surface',
        rule.is_active ? 'border-line dark:border-line' : 'border-dashed border-line-strong dark:border-line-strong',
      )}
      aria-labelledby={`rule-name-${rule.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Dos líneas y corte por palabra: en móvil el nombre no se pierde tras una elipsis. */}
          <h3 id={`rule-name-${rule.id}`} className="line-clamp-2 break-words font-semibold text-fg dark:text-fg">
            {rule.name}
          </h3>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-fg-secondary dark:text-fg-secondary">
            <Zap strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-brand dark:text-brand" aria-hidden="true" />
            <span className="min-w-0 break-words">{describeTrigger(rule, lookups)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            id={switchId}
            checked={rule.is_active}
            disabled={toggling || !canManage}
            aria-label={tr("{p0} la regla {p1}", { p0: tr(rule.is_active ? 'Desactivar' : 'Activar'), p1: rule.name })}
            onCheckedChange={() => onToggle(rule)}
          />
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              rule.is_active ? 'text-success-text dark:text-success-text' : 'text-fg-secondary dark:text-fg-secondary',
            )}
          >
            {rule.is_active
              ? <CheckCircle2 strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" />
              : <PauseCircle strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" />}
            {rule.is_active ? tr("Activa") : tr("Inactiva")}
          </span>
        </div>
      </div>

      <dl className="space-y-1 text-sm">
        {conditions && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-warning-text dark:text-warning-text">{tr("si")}</dt>
            <dd className="line-clamp-2 min-w-0 break-words text-fg-secondary dark:text-fg-secondary">{conditions}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-medium text-brand-deep dark:text-blue-300">{tr("entonces")}</dt>
          <dd className="line-clamp-2 min-w-0 break-words text-fg-secondary dark:text-fg-secondary">
            {actions || <span className="italic text-fg-muted dark:text-fg-secondary">{tr("no hará nada (sin acciones)")}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 dark:border-line">
        <p className="text-xs text-fg-secondary dark:text-fg-secondary">
          <span title={lastRunAbsolute || undefined}>{tr("Última ejecución:")}{formatRelativeTime(rule.last_run_at, new Date(), lookups)}</span>
          {' · '}
          {runs === 1 ? tr("1 ejecución") : tr("{p0} ejecuciones", { p0: runs })}
        </p>
        <div className="flex items-center gap-0.5">
          {/* H3: N botones «Probar en seco» idénticos; el nombre accesible lleva la regla (y empieza por el texto visible). */}
          <Button type="button" disabled={!canManage} size="sm" variant="outline" className="h-8" aria-label={tr("Probar en seco {p0}", { p0: rule.name })} onClick={() => onDryRun(rule)}>
            <FlaskConical strokeWidth={1.5} className="mr-1.5 h-4 w-4" aria-hidden="true" /> {tr("Probar en seco")}</Button>
          <IconAction label={tr("Historial de {p0}", { p0: rule.name })} onClick={() => onHistory(rule)}>
            <History strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction disabled={!canManage} label={tr("Editar {p0}", { p0: rule.name })} onClick={() => onEdit(rule)}>
            <Pencil strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction disabled={!canManage} label={tr("Eliminar {p0}", { p0: rule.name })} onClick={() => onDelete(rule)}>
            <Trash2 strokeWidth={1.5} className="h-4 w-4 text-danger-text dark:text-danger-text" aria-hidden="true" />
          </IconAction>
        </div>
      </div>
    </StaggerItem>
  );
}
