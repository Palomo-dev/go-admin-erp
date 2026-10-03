'use client';
import { useAutomationText } from './useAutomationText';
import { useLocale } from 'next-intl';

/**
 * Editor en sitio de UNA condición (campo · operador · valor). Se abre bajo
 * la ficha seleccionada. Tres campos, cada uno con su `<label>`.
 */

import { CrmSelectControl } from '../agentes/CrmSelectControl';
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

interface Props {
  index: number;
  rule: ConditionRule;
  lookups: RuleLookups;
  onChange: (patch: ConditionPatch) => void;
  onRemove: () => void;
  compacto?: boolean;
}

function valueHint(operator: string): string {
  if (LIST_VALUE.has(operator)) return 'Varios valores separados por coma.';
  if (operator === 'within_days') return 'Número de días hacia atrás desde hoy.';
  if (operator === 'before' || operator === 'after') return 'Fecha en formato AAAA-MM-DD.';
  return 'Texto, número, true o false. Los IDs de etapa se eligen por nombre.';
}

export function ConditionChipEditor({ index, rule, lookups, onChange, onRemove, compacto = false }: Props) {
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
      return <p className={compacto ? "sr-only" : "text-xs text-fg-secondary"}>{tr("Este operador no necesita valor.")}</p>;
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
    <div className={compacto ? "flex min-w-0 flex-1 items-start gap-3" : "rounded-lg border border-line-warning bg-warning-subtle/50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"}>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
        <div>
          <Label htmlFor={fieldId} className={compacto ? "sr-only" : "text-xs text-fg-secondary"}>{tr("Campo")}</Label>
          <CrmSelectControl id={fieldId} aria-label={tr('Campo')} className={SELECT_CLASS} value={rule.field} onChange={value => onChange({ field: value })} options={[...(isCustomField ? [{ value: rule.field, label: rule.field }] : []), ...CONDITION_FIELDS.map(value => ({ value, label: `${groupLabel(value.split('.')[0] + '.', locale)} · ${fieldLabel(value, locale)}` }))]} />
        </div>
        <div>
          <Label htmlFor={opId} className={compacto ? "sr-only" : "text-xs text-fg-secondary"}>{tr("Operador")}</Label>
          <CrmSelectControl id={opId} aria-label={tr('Operador')} className={SELECT_CLASS} value={operator} onChange={value => onChange({ operator: value as ConditionOperator })} options={OPERATORS.map(value => ({ value, label: operatorLabel(value, locale) }))} />
        </div>
        <div>
          {usesEntitySelect
            ? <span className={compacto ? "sr-only" : "block text-xs font-medium text-fg-secondary"}>{tr("Valor")}</span>
            : <Label htmlFor={valueId} className={compacto ? "sr-only" : "text-xs text-fg-secondary"}>{tr("Valor")}</Label>}
          {renderValue()}
          {!NO_VALUE.has(operator) && (
            <p id={`${valueId}-hint`} className={compacto ? "sr-only" : "mt-1 text-xs text-fg-secondary"}>{tr(valueHint(operator))}</p>
          )}
        </div>
      </div>
      <div className={compacto ? "flex justify-end" : "mt-2 flex justify-end"}>
        <Button type="button" size="sm" variant="ghost" className={compacto ? "size-10 p-0 text-fg-secondary" : "h-8 text-danger-text"} aria-label={tr("Quitar condición")} onClick={onRemove}>
          <Trash2 strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {!compacto && tr("Quitar condición")}</Button>
      </div>
    </div>
  );
}
