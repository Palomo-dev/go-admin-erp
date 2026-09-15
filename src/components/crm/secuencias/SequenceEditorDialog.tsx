'use client';

/**
 * Alta/edición de una secuencia (FASE-08 §5.3, rediseño UX brief 6.3).
 *
 * Arriba lo esencial (nombre, disparador, activa); lo secundario plegado en
 * «Más ajustes»; debajo la línea de tiempo vertical de pasos
 * (`StepTimelineEditor`). Errores junto al campo con `aria-describedby` y
 * foco al primero. La validación de fondo sigue en `validateSequenceSteps`.
 *
 * Los pasos de una secuencia EXISTENTE siguen siendo de solo lectura (no se
 * rompen las inscripciones en curso): la línea se muestra sin controles.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/use-toast';
import { isEmptyConditionTree } from '@/lib/services/crm/automation/conditionsDsl';
import { exitConditionLabel } from '@/lib/services/crm/automation/conditionsI18n';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { StepTimelineEditor, newEditorStep, type EditorStep } from './StepTimelineEditor';
import { ALWAYS_ON_EXIT_CONDITION, EXIT_CONDITION_VALUES, SELECT_CLASS, TRIGGER_OPTIONS, hoursError, unsupportedExitConditions } from './sequenceOptions';
import type { SequenceStepView, SequenceView } from './useSequences';

const OFFERED_EXITS: ReadonlySet<string> = new Set(EXIT_CONDITION_VALUES);

/** El `uid` es solo del cliente: no viaja al servidor. */
function stripUid(step: EditorStep): SequenceStepView {
  const copy: Partial<EditorStep> = { ...step };
  delete copy.uid;
  return copy as SequenceStepView;
}

