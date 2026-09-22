'use client';

/**
 * Editor de una regla como frase construible (brief 6.2):
 * «Cuando [disparador] · si [condiciones] · entonces [acciones]», con vista
 * previa en texto antes de guardar. Ninguna lógica de negocio: el estado se
 * transforma con `ruleEditorModel` y el servidor valida de verdad.
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import {
  formToPayload,
  primaryLabel,
  ruleToForm,
  validateForm,
  type FormError,
  type RuleFormState,
  type RulePayload,
} from '@/lib/services/crm/automation/ruleEditorModel';
import { SentenceBlock, SentenceConnector } from './SentenceBlock';
import { TriggerBlock } from './TriggerBlock';
import { ConditionsBlock } from './ConditionsBlock';
import { ActionsBlock } from './ActionsBlock';
import { RulePreview } from './RulePreview';
import { RuleSettings } from './RuleSettings';
import type { RuleLookups } from './useRuleLookups';
import type { AutomationRuleView } from './useAutomationRules';

interface Props {
  open: boolean;
  /** Regla a editar; `null` para crear. */
  rule: AutomationRuleView | null;
  /** Formulario inicial al crear (por ejemplo, el ejemplo del estado vacío). */
  initialForm?: RuleFormState | null;
  lookups: RuleLookups;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: RulePayload) => Promise<unknown>;
  /** A dónde va el foco al cerrar si el botón que abrió ya no existe (R-1: el estado vacío se desmonta al crear la primera regla). */
  returnFocusFallback?: () => HTMLElement | null;
}

export function RuleEditorSheet({ open, rule, initialForm, lookups, onOpenChange, onSave, returnFocusFallback }: Props) {
  const [form, setForm] = useState<RuleFormState>(() => ruleToForm(null));
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<number | null>(null);
  // Ids a enfocar tras el próximo commit (el primero que exista). Efecto, no
  // requestAnimationFrame: con la ventana ocluida rAF no dispara (R-4).
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback); // H1/R-1: vuelve a «Nueva regla» o al lápiz de la tarjeta.

  useEffect(() => {
    if (!focusIds) return;
    for (const id of focusIds) {
      const el = document.getElementById(id);
      if (el) { el.focus(); break; }
    }
    setFocusIds(null);
  }, [focusIds]);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm ?? ruleToForm(rule));
    setErrors([]);
    setServerError(null);
    setSettingsOpen(false);
    setSelectedAction(null);
  }, [open, rule, initialForm]);

  const update = (next: RuleFormState) => {
    setForm(next);
    if (errors.length) setErrors(validateForm(next));
  };

  const focusFirstError = (err: FormError) => {
    if (err.field === 'name') return setFocusIds(['rule-name']);
    if (err.field === 'priority' || err.field === 'cooldown_hours') {
      setSettingsOpen(true);
      return setFocusIds([err.field === 'priority' ? 'rule-priority' : 'rule-cooldown']);
    }
    const m = /^actions\.(\d+)\.(.+)$/.exec(err.field);
    if (m) {
      const index = Number(m[1]);
      setSelectedAction(index);
      setFocusIds([`action-${index}-${m[2]}`, `action-chip-${index}`]);
    }
  };

  const submit = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length) {
      focusFirstError(errs[0]);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      await onSave(formToPayload(form, rule?.id));
      toast({ title: rule ? 'Regla actualizada' : 'Regla creada', description: form.is_active ? 'Ya está activa.' : 'Está desactivada: actívala cuando quieras.' });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusIds(['rule-server-error']);
    } finally {
      setSaving(false);
    }
  };

  const nameError = errors.find((e) => e.field === 'name')?.message;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      {/*
        UX móvil (ronda 1): la hoja mide `h-dvh` y NO se desplaza como un todo
        (`overflow-hidden` sustituye al `overflow-y-auto` del Sheet base); solo
        el cuerpo (`flex-1 min-h-0 overflow-y-auto`) hace scroll. Sin `min-h-0`
        el formulario no encogía, la hoja entera se desplazaba y el pie quedaba
        descolgado bajo un hueco vacío.
      */}
      <SheetContent
        side="right"
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-gray-50 p-0 dark:bg-gray-950 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-gray-200 bg-white px-4 py-4 pr-12 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
          <SheetTitle className="text-gray-900 dark:text-gray-100">{rule ? 'Editar regla' : 'Nueva regla'}</SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            Arma la frase: cuándo se dispara, con qué condiciones y qué hace. Abajo verás cómo queda antes de guardar.
          </SheetDescription>
        </SheetHeader>

        {/* `relative`: el botón de envío `sr-only` es absoluto; sin esto se posicionaba respecto a la hoja y alargaba su scroll. */}
        <form
          className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <div>
            <Label htmlFor="rule-name" className="text-xs text-gray-700 dark:text-gray-300">Nombre de la regla</Label>
            <Input
              id="rule-name"
              value={form.name}
              placeholder="Seguimiento de propuesta"
              autoComplete="off"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'rule-name-error' : undefined}
              onChange={(e) => update({ ...form, name: e.target.value })}
            />
            {nameError && <p id="rule-name-error" role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{nameError}</p>}
          </div>

          <SentenceBlock id="blk-trigger" word="Cuando" tone="blue">
            <TriggerBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-conditions" word="si" tone="amber" hint="opcional">
            <ConditionsBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-actions" word="entonces" tone="emerald">
            <ActionsBlock
              form={form}
              lookups={lookups}
              errors={errors}
              selected={selectedAction}
              onSelect={setSelectedAction}
              onChange={update}
            />
          </SentenceBlock>

          <RulePreview form={form} lookups={lookups.humanizer} />
          <RuleSettings form={form} errors={errors} open={settingsOpen} onOpenChange={setSettingsOpen} onChange={update} />

          {serverError && (
            <Alert id="rule-server-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>No se pudo guardar</AlertTitle>
              <AlertDescription>{serverError}. Corrige lo indicado y vuelve a intentarlo.</AlertDescription>
            </Alert>
          )}
          {/* Enter en un campo de texto envía el formulario. */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Guardar</button>
        </form>

        {/*
          Pie (UX móvil ronda 1): el SheetFooter base apila en columna INVERSA
          bajo `sm` y el interruptor caía descolgado bajo los botones. A 375 px
          no caben interruptor + «Desactivada» + dos botones en una fila (395 px
          frente a 342), así que en móvil el interruptor va arriba alineado a la
          izquierda y los dos botones debajo a mitades iguales; desde `sm`, una
          fila con el interruptor a la izquierda y los botones a la derecha.
          `env(safe-area-inset-bottom)` para el iPhone.
        */}
        <SheetFooter
          className={cn(
            'flex-col gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6',
            'pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-gray-900',
          )}
        >
          {/* Juicio (d): el estado inicial estaba plegado en Ajustes y toda regla nacía desactivada sin verse. Va junto a guardar. */}
          <div className="flex min-w-0 items-center gap-2">
            <Switch id="rule-active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => update({ ...form, is_active: v })} />
            {/* El estado se dice aquí y en el botón; la tercera vez (frase larga) sobraba. */}
            <Label htmlFor="rule-active" className="text-sm text-gray-900 dark:text-gray-100">
              {form.is_active ? 'Activa' : 'Desactivada'}
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void submit()}>
              {saving ? 'Guardando…' : primaryLabel(rule !== null, form.is_active)}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
