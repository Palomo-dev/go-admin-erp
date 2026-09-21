'use client';

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

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick} className="h-8 w-8">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RuleCard({ rule, lookups, lastRunAbsolute, toggling, onToggle, onDryRun, onHistory, onEdit, onDelete }: Props) {
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
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-colors',
        'dark:bg-gray-900',
        rule.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-dashed border-gray-300 dark:border-gray-700',
      )}
      aria-labelledby={`rule-name-${rule.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Dos líneas y corte por palabra: en móvil el nombre no se pierde tras una elipsis. */}
          <h3 id={`rule-name-${rule.id}`} className="line-clamp-2 break-words font-semibold text-gray-900 dark:text-gray-100">
            {rule.name}
          </h3>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span className="min-w-0 break-words">{describeTrigger(rule, lookups)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Switch
            id={switchId}
            checked={rule.is_active}
            disabled={toggling}
            aria-label={`${rule.is_active ? 'Desactivar' : 'Activar'} la regla ${rule.name}`}
            onCheckedChange={() => onToggle(rule)}
          />
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              rule.is_active ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-400',
            )}
          >
            {rule.is_active
              ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {rule.is_active ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      </div>

      <dl className="space-y-1 text-sm">
        {conditions && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-medium text-amber-700 dark:text-amber-300">si</dt>
            <dd className="line-clamp-2 min-w-0 break-words text-gray-700 dark:text-gray-300">{conditions}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 font-medium text-blue-700 dark:text-blue-300">entonces</dt>
          <dd className="line-clamp-2 min-w-0 break-words text-gray-700 dark:text-gray-300">
            {actions || <span className="italic text-gray-500 dark:text-gray-400">no hará nada (sin acciones)</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span title={lastRunAbsolute || undefined}>Última ejecución: {formatRelativeTime(rule.last_run_at)}</span>
          {' · '}
          {runs === 1 ? '1 ejecución' : `${runs} ejecuciones`}
        </p>
        <div className="flex items-center gap-0.5">
          {/* H3: N botones «Probar en seco» idénticos; el nombre accesible lleva la regla (y empieza por el texto visible). */}
          <Button type="button" size="sm" variant="outline" className="h-8" aria-label={`Probar en seco ${rule.name}`} onClick={() => onDryRun(rule)}>
            <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" /> Probar en seco
          </Button>
          <IconAction label={`Historial de ${rule.name}`} onClick={() => onHistory(rule)}>
            <History className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction label={`Editar ${rule.name}`} onClick={() => onEdit(rule)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </IconAction>
          <IconAction label={`Eliminar ${rule.name}`} onClick={() => onDelete(rule)}>
            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
          </IconAction>
        </div>
      </div>
    </StaggerItem>
  );
}