interface Props {
  open: boolean;
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] }) => Promise<unknown>;
  /** Adónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback?: () => HTMLElement | null;
}

export function SequenceEditorDialog({ open, sequence, onOpenChange, onSave, returnFocusFallback }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [isActive, setIsActive] = useState(false);
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const [exits, setExits] = useState<string[]>(['won_lost']);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const readOnlySteps = !!sequence;
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  // Condiciones guardadas que el motor no evalúa (`stage_changed`, `replied`):
  // al guardar se pierden; se avisa en vez de borrarlas en silencio (r2).
  const droppedExits = unsupportedExitConditions(sequence?.exit_conditions);

  useEffect(() => {
    if (!open) return;
    setName(sequence?.name ?? '');
    setDescription(sequence?.description ?? '');
    setTriggerType(sequence?.trigger_type ?? 'manual');
    setIsActive(sequence?.is_active ?? false);
    setPauseOnReply(sequence?.pause_on_reply ?? true);
    // Solo las condiciones que el motor implementa; `won_lost` va siempre
    // (checkExitConditions la añade aunque no esté guardada) — r2 #3 y R6.
    setExits(Array.from(new Set([
      ALWAYS_ON_EXIT_CONDITION,
      ...((sequence?.exit_conditions ?? []) as unknown[])
        .map((c) => (typeof c === 'string' ? c : (c as { type?: string })?.type ?? ''))
        .filter((c) => OFFERED_EXITS.has(c)),
    ])));
    setSteps(
      sequence?.steps?.length
        ? sequence.steps.map((s, i) => ({ ...s, uid: s.id ?? `s-${i}` }))
        : [newEditorStep(1, 0)],
    );
    setMoreOpen(!!sequence?.description || unsupportedExitConditions(sequence?.exit_conditions).length > 0);
    setNameError(null);
    setStepsError(null);
    setServerError(null);
  }, [open, sequence]);

  const submit = async () => {
    setServerError(null);
    if (name.trim().length < 2) {
      setNameError('Escribe un nombre de al menos 2 caracteres.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);

    if (!readOnlySteps) {
      const badDelay = steps.findIndex((s) => !Number.isInteger(s.delay_days) || s.delay_days < 0 || s.delay_days > 3650);
      if (badDelay >= 0) {
        setStepsError(`El paso ${badDelay + 1} tiene una espera inválida: entre 0 y 3650 días.`);
        document.getElementById(`step-${steps[badDelay].uid}-days`)?.focus();
        return;
      }
      // Horas 0–23 (R5): el campo ya lo marca; aquí se lleva el foco al primero inválido.
      const badHours = steps.findIndex((s) => hoursError(s.delay_hours ?? 0) !== null);
      if (badHours >= 0) {
        setStepsError(`El paso ${badHours + 1} tiene horas fuera de rango: entre 0 y 23.`);
        document.getElementById(`step-${steps[badHours].uid}-hours`)?.focus();
        return;
      }
      // Un paso de condición sin reglas dejaría pasar en vez de cortar (tester
      // r3 N10). El servidor también lo rechaza; esto evita el viaje.
      const emptyIndex = steps.findIndex((s) => s.channel === 'condition' && isEmptyConditionTree(s.condition));
      if (emptyIndex >= 0) {
        setStepsError(`El paso ${emptyIndex + 1} es una condición sin reglas: añade al menos una o cambia el canal.`);
        stepsRef.current?.focus();
        return;
      }
    }
    setStepsError(null);

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
        ...(readOnlySteps ? {} : { steps: steps.map((s, i) => stripUid({ ...s, step_number: i + 1 })) }),
      } as Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] });
      toast({ title: sequence ? 'Secuencia actualizada' : 'Secuencia creada' });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{sequence ? 'Editar secuencia' : 'Nueva secuencia'}</DialogTitle>
          <DialogDescription>
            {sequence
              ? 'Cambia nombre, disparador y ajustes. Los pasos se muestran pero no se editan para no romper las inscripciones en curso.'
              : 'Ponle nombre y construye los pasos en la línea de tiempo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {serverError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>No se pudo guardar: {serverError}. Corrige y vuelve a intentarlo.</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor="seq-name">Nombre</Label>
              <Input
                id="seq-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'seq-name-error' : undefined}
                placeholder="Seguimiento de propuesta"
              />
              {nameError && <p id="seq-name-error" className="mt-1 text-xs text-red-700 dark:text-red-300">{nameError}</p>}
            </div>
            <div>
              <Label htmlFor="seq-trigger">Se dispara</Label>
              <select id="seq-trigger" className={SELECT_CLASS} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
                {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex h-9 items-center gap-2">
              <Switch id="seq-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="seq-active">Activa</Label>
            </div>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-300">
                <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                Más ajustes
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {' '}· {pauseOnReply ? 'se pausa si responde' : 'no se pausa'} · sale si {exits.map((c) => exitConditionLabel(c)).join(' o ')}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div>
                <Label htmlFor="seq-desc">Descripción</Label>
                <Textarea id="seq-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="seq-pause" checked={pauseOnReply} onCheckedChange={setPauseOnReply} />
                <Label htmlFor="seq-pause">Pausar si el cliente responde</Label>
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-gray-900 dark:text-gray-100">La secuencia termina si…</legend>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  {EXIT_CONDITION_VALUES.map((c) => {
                    const always = c === ALWAYS_ON_EXIT_CONDITION;
                    return (
                      <label key={c} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={always || exits.includes(c)}
                          disabled={always}
                          aria-describedby={always ? 'seq-exit-always' : undefined}
                          onChange={(e) => setExits(e.target.checked ? [...exits, c] : exits.filter((x) => x !== c))}
                        />
                        {exitConditionLabel(c)}{always ? ' (siempre)' : ''}
                      </label>
                    );
                  })}
                </div>
                <p id="seq-exit-always" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  Cerrar la oportunidad saca siempre de la secuencia; no se puede desactivar.
                </p>
                {droppedExits.length > 0 && (
                  <p role="status" className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Esta secuencia tenía guardada la condición {droppedExits.map((c) => `«${exitConditionLabel(c)}»`).join(' y ')}, que el motor no evalúa. Al guardar se quitará.
                    </span>
                  </p>
                )}
              </fieldset>
            </CollapsibleContent>
          </Collapsible>

          <div ref={stepsRef} tabIndex={-1} aria-describedby={stepsError ? 'seq-steps-error' : undefined} className="outline-none">
            <StepTimelineEditor steps={steps} onChange={setSteps} readOnly={readOnlySteps} />
            {stepsError && (
              <p id="seq-steps-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> {stepsError}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
            {saving ? 'Guardando…' : sequence ? 'Guardar cambios' : 'Crear secuencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
