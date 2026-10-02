'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Vista previa en texto de lo que hará la regla, actualizada en vivo
 * (`aria-live="polite"`): la misma frase que verá el usuario en la lista.
 */

import { Eye } from 'lucide-react';
import { describeRule, type HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';
import { previewNotes, type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';

interface Props {
  form: RuleFormState;
  lookups: HumanizerLookups;
}

export function RulePreview({ form, lookups }: Props) {
  const tr = useAutomationText();
  const sentence = describeRule(
    { ...form, pipeline_id: form.pipeline_id || null, stage_id: form.stage_id || null, event: form.event || null },
    lookups,
  );
  const notes = previewNotes(form, tr);

  return (
    <section
      aria-labelledby="rule-preview-title"
      className="rounded-xl border border-line-brand bg-brand-tint p-4"
    >
      <h3 id="rule-preview-title" className="flex items-center gap-2 text-base font-semibold leading-[22px] text-brand-deep">
        <Eye strokeWidth={1.5} className="h-3.5 w-3.5" aria-hidden="true" /> {tr("En palabras")}</h3>
      {/* `break-words`: los marcadores «{{opportunity_name}}» no tienen espacios y en móvil no cabían en una línea. */}
      <p aria-live="polite" className="mt-2 min-w-0 break-words text-sm leading-relaxed text-fg dark:text-fg">{sentence}</p>
      {notes.length > 0 && (
        <p className="mt-1 break-words text-xs text-fg-secondary dark:text-fg-secondary">
          {notes.map((e, i) => (i === 0 ? tr(e).charAt(0).toUpperCase() + tr(e).slice(1) : tr(e))).join(' · ')}.
        </p>
      )}
    </section>
  );
}
