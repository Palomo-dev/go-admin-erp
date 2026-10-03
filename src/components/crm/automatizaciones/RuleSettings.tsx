'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Ajustes de la regla plegados con resumen (brief §1: lo secundario se pliega,
 * no se apila): descripción, prioridad, enfriamiento y una vez por
 * oportunidad. El estado inicial (activa / desactivada) va en el pie del
 * editor, junto a guardar: no es secundario (juicio del tester, ronda 2).
 */

import { ChevronDown } from 'lucide-react';
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

export function RuleSettings({ form, errors, open, onOpenChange, onChange }: Props) {
  const tr = useAutomationText();
  const err = (field: string) => errors.find((e) => e.field === field)?.message;
  const priorityErr = err('priority');
  const cooldownErr = err('cooldown_hours');

  return <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
    <h3 className="text-base font-semibold text-fg">{tr('Límites')}</h3>
    <div className="flex items-center justify-between gap-3"><Label htmlFor="rule-once" className="text-[13px] leading-[18px]">{tr('Solo una vez por oportunidad')}</Label><Switch id="rule-once" checked={form.run_once_per_opportunity} onCheckedChange={value => onChange({ ...form, run_once_per_opportunity: value })} /></div>
    <div className="flex items-center justify-between gap-3"><Label htmlFor="rule-cooldown" className="text-[13px] leading-[18px]">{tr('Enfriamiento (horas)')}</Label><Input id="rule-cooldown" type="number" inputMode="numeric" min={0} max={8760} className="h-10 w-28 rounded-lg border-line-strong bg-surface text-right" value={form.cooldown_hours} aria-invalid={!!cooldownErr} aria-describedby={cooldownErr ? 'rule-cooldown-error' : 'rule-cooldown-hint'} onChange={event => onChange({ ...form, cooldown_hours: Number(event.target.value) })} /></div>
    {cooldownErr ? <p id="rule-cooldown-error" role="alert" className="text-xs text-danger-text">{tr(cooldownErr)}</p> : <p id="rule-cooldown-hint" className="sr-only">{tr('Tiempo mínimo entre dos ejecuciones sobre la misma oportunidad. 0 = sin límite.')}</p>}
    <div className="flex items-center justify-between gap-3"><Label htmlFor="rule-active" className="text-[13px] leading-[18px]">{tr('Activa')}</Label><Switch id="rule-active" checked={form.is_active} onCheckedChange={value => onChange({ ...form, is_active: value })} /></div>
    <Collapsible open={open} onOpenChange={onOpenChange}><CollapsibleTrigger asChild><button type="button" className="flex w-full items-center justify-between gap-2 rounded-md text-left text-xs text-fg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tr('Descripción y prioridad')}<ChevronDown className={cn('size-4', open && 'rotate-180')} strokeWidth={1.5} aria-hidden /></button></CollapsibleTrigger><CollapsibleContent className="space-y-3 pt-3"><div><Label htmlFor="rule-desc" className="text-xs text-fg-secondary">{tr('Descripción (opcional)')}</Label><Textarea id="rule-desc" rows={2} value={form.description} onChange={event => onChange({ ...form, description: event.target.value })} /></div><div><Label htmlFor="rule-priority" className="text-xs text-fg-secondary">{tr('Prioridad')}</Label><Input id="rule-priority" type="number" min={0} max={10000} value={form.priority} aria-invalid={!!priorityErr} aria-describedby={priorityErr ? 'rule-priority-error' : 'rule-priority-hint'} onChange={event => onChange({ ...form, priority: Number(event.target.value) })} />{priorityErr ? <p id="rule-priority-error" role="alert" className="text-xs text-danger-text">{tr(priorityErr)}</p> : <p id="rule-priority-hint" className="text-xs text-fg-secondary">{tr('Menor número, se evalúa antes. 100 por defecto.')}</p>}</div></CollapsibleContent></Collapsible>
  </section>;
}
