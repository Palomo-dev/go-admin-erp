'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Estado vacío con propósito (brief §3): ilustración ligera, una frase y la
 * acción principal, con un ejemplo real que se puede usar tal cual.
 */

import { Sparkles, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeRule } from '@/lib/services/crm/automation/ruleHumanizer';
import { EXAMPLE_FORM } from '@/lib/services/crm/automation/ruleEditorModel';
import { FadeIn } from '@/components/shared/motion';

interface Props {
  canManage?: boolean;
  /** `true` cuando hay reglas pero ninguna pasa los filtros. */
  filtered: boolean;
  onCreate: () => void;
  onUseExample: () => void;
  onClearFilters: () => void;
}

export function RulesEmptyState({ filtered, onCreate, onUseExample, onClearFilters, canManage = false }: Props) {
  const tr = useAutomationText();
  if (filtered) {
    return (
      <FadeIn className="rounded-xl border border-dashed border-line-strong p-8 text-center dark:border-line-strong">
        <p className="font-medium text-fg dark:text-fg">{tr("Ninguna regla coincide con los filtros")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>{tr("Quitar filtros")}</Button>
      </FadeIn>
    );
  }

  return (
    <FadeIn className="mx-auto max-w-2xl rounded-xl border border-line bg-surface p-8 text-center shadow-sm dark:border-line dark:bg-surface">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint dark:bg-blue-950/60">
        <Sparkles strokeWidth={1.5} className="h-7 w-7 text-brand dark:text-brand" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-fg dark:text-fg">{tr("Deja que el CRM trabaje solo")}</h2>
      <p className="mt-1 text-sm text-fg-secondary dark:text-fg-secondary">
        {tr("Una regla vigila el pipeline y actúa por ti: escribe, crea tareas, mueve etapas. Esta es una de las más usadas:")}</p>

      <div className="mt-5 rounded-lg border border-line-brand bg-brand-tint/60 p-4 text-left dark:border-line-brand/60 dark:bg-blue-950/30">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-deep dark:text-blue-300">
          <Zap strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" /> {tr("Ejemplo:")}{EXAMPLE_FORM.name}
        </p>
        {/* R-3: la misma frase que el ejemplo produce de verdad (sin etapa fija); la etapa se elige en el editor. */}
        <p className="mt-1.5 text-sm text-fg dark:text-fg">
          {describeRule({ ...EXAMPLE_FORM, pipeline_id: null, stage_id: null, event: null }, { text:tr })}
        </p>
        <p className="mt-1 text-xs text-fg-secondary dark:text-fg-secondary">
          {tr("En el editor eliges la etapa que la dispara (por ejemplo, «Propuesta enviada»).")}</p>
      </div>

      {canManage && <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" className="bg-brand text-white hover:bg-brand-deep" onClick={onUseExample}>
          {tr("Usar este ejemplo")}<ArrowRight strokeWidth={1.5} className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" onClick={onCreate}>{tr("Empezar desde cero")}</Button>
      </div>}
    </FadeIn>
  );
}
