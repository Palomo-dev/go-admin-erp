'use client';

/**
 * ConditionBuilder — editor visual de condiciones DSL (FASE-08 §2.4).
 *
 * Reutiliza el mismo DSL que `ConditionEditor` de secuencias, pero:
 *  - Incluye el grupo `event.*` (las reglas de automatización sí reciben evento).
 *  - Se puede usar en modo "visual + JSON avanzado": una pestaña para el usuario
 *    común y otra para quien quiera pegar el JSON completo.
 *  - Es responsive: en móvil las reglas se apilan en vez de hacer scroll horizontal.
 *
 * El formato guardado es el del DSL: `{ op: 'and'|'or', rules: [{field,
 * operator, value}] }`, el mismo que evalúa `evaluateConditionTree`.
 */

import { useState } from 'react';
import { Plus, Trash2, Code2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CONDITION_FIELDS,
  OPERATORS,
  isGroup,
  type ConditionGroup,
  type ConditionOperator,
  type ConditionRule,
} from '@/lib/services/crm/automation/conditionsDsl';
import { fieldLabel, groupLabel, operatorLabel } from '@/lib/services/crm/automation/conditionsI18n';

const NO_VALUE: ReadonlySet<string> = new Set(['is_null', 'is_not_null']);
const LIST_VALUE: ReadonlySet<string> = new Set(['in', 'not_in']);

const FIELD_GROUPS: { prefix: string }[] = [
  { prefix: 'opportunity.' },
  { prefix: 'customer.' },
  { prefix: 'stage.' },
  { prefix: 'pipeline.' },
  { prefix: 'consent.' },
  { prefix: 'event.' },
];

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm '
  + 'text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

function valueToText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

export function textToValue(text: string, operator: string): unknown {
  const trimmed = text.trim();
  if (NO_VALUE.has(operator)) return undefined;
  if (LIST_VALUE.has(operator)) {
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part !== '' && Number.isFinite(Number(part)) ? Number(part) : part));
  }
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (Number.isFinite(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

export function toEditableGroup(value: unknown): ConditionGroup {
  if (Array.isArray(value)) return { op: 'and', rules: value as ConditionRule[] };
  if (value && typeof value === 'object' && isGroup(value as ConditionGroup)) {
    const group = value as ConditionGroup;
    return { op: group.op === 'or' ? 'or' : 'and', rules: group.rules.filter((r) => !isGroup(r)) };
  }
  if (value && typeof value === 'object' && 'field' in (value as Record<string, unknown>)) {
    return { op: 'and', rules: [value as ConditionRule] };
  }
  return { op: 'and', rules: [] };
}

interface Props {
  value: unknown;
  onChange: (next: unknown) => void;
  label?: string;
  disabled?: boolean;
}

export function ConditionBuilder({ value, onChange, label, disabled }: Props) {
  const group = toEditableGroup(value);
  const rules = group.rules as ConditionRule[];
  const [jsonText, setJsonText] = useState(
    value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '',
  );

  const emit = (next: Partial<ConditionGroup>) => {
    onChange({ op: group.op, rules, ...next });
  };

  const updateRule = (index: number, patch: Partial<ConditionRule>) => {
    emit({ rules: rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  };

  const applyJson = () => {
    try {
      const parsed = jsonText.trim() ? JSON.parse(jsonText) : { op: 'and', rules: [] };
      onChange(parsed);
    } catch {
      // El error se muestra al validar el formulario, no aquí.
    }
  };

  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
      <Tabs defaultValue="visual">
        <TabsList className="mb-2">
          <TabsTrigger value="visual">
            <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Visual
          </TabsTrigger>
          <TabsTrigger value="json">
            <Code2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> JSON avanzado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {label ?? 'Se cumple si'}
              </span>
              <select
                aria-label="Combinación de las reglas"
                className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={group.op}
                disabled={disabled}
                onChange={(e) => emit({ op: e.target.value === 'or' ? 'or' : 'and' })}
              >
                <option value="and">se cumplen TODAS las reglas</option>
                <option value="or">se cumple ALGUNA regla</option>
              </select>
            </div>
            {!disabled && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  emit({ rules: [...rules, { field: 'opportunity.amount', operator: 'gte', value: 0 }] })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Añadir regla
              </Button>
            )}
          </div>

          {rules.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sin reglas: la condición se considera siempre verdadera. Déjala vacía si no necesitas filtrar.
            </p>
          )}

          <div className="space-y-2">
            {rules.map((rule, index) => {
              const operator = String(rule.operator);
              return (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <select
                    aria-label={`Campo de la regla ${index + 1}`}
                    className={SELECT_CLASS}
                    value={String(rule.field ?? '')}
                    disabled={disabled}
                    onChange={(e) => updateRule(index, { field: e.target.value })}
                  >
                    {FIELD_GROUPS.map((grp) => {
                      const fields = CONDITION_FIELDS.filter((f) => f.startsWith(grp.prefix));
                      if (fields.length === 0) return null;
                      return (
                        <optgroup key={grp.prefix} label={groupLabel(grp.prefix)}>
                          {fields.map((f) => (
                            <option key={f} value={f}>
                              {fieldLabel(f)}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>

                  <select
                    aria-label={`Operador de la regla ${index + 1}`}
                    className={SELECT_CLASS}
                    value={operator}
                    disabled={disabled}
                    onChange={(e) => {
                      const nextOp = e.target.value as ConditionOperator;
                      updateRule(index, {
                        operator: nextOp,
                        value: textToValue(valueToText(rule.value), nextOp),
                      });
                    }}
                  >
                    {OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {operatorLabel(op)}
                      </option>
                    ))}
                  </select>

                  {NO_VALUE.has(operator) ? (
                    <span className="self-center text-xs text-gray-500 dark:text-gray-400">(sin valor)</span>
                  ) : (
                    <Input
                      aria-label={`Valor de la regla ${index + 1}`}
                      placeholder={LIST_VALUE.has(operator) ? 'a, b, c' : 'Valor'}
                      value={valueToText(rule.value)}
                      disabled={disabled}
                      onChange={(e) => updateRule(index, { value: textToValue(e.target.value, operator) })}
                    />
                  )}

                  {!disabled && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar la regla ${index + 1}`}
                      onClick={() => emit({ rules: rules.filter((_, i) => i !== index) })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="json" className="space-y-2">
          <Textarea
            rows={6}
            className="font-mono text-xs"
            placeholder='{"op":"and","rules":[{"field":"opportunity.amount","operator":"gte","value":5000000}]}'
            value={jsonText}
            disabled={disabled}
            onChange={(e) => setJsonText(e.target.value)}
            onBlur={applyJson}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Campos permitidos: opportunity.*, customer.*, stage.*, pipeline.*, consent.*, event.*
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
