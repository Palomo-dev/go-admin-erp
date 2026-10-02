'use client';
import { useAutomationText } from './useAutomationText';
import { useLocale } from 'next-intl';

/**
 * Editor en sitio de UNA condición (campo · operador · valor). Se abre bajo
 * la ficha seleccionada. Tres campos, cada uno con su `<label>`.
 */

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EntitySelect } from '@/components/crm/shared/EntitySelect';
import { CONDITION_FIELDS, OPERATORS, type ConditionOperator, type ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
import { fieldLabel, groupLabel, operatorLabel, type ConditionLocale } from '@/lib/services/crm/automation/conditionsI18n';
import { conditionValueToText, type ConditionPatch } from '@/lib/services/crm/automation/ruleEditorModel';
import { SELECT_CLASS } from './TriggerBlock';
import type { RuleLookups } from './useRuleLookups';

const NO_VALUE = new Set<string>(['is_null', 'is_not_null']);
const LIST_VALUE = new Set<string>(['in', 'not_in']);
const STAGE_FIELDS = new Set<string>(['opportunity.stage_id', 'stage.id']);
const PIPELINE_FIELDS = new Set<string>(['opportunity.pipeline_id', 'pipeline.id']);
const GROUPS = ['opportunity.', 'customer.', 'stage.', 'pipeline.', 'consent.', 'event.'];

interface Props {
  index: number;
  rule: ConditionRule;
  lookups: RuleLookups;
  onChange: (patch: ConditionPatch) => void;
  onRemove: () => void;
}

function valueHint(operator: string): string {
  if (LIST_VALUE.has(operator)) return 'Varios valores separados por coma.';
  if (operator === 'within_days') return 'Número de días hacia atrás desde hoy.';
  if (operator === 'before' || operator === 'after') return 'Fecha en formato AAAA-MM-DD.';
  return 'Texto, número, true o false. Los IDs de etapa se eligen por nombre.';
}

export function ConditionChipEditor({ index, rule, lookups, onChange, onRemove }: Props) {
  const tr = useAutomationText();
  const activeLocale = useLocale();
  const locale = (['es','en','fr','pt'].includes(activeLocale) ? activeLocale : 'es') as ConditionLocale;
  const operator = String(rule.operator);
  const fieldId = `cond-${index}-field`;
  const opId = `cond-${index}-op`;
  const valueId = `cond-${index}-value`;
  const isCustomField = !CONDITION_FIELDS.includes(rule.field);
  const usesEntitySelect = (operator === 'eq' || operator === 'ne')
    && (STAGE_FIELDS.has(rule.field) || PIPELINE_FIELDS.has(rule.field));

  const renderValue = () => {
    if (NO_VALUE.has(operator)) {
      return <p className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Este operador no necesita valor.")}</p>;
    }
    if (operator === 'eq' || operator === 'ne') {
      if (STAGE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.stages}
            placeholder={tr("Elige una etapa")}
            emptyMessage={tr("No hay etapas creadas.")}
            ariaLabel={tr("Valor de la condición {p0}", { p0: index + 1 })}
          />
        );
      }
      if (PIPELINE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.pipelines}
            placeholder={tr("Elige un pipeline")}
            emptyMessage={tr("No hay pipelines creados.")}
            ariaLabel={tr("Valor de la condición {p0}", { p0: index + 1 })}
          />
        );
      }
    }
    return (
      <Input
        id={valueId}
        value={conditionValueToText(rule.value)}
        placeholder={LIST_VALUE.has(operator) ? tr("a, b, c") : tr('Valor')}
        aria-describedby={`${valueId}-hint`}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  };

  return (
    <div className="rounded-lg border border-line-warning bg-warning-subtle/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={fieldId} className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Campo")}</Label>
          <select
            id={fieldId}
            className={SELECT_CLASS}
            value={rule.field}
            onChange={(e) => onChange({ field: e.target.value })}
          >
            {isCustomField && <option value={rule.field}>{rule.field}</option>}
            {GROUPS.map((prefix) => {
              const fields = CONDITION_FIELDS.filter((f) => f.startsWith(prefix));
              return (
                <optgroup key={prefix} label={groupLabel(prefix,locale)}>
                  {fields.map((f) => <option key={f} value={f}>{fieldLabel(f,locale)}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <Label htmlFor={opId} className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Operador")}</Label>
          <select
            id={opId}
            className={SELECT_CLASS}
            value={operator}
            onChange={(e) => onChange({ operator: e.target.value as ConditionOperator })}
          >
            {OPERATORS.map((op) => <option key={op} value={op}>{operatorLabel(op,locale)}</option>)}
          </select>
        </div>
        <div>
          {usesEntitySelect
            ? <span className="block text-xs font-medium text-fg-secondary dark:text-fg-secondary">{tr("Valor")}</span>
            : <Label htmlFor={valueId} className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Valor")}</Label>}
          {renderValue()}
          {!NO_VALUE.has(operator) && (
            <p id={`${valueId}-hint`} className="mt-1 text-xs text-fg-secondary dark:text-fg-secondary">{tr(valueHint(operator))}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="ghost" className="h-8 text-danger-text hover:text-red-800 dark:text-danger-text" onClick={onRemove}>
          <Trash2 strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {tr("Quitar condición")}</Button>
      </div>
    </div>
  );
}
