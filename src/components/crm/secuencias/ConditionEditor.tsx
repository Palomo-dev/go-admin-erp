'use client';

/**
 * Editor de la condición de un paso `condition` (FASE-08 §2.4).
 *
 * Existe por el hallazgo N10 del tester (ronda 3): el selector de canales
 * ofrecía «Condición» y el diálogo de inscripción la anunciaba como «puede
 * cortar la secuencia», pero **no había forma de configurarla** desde el
 * producto, y una condición vacía evaluaba a VERDADERO. Es decir: un freno
 * pintado. Aquí se configura de verdad, y el servidor rechaza el paso si se
 * queda sin reglas (`validateSequenceSteps`).
 *
 * El formato guardado es el del DSL: `{ op: 'and'|'or', rules: [{field,
 * operator, value}] }`, el mismo que evalúa `evaluateConditionTree`.
 */

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONDITION_FIELDS,
  OPERATORS,
  isGroup,
  type ConditionGroup,
  type ConditionOperator,
  type ConditionRule,
} from '@/lib/services/crm/automation/conditionsDsl';

const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  eq: 'es igual a',
  ne: 'no es igual a',
  gt: 'mayor que',
  gte: 'mayor o igual que',
  lt: 'menor que',
  lte: 'menor o igual que',
  in: 'está en (lista, separada por comas)',
  not_in: 'no está en (lista, separada por comas)',
  contains: 'contiene',
  not_contains: 'no contiene',
  is_null: 'está vacío',
  is_not_null: 'no está vacío',
  before: 'es anterior a (fecha)',
  after: 'es posterior a (fecha)',
  within_days: 'en los últimos N días',
};

/** Operadores que no usan valor: el input se oculta. */
const NO_VALUE: ReadonlySet<string> = new Set(['is_null', 'is_not_null']);
/** Operadores de lista: el valor se guarda como arreglo. */
const LIST_VALUE: ReadonlySet<string> = new Set(['in', 'not_in']);

// N18 (tester F8 r4): este editor solo se usa en SECUENCIAS, y ahi el contexto
// no lleva evento, porque una secuencia avanza por su propia cadena de pasos y
// no por un disparador. Un campo `event.*` evaluaria siempre a falso y, con el
// corte a prueba de fallos que se acaba de anadir, la secuencia se cortaria
// SIEMPRE. Ofrecerlo era una trampa de usabilidad: el editor invitaba a elegir
// justo lo unico que no puede funcionar. Los campos de evento siguen validos en
// las reglas de automatizacion, que si reciben el evento.
const FIELD_GROUPS: { label: string; prefix: string }[] = [
  { label: 'Oportunidad', prefix: 'opportunity.' },
  { label: 'Cliente', prefix: 'customer.' },
  { label: 'Etapa', prefix: 'stage.' },
  { label: 'Pipeline', prefix: 'pipeline.' },
  { label: 'Consentimiento', prefix: 'consent.' },
];

const SELECT_CLASS = 'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm '
  + 'text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

/** Lee el valor guardado y lo devuelve como texto editable. */
function valueToText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

/** Convierte el texto del input al tipo que espera el evaluador. */
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

/** Normaliza lo que venga guardado a un grupo editable (sin anidamiento). */
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
  /** Valor actual de `sequence_steps.condition`. */
  value: unknown;
  onChange: (next: ConditionGroup) => void;
  /** Sufijo para los `id`/`aria-label` (hay un editor por paso). */
  stepLabel: string;
  disabled?: boolean;
}

export function ConditionEditor({ value, onChange, stepLabel, disabled }: Props) {
  const group = toEditableGroup(value);
  const rules = group.rules as ConditionRule[];

  const emit = (next: Partial<ConditionGroup>) => {
    onChange({ op: group.op, rules, ...next });
  };

  const updateRule = (index: number, patch: Partial<ConditionRule>) => {
    emit({ rules: rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  };

  return (
    <div className="mt-2 rounded-md border border-dashed border-gray-300 p-3 dark:border-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Se cumple si
          </span>
          <select
            aria-label={`Combinación de las reglas del ${stepLabel}`}
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
            onClick={() => emit({
              rules: [...rules, { field: 'opportunity.amount', operator: 'gte', value: 0 }],
            })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Añadir regla
          </Button>
        )}
      </div>

      {rules.length === 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
          Sin reglas no se puede guardar: una condición vacía dejaría pasar el paso siguiente en vez
          de cortar la secuencia.
        </p>
      )}

      <div className="mt-2 space-y-2">
        {rules.map((rule, index) => {
          const operator = String(rule.operator);
          return (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select
                aria-label={`Campo de la regla ${index + 1} del ${stepLabel}`}
                className={SELECT_CLASS}
                value={String(rule.field ?? '')}
                disabled={disabled}
                onChange={(e) => updateRule(index, { field: e.target.value })}
              >
                {FIELD_GROUPS.map((grp) => {
                  const fields = CONDITION_FIELDS.filter((f) => f.startsWith(grp.prefix));
                  if (fields.length === 0) return null;
                  return (
                    <optgroup key={grp.prefix} label={grp.label}>
                      {fields.map((f) => (
                        <option key={f} value={f}>{f.slice(grp.prefix.length)}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>

              <select
                aria-label={`Operador de la regla ${index + 1} del ${stepLabel}`}
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
                  <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>
                ))}
              </select>

              {NO_VALUE.has(operator) ? (
                <span className="self-center text-xs text-gray-500 dark:text-gray-400">
                  (sin valor)
                </span>
              ) : (
                <Input
                  aria-label={`Valor de la regla ${index + 1} del ${stepLabel}`}
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
                  aria-label={`Eliminar la regla ${index + 1} del ${stepLabel}`}
                  onClick={() => emit({ rules: rules.filter((_, i) => i !== index) })}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Si la condición no se cumple, la secuencia se corta y los pasos siguientes no se ejecutan.
        Si no se puede evaluar (error de lectura), también se corta: nunca continúa a ciegas.
      </p>
    </div>
  );
}
