'use client';

/**
 * Alta/edición de una secuencia con su lista de pasos (FASE-08 §5.3).
 * Los pasos se validan también en el servidor (`validateSequenceSteps`).
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { isEmptyConditionTree } from '@/lib/services/crm/automation/conditionsDsl';
import { ConditionEditor } from './ConditionEditor';
import type { SequenceStepView, SequenceView } from './useSequences';

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Llamada (tarea con guion)' },
  { value: 'task', label: 'Tarea' },
  { value: 'wait', label: 'Espera' },
  { value: 'condition', label: 'Condición (corta la secuencia si no se cumple)' },
  { value: 'sms', label: 'SMS (sin proveedor)' },
];

const TRIGGERS = [
  { value: 'manual', label: 'Manual' },
  { value: 'stage_change', label: 'Cambio de etapa' },
  { value: 'lead_capture', label: 'Captura de lead' },
  { value: 'event', label: 'Evento' },
  { value: 'custom', label: 'Personalizado' },
];

const EXIT_CONDITIONS = ['won_lost', 'stage_changed', 'opted_out', 'replied'];

interface Props {
  open: boolean;
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] }) => Promise<unknown>;
}

export function SequenceFormDialog({ open, sequence, onOpenChange, onSave }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [isActive, setIsActive] = useState(false);
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const [exits, setExits] = useState<string[]>(['won_lost']);
  const [steps, setSteps] = useState<SequenceStepView[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(sequence?.name ?? '');
    setDescription(sequence?.description ?? '');
    setTriggerType(sequence?.trigger_type ?? 'manual');
    setIsActive(sequence?.is_active ?? false);
    setPauseOnReply(sequence?.pause_on_reply ?? true);
    setExits(
      ((sequence?.exit_conditions ?? ['won_lost']) as unknown[])
        .map((c) => (typeof c === 'string' ? c : (c as { type?: string })?.type ?? ''))
        .filter(Boolean),
    );
    setSteps(sequence?.steps?.length ? sequence.steps : [{ step_number: 1, delay_days: 0, channel: 'email', action_config: {} }]);
  }, [open, sequence]);

  const updateStep = (index: number, patch: Partial<SequenceStepView>) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const updateConfig = (index: number, key: string, value: string) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, action_config: { ...(s.action_config ?? {}), [key]: value } } : s)));
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      toast({ title: 'Falta el nombre', description: 'Mínimo 2 caracteres.', variant: 'destructive' });
      return;
    }
    const invalid = steps.find((s) => !Number.isInteger(s.delay_days) || s.delay_days < 0 || s.delay_days > 3650);
    if (invalid) {
      toast({ title: 'Retardo inválido', description: 'delay_days debe ser un entero entre 0 y 3650.', variant: 'destructive' });
      return;
    }
    // Un paso de condición sin reglas dejaría pasar el paso siguiente en vez de
    // cortarlo (tester r3 N10). El servidor también lo rechaza; esto solo evita
    // el viaje.
    if (!sequence) {
      const emptyIndex = steps.findIndex((s) => s.channel === 'condition' && isEmptyConditionTree(s.condition));
      if (emptyIndex >= 0) {
        toast({
          title: `El paso ${emptyIndex + 1} es una condición sin reglas`,
          description: 'Añade al menos una regla: una condición vacía no cortaría nada.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        ...(sequence ? { id: sequence.id } : {}),
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        is_active: isActive,
        pause_on_reply: pauseOnReply,
        exit_conditions: exits,
        ...(sequence ? {} : { steps: steps.map((s, i) => ({ ...s, step_number: i + 1 })) }),
      } as Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] });
      toast({ title: sequence ? 'Secuencia actualizada' : 'Secuencia creada' });
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
          <DialogTitle>{sequence ? 'Editar secuencia' : 'Nueva secuencia'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="seq-name">Nombre</Label>
              <Input id="seq-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="seq-trigger">Disparador</Label>
              <select
                id="seq-trigger"
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
              >
                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="seq-desc">Descripción</Label>
            <Textarea id="seq-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch id="seq-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="seq-active">Activa</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="seq-pause" checked={pauseOnReply} onCheckedChange={setPauseOnReply} />
              <Label htmlFor="seq-pause">Pausar si el cliente responde</Label>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">Condiciones de salida</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {EXIT_CONDITIONS.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={exits.includes(c)}
                    onChange={(e) => setExits(e.target.checked ? [...exits, c] : exits.filter((x) => x !== c))}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pasos ({steps.length})</Label>
              {!sequence && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSteps([...steps, { step_number: steps.length + 1, delay_days: 1, channel: 'email', action_config: {} }])}
                >
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Añadir paso
                </Button>
              )}
            </div>
            {sequence && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los pasos de una secuencia existente no se editan aquí para no romper las inscripciones en curso.
              </p>
            )}
            {steps.map((step, index) => (
              <div key={index} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Paso {index + 1}</span>
                  <select
                    aria-label={`Canal del paso ${index + 1}`}
                    className="h-9 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    value={step.channel}
                    disabled={!!sequence}
                    onChange={(e) => updateStep(index, {
                      channel: e.target.value,
                      condition: e.target.value === 'condition'
                        ? (step.condition ?? { op: 'and', rules: [] })
                        : undefined,
                    })}
                  >
                    {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <Input
                    aria-label={`Retardo en días del paso ${index + 1}`}
                    type="number"
                    min={0}
                    max={3650}
                    className="w-24"
                    disabled={!!sequence}
                    value={step.delay_days}
                    onChange={(e) => updateStep(index, { delay_days: Number(e.target.value) })}
                  />
                  {!sequence && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Eliminar paso ${index + 1}`}
                      onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                {step.channel === 'condition' && (
                  <ConditionEditor
                    value={step.condition}
                    stepLabel={`paso ${index + 1}`}
                    disabled={!!sequence}
                    onChange={(next) => updateStep(index, { condition: next })}
                  />
                )}
                {!sequence && (step.channel === 'email' || step.channel === 'whatsapp' || step.channel === 'task' || step.channel === 'call') && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label={`Asunto o título del paso ${index + 1}`}
                      placeholder={step.channel === 'email' ? 'Asunto' : 'Título'}
                      value={String((step.action_config ?? {})[step.channel === 'email' ? 'subject' : 'title'] ?? '')}
                      onChange={(e) => updateConfig(index, step.channel === 'email' ? 'subject' : 'title', e.target.value)}
                    />
                    <Input
                      aria-label={`Plantilla del paso ${index + 1}`}
                      placeholder="Plantilla (id, opcional)"
                      value={String(step.template_id ?? '')}
                      onChange={(e) => updateStep(index, { template_id: e.target.value || null })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
