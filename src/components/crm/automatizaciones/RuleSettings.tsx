'use client';

/**
 * Ajustes de la regla plegados con resumen (brief §1: lo secundario se pliega,
 * no se apila): descripción, prioridad, enfriamiento y una vez por
 * oportunidad. El estado inicial (activa / desactivada) va en el pie del
 * editor, junto a guardar: no es secundario (juicio del tester, ronda 2).
 */

import { ChevronDown, Settings2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils/Utils';
import type { FormError, RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';

interface Props {
  form: RuleFormState;
  errors: FormError[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: RuleFormState) => void;
}

function summary(form: RuleFormState): string {
  return [
    `prioridad ${form.priority}`,
    form.run_once_per_opportunity ? 'una vez por oportunidad' : 'se repite por oportunidad',
    form.cooldown_hours > 0 ? `enfriamiento ${form.cooldown_hours} h` : 'sin enfriamiento',
  ].join(' · ');
}

export function RuleSettings({ form, errors, open, onOpenChange, onChange }: Props) {
  const err = (field: string) => errors.find((e) => e.field === field)?.message;
  const priorityErr = err('priority');
  const cooldownErr = err('cooldown_hours');

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-xl border border-gray-200 dark:border-gray-800">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Settings2 className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Ajustes</span>
            <span className="truncate text-xs text-gray-600 dark:text-gray-400">{summary(form)}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t border-gray-200 px-4 pb-4 pt-3 dark:border-gray-800">
        <div>
          <Label htmlFor="rule-desc" className="text-xs text-gray-700 dark:text-gray-300">Descripción (opcional)</Label>
          <Textarea id="rule-desc" rows={2} value={form.description} placeholder="Para qué sirve esta regla, en una frase."
            onChange={(e) => onChange({ ...form, description: e.target.value })} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rule-priority" className="text-xs text-gray-700 dark:text-gray-300">Prioridad</Label>
            <Input id="rule-priority" type="number" inputMode="numeric" min={0} max={10000} value={form.priority}
              aria-invalid={!!priorityErr}
              aria-describedby={priorityErr ? 'rule-priority-error' : 'rule-priority-hint'}
              onChange={(e) => onChange({ ...form, priority: Number(e.target.value) })} />
            {priorityErr
              ? <p id="rule-priority-error" role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{priorityErr}</p>
              : <p id="rule-priority-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">Menor número, se evalúa antes. 100 por defecto.</p>}
          </div>
          <div>
            <Label htmlFor="rule-cooldown" className="text-xs text-gray-700 dark:text-gray-300">Enfriamiento (horas)</Label>
            <Input id="rule-cooldown" type="number" inputMode="numeric" min={0} max={8760} value={form.cooldown_hours}
              aria-invalid={!!cooldownErr}
              aria-describedby={cooldownErr ? 'rule-cooldown-error' : 'rule-cooldown-hint'}
              onChange={(e) => onChange({ ...form, cooldown_hours: Number(e.target.value) })} />
            {cooldownErr
              ? <p id="rule-cooldown-error" role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{cooldownErr}</p>
              : <p id="rule-cooldown-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">Tiempo mínimo entre dos ejecuciones sobre la misma oportunidad. 0 = sin límite.</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="rule-once" checked={form.run_once_per_opportunity} onCheckedChange={(v) => onChange({ ...form, run_once_per_opportunity: v })} />
          <Label htmlFor="rule-once" className="text-sm text-gray-900 dark:text-gray-100">Solo una vez por oportunidad</Label>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
