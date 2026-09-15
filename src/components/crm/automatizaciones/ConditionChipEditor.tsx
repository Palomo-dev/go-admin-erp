'use client';

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
import { fieldLabel, groupLabel, operatorLabel } from '@/lib/services/crm/automation/conditionsI18n';
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
  const operator = String(rule.operator);
  const fieldId = `cond-${index}-field`;
  const opId = `cond-${index}-op`;
  const valueId = `cond-${index}-value`;
  const isCustomField = !CONDITION_FIELDS.includes(rule.field);
  const usesEntitySelect = (operator === 'eq' || operator === 'ne')
    && (STAGE_FIELDS.has(rule.field) || PIPELINE_FIELDS.has(rule.field));

  const renderValue = () => {
    if (NO_VALUE.has(operator)) {
      return <p className="text-xs text-gray-600 dark:text-gray-400">Este operador no necesita valor.</p>;
    }
    if (operator === 'eq' || operator === 'ne') {
      if (STAGE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.stages}
            placeholder="Elige una etapa"
            emptyMessage="No hay etapas creadas."
            ariaLabel={`Valor de la condición ${index + 1}`}
          />
        );
      }
      if (PIPELINE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.pipelines}
            placeholder="Elige un pipeline"
            emptyMessage="No hay pipelines creados."
            ariaLabel={`Valor de la condición ${index + 1}`}
          />
        );
      }
    }
    return (
      <Input
        id={valueId}
        value={conditionValueToText(rule.value)}
        placeholder={LIST_VALUE.has(operator) ? 'a, b, c' : 'Valor'}
        aria-describedby={`${valueId}-hint`}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={fieldId} className="text-xs text-gray-700 dark:text-gray-300">Campo</Label>
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
                <optgroup key={prefix} label={groupLabel(prefix)}>
                  {fields.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div>
          <Label htmlFor={opId} className="text-xs text-gray-700 dark:text-gray-300">Operador</Label>
          <select
            id={opId}
            className={SELECT_CLASS}
            value={operator}
            onChange={(e) => onChange({ operator: e.target.value as ConditionOperator })}
          >
            {OPERATORS.map((op) => <option key={op} value={op}>{operatorLabel(op)}</option>)}
          </select>
        </div>
        <div>
          {usesEntitySelect
            ? <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">Valor</span>
            : <Label htmlFor={valueId} className="text-xs text-gray-700 dark:text-gray-300">Valor</Label>}
          {renderValue()}
          {!NO_VALUE.has(operator) && (
            <p id={`${valueId}-hint`} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{valueHint(operator)}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 dark:text-red-300" onClick={onRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Quitar condición
        </Button>
      </div>
    </div>
  );
}
