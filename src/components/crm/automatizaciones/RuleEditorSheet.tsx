'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Editor de una regla como frase construible (brief 6.2):
 * «Cuando [disparador] · si [condiciones] · entonces [acciones]», con vista
 * previa en texto antes de guardar. Ninguna lógica de negocio: el estado se
 * transforma con `ruleEditorModel` y el servidor valida de verdad.
 */

import { useEffect, useRef, useState } from 'react';
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
import type { BulkAutomationPreview } from '@/lib/services/crm/automation/automationBulkPreview';
import { BulkDryRunPreview } from './BulkDryRunPreview';

interface Props {
  open: boolean;
  /** Regla a editar; `null` para crear. */
  rule: AutomationRuleView | null;
  /** Formulario inicial al crear (por ejemplo, el ejemplo del estado vacío). */
  initialForm?: RuleFormState | null;
  lookups: RuleLookups;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: RulePayload) => Promise<unknown>;
  onBulkDryRun?: (id: string) => Promise<BulkAutomationPreview>;
  /** A dónde va el foco al cerrar si el botón que abrió ya no existe (R-1: el estado vacío se desmonta al crear la primera regla). */
  returnFocusFallback?: () => HTMLElement | null;
}

export function RuleEditorSheet({ open, rule, initialForm, lookups, onOpenChange, onSave, onBulkDryRun, returnFocusFallback }: Props) {
  const tr = useAutomationText();
  const [form, setForm] = useState<RuleFormState>(() => ruleToForm(null));
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false), testVersion = useRef(0), testPending = useRef(false);
  const [bulk, setBulk] = useState<BulkAutomationPreview | null>(null), [bulkLoading, setBulkLoading] = useState(false), [bulkError, setBulkError] = useState<string | null>(null), [showBulk, setShowBulk] = useState(false);
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
    testVersion.current++; testPending.current = false; setBulk(null); setBulkError(null); setBulkLoading(false); setShowBulk(false);
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
    if (savingRef.current) return;
    const errs = validateForm(form);
    setErrors(errs);
    if (errs.length) {
      focusFirstError(errs[0]);
      return;
    }
    savingRef.current = true; setSaving(true);
    setServerError(null);
    try {
      await onSave(formToPayload(form, rule?.id));
      toast({ title: rule ? tr("Regla actualizada") : tr("Regla creada"), description: form.is_active ? tr("Ya está activa.") : tr("Está desactivada: actívala cuando quieras.") });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tr("Error desconocido"));
      setFocusIds(['rule-server-error']);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const nameError = errors.find((e) => e.field === 'name')?.message;
  const dirty = !rule || JSON.stringify(formToPayload(form, rule.id)) !== JSON.stringify(formToPayload(ruleToForm(rule), rule.id));
  const test = async () => {
    if (!rule || dirty || !onBulkDryRun || testPending.current) return;
    testPending.current = true; const version = ++testVersion.current; setShowBulk(true); setBulkLoading(true); setBulkError(null);
    try { const result = await onBulkDryRun(rule.id); if (testVersion.current === version) setBulk(result); }
    catch (e) { if (testVersion.current === version) setBulkError(e instanceof Error ? e.message : tr("Error desconocido")); }
    finally { if (testVersion.current === version) { testPending.current = false; setBulkLoading(false); } }
  };

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
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden bg-canvas p-0 sm:max-w-5xl"
      >
        <SheetHeader className="border-b border-line bg-surface px-4 py-4 pr-12 dark:border-line dark:bg-surface sm:px-6">
          <SheetTitle className="text-fg dark:text-fg">{rule ? tr("Editar regla") : tr("Nueva regla")}</SheetTitle>
          <SheetDescription className="text-fg-secondary dark:text-fg-secondary">
            {tr("Arma la frase: cuándo se dispara, con qué condiciones y qué hace. Abajo verás cómo queda antes de guardar.")}</SheetDescription>
          {onBulkDryRun && <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="outline" disabled={saving || dirty || bulkLoading} onClick={() => void test()}>{tr("Probar en seco")}</Button>{dirty && <p className="text-xs text-fg-muted">{tr("Guarda los cambios antes de simular esta regla.")}</p>}</div>}
        </SheetHeader>

        {/* `relative`: el botón de envío `sr-only` es absoluto; sin esto se posicionaba respecto a la hoja y alargaba su scroll. */}
        <form
          className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <fieldset disabled={saving} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="min-w-0 space-y-4">
          <div>
            <Label htmlFor="rule-name" className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Nombre de la regla")}</Label>
            <Input
              id="rule-name"
              value={form.name}
              placeholder={tr("Seguimiento de propuesta")}
              autoComplete="off"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'rule-name-error' : undefined}
              onChange={(e) => update({ ...form, name: e.target.value })}
            />
            {nameError && <p id="rule-name-error" role="alert" className="mt-1 text-xs text-danger-text dark:text-danger-text">{tr(nameError)}</p>}
          </div>

          <SentenceBlock id="blk-trigger" word={tr("Cuando")} tone="blue">
            <TriggerBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-conditions" word={tr("si")} tone="amber" hint={tr("opcional")}>
            <ConditionsBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-actions" word={tr("entonces")} tone="emerald">
            <ActionsBlock
              form={form}
              lookups={lookups}
              errors={errors}
              selected={selectedAction}
              onSelect={setSelectedAction}
              onChange={update}
            />
          </SentenceBlock>
          </div><aside className="min-w-0 space-y-4">
          <RulePreview form={form} lookups={lookups.humanizer} />
          <RuleSettings form={form} errors={errors} open={settingsOpen} onOpenChange={setSettingsOpen} onChange={update} />
          {showBulk && <BulkDryRunPreview result={bulk} loading={bulkLoading} error={bulkError} onRetry={() => void test()} />}
          </aside></fieldset>

          {serverError && (
            <Alert id="rule-server-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>{tr("No se pudo guardar")}</AlertTitle>
              <AlertDescription>{serverError}{tr(". Corrige lo indicado y vuelve a intentarlo.")}</AlertDescription>
            </Alert>
          )}
          {/* Enter en un campo de texto envía el formulario. */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{tr("Guardar")}</button>
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
            'flex-col gap-2 border-t border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6',
            'pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-line dark:bg-surface',
          )}
        >
          {/* Juicio (d): el estado inicial estaba plegado en Ajustes y toda regla nacía desactivada sin verse. Va junto a guardar. */}
          <div className="flex min-w-0 items-center gap-2">
            <Switch id="rule-active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => update({ ...form, is_active: v })} />
            {/* El estado se dice aquí y en el botón; la tercera vez (frase larga) sobraba. */}
            <Label htmlFor="rule-active" className="text-sm text-fg dark:text-fg">
              {form.is_active ? tr("Activa") : tr("Desactivada")}
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{tr("Cancelar")}</Button>
            <Button type="button" className="bg-brand text-white hover:bg-brand-deep" disabled={saving} onClick={() => void submit()}>
              {saving ? tr('Guardando…') : tr(primaryLabel(rule !== null, form.is_active))}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
