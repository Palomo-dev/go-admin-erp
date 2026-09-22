'use client';

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
  const sentence = describeRule(
    { ...form, pipeline_id: form.pipeline_id || null, stage_id: form.stage_id || null, event: form.event || null },
    lookups,
  );
  const notes = previewNotes(form);

  return (
    <section
      aria-labelledby="rule-preview-title"
      className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60"
    >
      <h3 id="rule-preview-title" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Así funcionará
      </h3>
      {/* `break-words`: los marcadores «{{opportunity_name}}» no tienen espacios y en móvil no cabían en una línea. */}
      <p aria-live="polite" className="mt-2 min-w-0 break-words text-sm leading-relaxed text-gray-900 dark:text-gray-100">{sentence}</p>
      {notes.length > 0 && (
        <p className="mt-1 break-words text-xs text-gray-600 dark:text-gray-400">
          {notes.map((e, i) => (i === 0 ? e.charAt(0).toUpperCase() + e.slice(1) : e)).join(' · ')}.
        </p>
      )}
    </section>
  );
}
