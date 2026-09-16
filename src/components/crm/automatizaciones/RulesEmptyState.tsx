'use client';

/**
 * Estado vacío con propósito (brief §3): ilustración ligera, una frase y la
 * acción principal, con un ejemplo real que se puede usar tal cual.
 */

import { Sparkles, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeRule } from '@/lib/services/crm/automation/ruleHumanizer';
import { EXAMPLE_FORM } from '@/lib/services/crm/automation/ruleEditorModel';
import { Appear } from './motion';

interface Props {
  /** `true` cuando hay reglas pero ninguna pasa los filtros. */
  filtered: boolean;
  onCreate: () => void;
  onUseExample: () => void;
  onClearFilters: () => void;
}

export function RulesEmptyState({ filtered, onCreate, onUseExample, onClearFilters }: Props) {
  if (filtered) {
    return (
      <Appear className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
        <p className="font-medium text-gray-900 dark:text-gray-100">Ninguna regla coincide con los filtros</p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>Quitar filtros</Button>
      </Appear>
    );
  }

  return (
    <Appear className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60">
        <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Deja que el CRM trabaje solo</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Una regla vigila el pipeline y actúa por ti: escribe, crea tareas, mueve etapas. Esta es una de las más usadas:
      </p>

      <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-left dark:border-blue-900/60 dark:bg-blue-950/30">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Ejemplo: {EXAMPLE_FORM.name}
        </p>
        {/* R-3: la misma frase que el ejemplo produce de verdad (sin etapa fija); la etapa se elige en el editor. */}
        <p className="mt-1.5 text-sm text-gray-800 dark:text-gray-200">
          {describeRule({ ...EXAMPLE_FORM, pipeline_id: null, stage_id: null, event: null })}
        </p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          En el editor eliges la etapa que la dispara (por ejemplo, «Propuesta enviada»).
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={onUseExample}>
          Usar este ejemplo <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" onClick={onCreate}>Empezar desde cero</Button>
      </div>
    </Appear>
  );
}
