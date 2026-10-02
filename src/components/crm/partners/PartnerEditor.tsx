'use client';

import {useRedText} from '@/components/crm/red/useRedText';

/**
 * Crear/editar un partner en hoja lateral: validación junto al campo con
 * `aria-describedby`, foco al primer error, 409 del servidor (correo repetido)
 * en un `Alert` con qué pasó, y retorno de foco al disparador o al fallback.
 * La tasa propia vacía = hereda la del tier (se guarda 0).
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/crm/red/RedButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { PartnerTier, PartnerView } from '@/lib/services/crm/partnerService';
import { formatRate, partnerFormToPayload, partnerToForm, validatePartnerForm, type FieldError, type PartnerForm } from '@/lib/services/crm/partnerModel';

const NO_TIER = '__none__';

interface Props {
  open: boolean;
  partner: PartnerView | null;
  tiers: PartnerTier[];
  onOpenChange: (open: boolean) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  returnFocusFallback: () => HTMLElement | null;
}

export function PartnerEditor({ open, partner, tiers, onOpenChange, onSave, returnFocusFallback }: Props) {
  const {tr, locale} = useRedText();
  const [form, setForm] = useState<PartnerForm>(() => partnerToForm(null));
  const [errors, setErrors] = useState<FieldError<keyof PartnerForm>[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);

  useEffect(() => {
    if (!open) return;
    setForm(partnerToForm(partner));
    setErrors([]);
    setServerError(null);
  }, [open, partner]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (next: PartnerForm) => {
    setForm(next);
    if (errors.length) setErrors(validatePartnerForm(next));
  };
  const errorOf = (f: keyof PartnerForm) => tr(errors.find((e) => e.field === f)?.message ?? '');
  const tier = tiers.find((t) => t.id === form.tier_id) ?? null;

  const submit = async () => {
    const errs = validatePartnerForm(form);
    setErrors(errs);
    if (errs.length) return setFocusId(`partner-${errs[0].field}`);
    setSaving(true);
    setServerError(null);
    try {
      await onSave(partnerFormToPayload(form), partner?.id);
      toast({ title: partner ? tr("Partner actualizado") : tr("Partner creado"), description: tr('«{p0}»{p1}', {p0:form.name.trim(), p1:form.is_active ? '' : tr(' (inactivo)')}) });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tr("Error desconocido"));
      setFocusId('partner-server-error');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof PartnerForm, label: string, extra: { type?: string; placeholder?: string; hint?: string } = {}) => {
    const err = errorOf(key);
    const id = `partner-${key}`;
    return (
      <div>
        <Label htmlFor={id} className="text-xs text-fg-secondary ">{label}</Label>
        {extra.type === 'tel' ? (
          <PhoneInput id={id} value={String(form[key])} autoComplete="off" aria-invalid={!!err} showValidation={false}
            aria-describedby={err ? `${id}-error` : extra.hint ? `${id}-hint` : undefined} onChange={(v) => update({ ...form, [key]: v })} />
        ) : (
        <Input id={id} type={extra.type ?? 'text'} value={String(form[key])} placeholder={extra.placeholder} autoComplete="off" aria-invalid={!!err}
          aria-describedby={err ? `${id}-error` : extra.hint ? `${id}-hint` : undefined} onChange={(e) => update({ ...form, [key]: e.target.value })} />
        )}
        {err ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{err}</p>
          : extra.hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-fg-secondary ">{extra.hint}</p> : null}
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-0 bg-subtle p-0  sm:max-w-xl">
        <SheetHeader className="text-left border-b border-line bg-surface px-6 pr-8 py-4  ">
          <SheetTitle className="text-fg ">{partner ? tr("Editar «{p0}»", {p0: partner.name}) : tr("Nuevo partner")}</SheetTitle>
          <SheetDescription className="text-fg-secondary ">{tr("Consultor, integrador o revendedor que trae o cierra deals. Su comisión queda registrada por deal; aquí no se paga nada.")}</SheetDescription>
        </SheetHeader>
        <form className="flex-1 space-y-4 overflow-y-auto px-6 py-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {field('name', tr("Nombre"), { placeholder: tr("Carlos Consultor") })}
          {field('company_name', tr("Empresa (opcional)"))}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('email', tr("Correo"), { type: 'email', hint: tr("Único por organización.") })}
            {field('phone', tr("Teléfono (opcional)"), { type: 'tel' })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="partner-tier_id" className="text-xs text-fg-secondary ">{tr("Tier")}</Label>
              <Select value={form.tier_id || NO_TIER} onValueChange={(v) => update({ ...form, tier_id: v === NO_TIER ? '' : v })}>
                <SelectTrigger id="partner-tier_id" className="text-left [&>span]:line-clamp-1" aria-describedby="partner-tier-hint"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TIER}>{tr("Sin tier")}</SelectItem>
                  {tiers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {formatRate(t.commission_rate, locale)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p id="partner-tier-hint" className="mt-1 text-xs text-fg-secondary ">{tr("Sube solo al registrar deals que cumplan los umbrales; bajar es manual, aquí.")}</p>
            </div>
            {field('commission_rate', tr("Comisión propia % (opcional)"), { type: 'number', placeholder: tier ? tr("Hereda {p0}", {p0: formatRate(tier.commission_rate, locale)}) : tr("Sin tier: 0 %"), hint: tr("Vacío = usa la tasa del tier. Si se indica, manda sobre la del tier.") })}
          </div>
          {serverError && (
            <Alert id="partner-server-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>{tr("No se pudo guardar")}</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">{tr("Guardar")}</button>
        </form>
        <SheetFooter className="gap-3 border-t border-line bg-surface px-6 py-3   sm:justify-between">
          <div className="flex items-center gap-2 self-center">
            <Switch id="partner-is_active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => update({ ...form, is_active: v })} />
            <Label htmlFor="partner-is_active" className="text-sm text-fg ">{form.is_active ? tr("Activo") : tr("Inactivo")}</Label>
          </div>
          <div className="flex gap-2 [&>button]:h-11 [&>button]:flex-1 sm:[&>button]:h-9 sm:[&>button]:flex-none">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{tr("Cancelar")}</Button>
            <Button type="button" className="" disabled={saving} onClick={() => void submit()}>
              {saving ? tr("Guardando…") : partner ? tr("Guardar cambios") : tr("Crear partner")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
