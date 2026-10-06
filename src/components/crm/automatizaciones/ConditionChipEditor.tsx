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
import { useTranslations } from 'next-intl';

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

/** Subclave de `crm.automatizaciones.conditionChipEditor.ayudas` según el operador. */
function valueHint(operator: string): string {
  if (LIST_VALUE.has(operator)) return 'lista';
  if (operator === 'within_days') return 'dias';
  if (operator === 'before' || operator === 'after') return 'fecha';
  return 'texto';
}

export function ConditionChipEditor({ index, rule, lookups, onChange, onRemove }: Props) {
  const t = useTranslations('crm.automatizaciones');
  const operator = String(rule.operator);
  const fieldId = `cond-${index}-field`;
  const opId = `cond-${index}-op`;
  const valueId = `cond-${index}-value`;
  const isCustomField = !CONDITION_FIELDS.includes(rule.field);
  const usesEntitySelect = (operator === 'eq' || operator === 'ne')
    && (STAGE_FIELDS.has(rule.field) || PIPELINE_FIELDS.has(rule.field));

  const renderValue = () => {
    if (NO_VALUE.has(operator)) {
      return <p className="text-xs text-gray-600 dark:text-gray-400">{t('conditionChipEditor.esteOperadorNoNecesita')}</p>;
    }
    if (operator === 'eq' || operator === 'ne') {
      if (STAGE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.stages}
            placeholder={t('actionChipEditor.eligeEtapa')}
            emptyMessage={t('actionChipEditor.noHayEtapasCreadas')}
            ariaLabel={t('conditionChipEditor.valorCondicion', { n: index + 1 })}
          />
        );
      }
      if (PIPELINE_FIELDS.has(rule.field)) {
        return (
          <EntitySelect
            value={typeof rule.value === 'string' ? rule.value : null}
            onChange={(id) => onChange({ value: id ?? '' })}
            options={lookups.pipelines}
            placeholder={t('conditionChipEditor.eligePipeline')}
            emptyMessage={t('triggerBlock.noHayPipelinesCreados')}
            ariaLabel={t('conditionChipEditor.valorCondicion', { n: index + 1 })}
          />
        );
      }
    }
    return (
      <Input
        id={valueId}
        value={conditionValueToText(rule.value)}
        placeholder={LIST_VALUE.has(operator) ? 'a, b, c' : t('conditionChipEditor.valor')}
        aria-describedby={`${valueId}-hint`}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    );
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={fieldId} className="text-xs text-gray-700 dark:text-gray-300">{t('conditionChipEditor.campo')}</Label>
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
          <Label htmlFor={opId} className="text-xs text-gray-700 dark:text-gray-300">{t('conditionChipEditor.operador')}</Label>
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
            ? <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('conditionChipEditor.valor')}</span>
            : <Label htmlFor={valueId} className="text-xs text-gray-700 dark:text-gray-300">{t('conditionChipEditor.valor')}</Label>}
          {renderValue()}
          {!NO_VALUE.has(operator) && (
            <p id={`${valueId}-hint`} className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t(`conditionChipEditor.ayudas.${valueHint(operator)}`)}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" variant="ghost" className="h-8 text-red-700 hover:text-red-800 dark:text-red-300" onClick={onRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {t('conditionChipEditor.quitarCondicion')}
        </Button>
      </div>
    </div>
  );
}
