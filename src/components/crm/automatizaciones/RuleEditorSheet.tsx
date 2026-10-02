'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Editor de una regla como frase construible (brief 6.2):
 * «Cuando [disparador] · si [condiciones] · entonces [acciones]», con vista
 * previa en texto antes de guardar. Ninguna lógica de negocio: el estado se
 * transforma con `ruleEditorModel` y el servidor valida de verdad.
 */

import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Save, Zap } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  onBusyChange?: (busy: boolean) => void;
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

export function RuleEditorSheet({ open, rule, onBusyChange, initialForm, lookups, onOpenChange, onSave, onBulkDryRun, returnFocusFallback }: Props) {
  const tr = useAutomationText();
  const [form, setForm] = useState<RuleFormState>(() => ruleToForm(null));
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busyChange = useRef(onBusyChange); busyChange.current = onBusyChange;
  useEffect(() => { busyChange.current?.(saving); }, [saving]);
  useEffect(() => () => busyChange.current?.(false), []);
  const savingRef = useRef(false), testVersion = useRef(0), testPending = useRef(false);
  const [bulk, setBulk] = useState<BulkAutomationPreview | null>(null), [bulkLoading, setBulkLoading] = useState(false), [bulkError, setBulkError] = useState<string | null>(null), [showBulk, setShowBulk] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selectedAction, setSelectedAction] = useState<number | null>(null);
  // Ids a enfocar tras el próximo commit (el primero que exista). Efecto, no
  // requestAnimationFrame: con la ventana ocluida rAF no dispara (R-4).
  const [focusIds, setFocusIds] = useState<string[] | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback); // H1/R-1: vuelve a «Nueva regla» o al lápiz de la tarjeta.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || savingRef.current) return;
      event.preventDefault(); onOpenChange(false);
      setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, onCloseAutoFocus]);

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
    setSettingsOpen(true);
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
      setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
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

  if (!open) return null;
  const closeEditor = () => {
    if (savingRef.current) return;
    onOpenChange(false);
    // El listado se vuelve a montar al salir del lienzo; devuelve el foco después.
    setTimeout(() => onCloseAutoFocus(new Event('close')), 0);
  };
  return (
    <div className="space-y-5 bg-canvas p-4 sm:p-6" data-figma-node="1375:17">
      <PageHeader titulo={rule?.name ?? tr("Nueva regla")} subtitulo={tr("Arma la frase: cuándo se dispara, con qué condiciones y qué hace. Abajo verás cómo queda antes de guardar.")}
        icono={Zap} variante="form" volverA="/app/crm/automatizaciones" onVolver={() => { if (!saving) closeEditor(); }}
        migas={[{ etiqueta: 'CRM' }, { etiqueta: tr('Automatizaciones') }, { etiqueta: rule?.name ?? tr('Nueva regla') }]}
        movil={{ ocultarBarra: true, accion: <div className="flex gap-1"><button type="button" className={clasesBoton({ patron: 'button', variante: 'fantasma', tamano: 'sm' })} disabled={saving} onClick={closeEditor}>{tr('Cancelar')}</button><button type="submit" form="automation-rule-form" className={clasesBoton({ patron: 'button' })} disabled={saving}>{tr('Guardar')}</button></div> }}
        acciones={<>
          <button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={saving} onClick={closeEditor}>{tr('Cancelar')}</button>
          {onBulkDryRun && <button type="button" className={clasesBoton({ patron: 'button', variante: 'secundario' })} disabled={saving || dirty || bulkLoading} onClick={() => void test()}><FlaskConical className="size-4" strokeWidth={1.5} aria-hidden />{tr('Probar en seco')}</button>}
          <button type="submit" form="automation-rule-form" className={clasesBoton({ patron: 'button' })} disabled={saving}><Save className="size-4" strokeWidth={1.5} aria-hidden />{saving ? tr('Guardando…') : tr(primaryLabel(rule !== null, form.is_active))}</button>
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        <Switch id="rule-active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => update({ ...form, is_active: v })} />
        <Label htmlFor="rule-active" className="text-sm text-fg">{form.is_active ? tr('Activa') : tr('Desactivada')}</Label>
        {dirty && onBulkDryRun && <p className="text-xs text-fg-muted">{tr('Guarda los cambios antes de simular esta regla.')}</p>}
      </div>
        <form
          id="automation-rule-form" className="relative space-y-4"
          noValidate
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <fieldset disabled={saving} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><div className="min-w-0 space-y-4">
          <div>
            <Label htmlFor="rule-name" className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Nombre de la regla")}</Label>
            <Input className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg"
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

          <SentenceBlock id="blk-trigger" word={`1 · ${tr("Cuando")}`} tone="blue">
            <TriggerBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-conditions" word={`2 · ${tr("Si se cumple")}`} tone="amber" hint={tr("opcional")}>
            <ConditionsBlock form={form} lookups={lookups} onChange={update} />
          </SentenceBlock>
          <SentenceConnector />
          <SentenceBlock id="blk-actions" word={`3 · ${tr("Entonces")}`} tone="emerald">
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


    </div>
  );
}
