'use client';
import { useSequenceText } from './useSequenceText';

/**
 * Bifurcación de un paso `condition` en la línea de tiempo (brief UX 6.3):
 * las reglas (con el `ConditionEditor` existente, sin reescribirlo) y, debajo,
 * las dos ramas explícitas —se cumple: continúa; no se cumple: se corta—
 * para que el corte no sea un campo escondido.
 */

import { ArrowDownRight, Scissors } from 'lucide-react';
import type { ConditionGroup } from '@/lib/services/crm/automation/conditionsDsl';
import { ConditionEditor } from './ConditionEditor';

interface Props {
  value: unknown;
  stepNumber: number;
  isLast: boolean;
  disabled: boolean;
  onChange: (next: ConditionGroup) => void;
}

export function StepBranch({ value, stepNumber, isLast, disabled, onChange }: Props) {
 const tr=useSequenceText();
  return (
    <div className="mt-2">
      <ConditionEditor value={value} stepLabel={tr("paso {p0}",{p0:stepNumber})} disabled={disabled} onChange={onChange} />
      <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label={tr("Ramas del paso {p0}",{p0:stepNumber})}>
        <li className="flex items-start gap-2 rounded-md border-l-4 border-emerald-600 bg-emerald-50 p-2 text-sm text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100">
          <ArrowDownRight strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{tr("Se cumple:")}</strong> {isLast ? tr("la secuencia termina.") : tr("continúa al paso {p0}.",{p0:stepNumber + 1})}
          </span>
        </li>
        <li className="flex items-start gap-2 rounded-md border-l-4 border-red-600 bg-red-50 p-2 text-sm text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-100">
          <Scissors strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>{tr("No se cumple")}</strong> {tr("(o no se puede evaluar): se corta aquí y no sale nada más.")}</span>
        </li>
      </ul>
    </div>
  );
}
