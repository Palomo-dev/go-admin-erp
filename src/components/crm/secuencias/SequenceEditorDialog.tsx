'use client';
import { useLocale } from 'next-intl';
import type { ConditionLocale } from '@/lib/services/crm/automation/conditionsI18n';
import { useSequenceText } from './useSequenceText';

/**
 * Alta/edición de una secuencia (FASE-08 §5.3, rediseño UX brief 6.3).
 *
 * Lienzo de página (Figma 1407:17): nombre y línea de tiempo a la izquierda,
 * condiciones de salida y ajustes siempre visibles a la derecha. Los pasos usan
 * (`StepTimelineEditor`). Errores junto al campo con `aria-describedby` y
 * foco al primero. La validación de fondo sigue en `validateSequenceSteps`.
 *
 * Los pasos de una secuencia EXISTENTE siguen siendo de solo lectura (no se
 * rompen las inscripciones en curso): la línea se muestra sin controles.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, GitBranch, Save, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  timezone?: string | null;
  onBusyChange?: (busy: boolean) => void;
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Partial<SequenceView> & { id?: string; steps?: SequenceStepView[] }) => Promise<unknown>;
  /** Adónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback?: () => HTMLElement | null;
}

export function SequenceEditorDialog({ open, sequence, timezone, onBusyChange, onOpenChange, onSave, returnFocusFallback }: Props) {
 const tr=useSequenceText();
 const activeLocale=useLocale(), locale=(['es','en','fr','pt'].includes(activeLocale)?activeLocale:'es') as ConditionLocale;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [isActive, setIsActive] = useState(false);
  const [pauseOnReply, setPauseOnReply] = useState(true);
  const [exits, setExits] = useState<string[]>(['won_lost']);
  const [steps, setSteps] = useState<EditorStep[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busyChange = useRef(onBusyChange); busyChange.current = onBusyChange;
  useEffect(() => { busyChange.current?.(saving); }, [saving]);
  useEffect(() => () => busyChange.current?.(false), []);
 const pendingSave=useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const readOnlySteps = !!sequence;
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || pendingSave.current) return;
      event.preventDefault(); onOpenChange(false);
      setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, onCloseAutoFocus]);
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
    setNameError(null);
    setStepsError(null);
    setServerError(null);
  }, [open, sequence]);

  const submit = async () => {
    if(pendingSave.current)return;
    setServerError(null);
    if (name.trim().length < 2) {
      setNameError(tr("Escribe un nombre de al menos 2 caracteres."));
      nameRef.current?.focus();
      return;
    }
    setNameError(null);

    if (!readOnlySteps) {
      const badDelay = steps.findIndex((s) => !Number.isInteger(s.delay_days) || s.delay_days < 0 || s.delay_days > 3650);
      if (badDelay >= 0) {
        setStepsError(tr("El paso {p0} tiene una espera inválida: entre 0 y 3650 días.",{p0:badDelay + 1}));
        document.getElementById(`step-${steps[badDelay].uid}-days`)?.focus();
        return;
      }
      // Horas 0–23 (R5): el campo ya lo marca; aquí se lleva el foco al primero inválido.
      const badHours = steps.findIndex((s) => hoursError(s.delay_hours ?? 0, tr) !== null);
      if (badHours >= 0) {
        setStepsError(tr("El paso {p0} tiene horas fuera de rango: entre 0 y 23.",{p0:badHours + 1}));
        document.getElementById(`step-${steps[badHours].uid}-hours`)?.focus();
        return;
      }
      // Un paso de condición sin reglas dejaría pasar en vez de cortar (tester
      // r3 N10). El servidor también lo rechaza; esto evita el viaje.
      const emptyIndex = steps.findIndex((s) => s.channel === 'condition' && isEmptyConditionTree(s.condition));
      if (emptyIndex >= 0) {
        setStepsError(tr("El paso {p0} es una condición sin reglas: añade al menos una o cambia el canal.",{p0:emptyIndex + 1}));
        stepsRef.current?.focus();
        return;
      }
    }
    setStepsError(null);

    pendingSave.current=true; setSaving(true);
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
      toast({ title: sequence ? tr("Secuencia actualizada") : tr("Secuencia creada") });
      onOpenChange(false);
      setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tr("Error desconocido"));
    } finally {
      pendingSave.current=false; setSaving(false);
    }
  };

  const closeEditor = () => {
    if (pendingSave.current) return;
    onOpenChange(false);
    setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
  };
  if (!open) return null;
  const saveLabel = saving ? tr('Guardando…') : sequence ? tr('Guardar cambios') : tr('Crear secuencia');
  const saveButton = <button type="submit" form="sequence-editor-form" className={clasesBoton({ patron: 'button' })} disabled={saving}><Save className="size-4" strokeWidth={1.5} aria-hidden />{saveLabel}</button>;
  return (
    <div className="space-y-5 bg-canvas p-4 sm:p-6" data-figma-node="1407:17">
      <PageHeader titulo={sequence?.name ?? tr('Nueva secuencia')} subtitulo={sequence ? tr('Cambia nombre, disparador y ajustes. Los pasos se muestran pero no se editan para no romper las inscripciones en curso.') : tr('Ponle nombre y construye los pasos en la línea de tiempo.')}
        icono={GitBranch} variante="form" volverA="/app/crm/secuencias" onVolver={() => { if (!saving) closeEditor(); }}
        migas={[{ etiqueta: 'CRM' }, { etiqueta: tr('Secuencias') }, { etiqueta: sequence?.name ?? tr('Nueva secuencia') }]}
        movil={{ ocultarBarra: true, accion: <div className="flex gap-1"><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma', tamano: 'sm' })} disabled={saving} onClick={closeEditor}>{tr('Cancelar')}</button>{saveButton}</div> }} acciones={<><button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={saving} onClick={closeEditor}>{tr('Cancelar')}</button>{saveButton}</>} />
      {serverError && <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">{serverError}</p>}
      <form id="sequence-editor-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo={tr('Secuencia')} icono={GitBranch}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor="seq-name">{tr("Nombre")}</Label>
              <Input className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg"
                id="seq-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'seq-name-error' : undefined}
                placeholder={tr("Seguimiento de propuesta")}
              />
              {nameError && <p id="seq-name-error" className="mt-1 text-xs text-danger-text dark:text-danger-text">{nameError}</p>}
            </div>
            <div>
              <Label htmlFor="seq-trigger">{tr("Se dispara")}</Label>
              <select id="seq-trigger" className={SELECT_CLASS} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
                {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{tr(t.label)}</option>)}
              </select>
            </div>
            <div className="flex h-9 items-center gap-2">
              <Switch id="seq-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="seq-active">{tr("Activa")}</Label>
            </div>
          </div>

          </Tarjeta>
          <div ref={stepsRef} tabIndex={-1} aria-describedby={stepsError ? 'seq-steps-error' : undefined} className="outline-none">
            <StepTimelineEditor steps={steps} onChange={setSteps} readOnly={readOnlySteps} />
            {stepsError && <p id="seq-steps-error" role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-danger-text"><AlertCircle strokeWidth={1.5} className="size-4" aria-hidden />{stepsError}</p>}
          </div>
        </div>
        <aside className="min-w-0 space-y-4">
          <Tarjeta titulo={tr('Condiciones de salida')} icono={Settings2}>
              <fieldset>
                <legend className="text-sm font-medium text-fg dark:text-fg">{tr("La secuencia termina si…")}</legend>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  {EXIT_CONDITION_VALUES.map((c) => {
                    const always = c === ALWAYS_ON_EXIT_CONDITION;
                    return (
                      <label key={c} className="flex items-center gap-1.5 text-sm text-fg-secondary dark:text-fg-secondary">
                        <input
                          type="checkbox"
                          checked={always || exits.includes(c)}
                          disabled={always}
                          aria-describedby={always ? 'seq-exit-always' : undefined}
                          onChange={(e) => setExits(e.target.checked ? [...exits, c] : exits.filter((x) => x !== c))}
                        />
                        {exitConditionLabel(c,locale)}{always ? tr(" (siempre)") : ''}
                      </label>
                    );
                  })}
                </div>
                <p id="seq-exit-always" className="mt-1 text-xs text-fg-secondary dark:text-fg-secondary">
                  {tr("Cerrar la oportunidad saca siempre de la secuencia; no se puede desactivar.")}</p>
                {droppedExits.length > 0 && (
                  <p role="status" className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-warning-subtle p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                    <AlertCircle strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {tr("Esta secuencia tenía guardada la condición")}{droppedExits.map((c) => `«${exitConditionLabel(c,locale)}»`).join(tr(" y "))}{tr(", que el motor no evalúa. Al guardar se quitará.")}</span>
                  </p>
                )}
              </fieldset>
          </Tarjeta>
          <Tarjeta titulo={tr('Configuración de envío')} icono={Settings2}>
            <div className="space-y-4">
              <div className="flex items-center gap-2"><Switch id="seq-pause" checked={pauseOnReply} onCheckedChange={setPauseOnReply} /><Label htmlFor="seq-pause">{tr('Pausar si el cliente responde')}</Label></div>
              <p className="text-[13px] leading-[18px] text-fg-secondary">{tr('Hora de la organización')}: <span className="font-medium text-fg">{timezone ?? '—'}</span></p>
              <div><Label htmlFor="seq-desc" className="text-xs">{tr('Descripción')}</Label><Textarea id="seq-desc" rows={2} value={description} onChange={event => setDescription(event.target.value)} /></div>
            </div>
          </Tarjeta>
        </aside>
      </fieldset>
      </form>
    </div>
  );
}
