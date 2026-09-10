'use client';

/**
 * Alta/edición de una regla de automatización (FASE-08 §5.3).
 * La validación real vive en el servidor; aquí solo se evita enviar basura.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { RuleActionsEditor } from './RuleActionsEditor';
import type { AutomationRuleView, RuleAction } from './useAutomationRules';

const TRIGGERS: { value: string; label: string }[] = [
  { value: 'stage_change', label: 'Cambio de etapa' },
  { value: 'event', label: 'Evento del CRM' },
  { value: 'field_change', label: 'Cambio de campo' },
  { value: 'schedule', label: 'Programada' },
  { value: 'manual', label: 'Manual' },
];

interface Props {
  open: boolean;
  rule: AutomationRuleView | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Partial<AutomationRuleView> & { id?: string }) => Promise<unknown>;
}

interface FormState {
  name: string;
  description: string;
  trigger_type: string;
  stage_id: string;
  pipeline_id: string;
  priority: number;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  is_active: boolean;
  actions: RuleAction[];
  conditionsText: string;
}

const EMPTY: FormState = {
  name: '',
  description: '',
  trigger_type: 'stage_change',
  stage_id: '',
  pipeline_id: '',
  priority: 100,
  run_once_per_opportunity: true,
  cooldown_hours: 0,
  is_active: false,
  actions: [],
  conditionsText: '',
};

export function RuleFormDialog({ open, rule, onOpenChange, onSave }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(rule
      ? {
        name: rule.name,
        description: rule.description ?? '',
        trigger_type: rule.trigger_type,
        stage_id: rule.stage_id ?? '',
        pipeline_id: rule.pipeline_id ?? '',
        priority: rule.priority ?? 100,
        run_once_per_opportunity: rule.run_once_per_opportunity ?? true,
        cooldown_hours: rule.cooldown_hours ?? 0,
        is_active: rule.is_active,
        actions: rule.actions ?? [],
        conditionsText: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : '',
      }
      : EMPTY);
  }, [open, rule]);

  const submit = async () => {
    if (form.name.trim().length < 2) {
      toast({ title: 'Falta el nombre', description: 'Mínimo 2 caracteres.', variant: 'destructive' });
      return;
    }
    let conditions: unknown = { op: 'and', rules: [] };
    if (form.conditionsText.trim()) {
      try {
        conditions = JSON.parse(form.conditionsText);
      } catch {
        toast({ title: 'Condiciones inválidas', description: 'El JSON no se pudo interpretar.', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        ...(rule ? { id: rule.id } : {}),
        name: form.name.trim(),
        description: form.description.trim() || null,
        trigger_type: form.trigger_type,
        stage_id: form.stage_id.trim() || null,
        pipeline_id: form.pipeline_id.trim() || null,
        priority: Number(form.priority) || 100,
        run_once_per_opportunity: form.run_once_per_opportunity,
        cooldown_hours: Number(form.cooldown_hours) || 0,
        is_active: form.is_active,
        actions: form.actions,
        conditions,
      } as Partial<AutomationRuleView> & { id?: string });
      toast({ title: rule ? 'Regla actualizada' : 'Regla creada' });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'No se pudo guardar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar regla' : 'Nueva regla'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rule-name">Nombre</Label>
              <Input id="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rule-trigger">Disparador</Label>
              <select
                id="rule-trigger"
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={form.trigger_type}
                onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
              >
                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="rule-desc">Descripción</Label>
            <Textarea id="rule-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rule-stage">Etapa (id, opcional)</Label>
              <Input id="rule-stage" value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rule-pipeline">Pipeline (id, opcional)</Label>
              <Input id="rule-pipeline" value={form.pipeline_id} onChange={(e) => setForm({ ...form, pipeline_id: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rule-priority">Prioridad</Label>
              <Input id="rule-priority" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="rule-cooldown">Enfriamiento (horas)</Label>
              <Input id="rule-cooldown" type="number" value={form.cooldown_hours} onChange={(e) => setForm({ ...form, cooldown_hours: Number(e.target.value) })} />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch id="rule-once" checked={form.run_once_per_opportunity} onCheckedChange={(v) => setForm({ ...form, run_once_per_opportunity: v })} />
              <Label htmlFor="rule-once">Una vez por oportunidad</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="rule-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="rule-active">Activa</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="rule-conditions">Condiciones (JSON de la DSL)</Label>
            <Textarea
              id="rule-conditions"
              rows={4}
              className="font-mono text-xs"
              placeholder='{"op":"and","rules":[{"field":"opportunity.amount","operator":"gte","value":5000000}]}'
              value={form.conditionsText}
              onChange={(e) => setForm({ ...form, conditionsText: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Campos permitidos: opportunity.*, customer.*, stage.*, pipeline.*, consent.*, event.*
            </p>
          </div>

          <RuleActionsEditor actions={form.actions} onChange={(actions) => setForm({ ...form, actions })} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
