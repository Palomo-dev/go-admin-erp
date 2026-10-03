'use client';
import { useLocale } from 'next-intl';
import { describeRule } from '@/lib/services/crm/automation/ruleHumanizer';
import { useAutomationText } from './useAutomationText';

/**
 * Estado vacío con propósito (brief §3): ilustración ligera, una frase y la
 * acción principal, con un ejemplo real que se puede usar tal cual.
 */

import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';
import { ruleTemplates } from './ruleTemplates';
import { FadeIn } from '@/components/shared/motion';

interface Props {
  canManage?: boolean;
  /** `true` cuando hay reglas pero ninguna pasa los filtros. */
  filtered: boolean;
  onCreate: () => void;
  onUseExample: () => void;
  onClearFilters: () => void;
  onUseTemplate?: (form: RuleFormState) => void;
}

export function RulesEmptyState({ filtered, onCreate, onUseExample, onClearFilters, onUseTemplate, canManage = false }: Props) {
  const tr = useAutomationText();
  const locale = useLocale();
  if (filtered) {
    return (
      <FadeIn className="rounded-xl border border-dashed border-line-strong p-8 text-center dark:border-line-strong">
        <p className="font-medium text-fg dark:text-fg">{tr("Ninguna regla coincide con los filtros")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={onClearFilters}>{tr("Quitar filtros")}</Button>
      </FadeIn>
    );
  }

  const templates = ruleTemplates();
  return <FadeIn className="rounded-xl border border-line bg-surface px-6 pb-12 pt-20 text-center">
    <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-tint"><Zap className="size-6 text-brand-deep" strokeWidth={1.5} aria-hidden /></div>
    <h2 className="mt-4 text-base font-semibold text-fg">{tr('Aún no tienes automatizaciones')}</h2>
    <p className="mx-auto mt-3 max-w-md text-sm leading-5 text-fg-secondary">{tr('Empieza con una plantilla probada: se crea pausada para que la revises y la pruebes en seco.')}</p>
    <div className="mx-auto mt-16 grid max-w-3xl gap-3 text-left md:grid-cols-3">{templates.map((template, index) => <div key={template.name} className="rounded-xl border border-line p-4"><h3 className="text-sm font-medium text-fg">{tr(template.name)}</h3><p className="mt-1.5 min-h-8 line-clamp-2 text-xs leading-4 text-fg-secondary">{describeRule(template, { text: tr, locale }).replace(` (${template.event})`, '')}</p>{canManage && <Button type="button" size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => onUseTemplate ? onUseTemplate(template) : index === 0 ? onUseExample() : onCreate()}>{tr('Usar plantilla')}</Button>}</div>)}</div>
    {canManage && <button type="button" onClick={onCreate} className="sr-only focus:not-sr-only">{tr('Empezar desde cero')}</button>}
  </FadeIn>;
}
