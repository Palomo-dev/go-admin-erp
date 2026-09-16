'use client';

/** Formulario de un tier (crear o editar en su sitio dentro de `TierEditor`). */

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import type { PartnerTier } from '@/lib/services/crm/partnerService';
import { formatRate, tierFormToPayload, tierToForm, validateTierForm, type FieldError, type TierForm as TierFormState } from '@/lib/services/crm/partnerModel';

interface Props {
  tier: PartnerTier | null;
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<unknown>;
  onCancel: () => void;
}

export function TierForm({ tier, onSave, onCancel }: Props) {
  const [f, setF] = useState<TierFormState>(() => tierToForm(tier));
  const [errors, setErrors] = useState<FieldError<keyof TierFormState>[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const prefix = `tier-${tier?.id ?? 'new'}`;

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (next: TierFormState) => {
    setF(next);
    if (errors.length) setErrors(validateTierForm(next));
  };
  const errorOf = (k: keyof TierFormState) => errors.find((e) => e.field === k)?.message;

  const submit = async () => {
    const errs = validateTierForm(f);
    setErrors(errs);
    if (errs.length) return setFocusId(`${prefix}-${errs[0].field}`);
    setSaving(true);
    setServerError(null);
    try {
      await onSave(tierFormToPayload(f), tier?.id);
      toast({ title: tier ? 'Tier actualizado' : 'Tier creado', description: `«${f.name.trim()}» · ${formatRate(Number(f.commission_rate))}` });
      onCancel();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId(`${prefix}-server-error`);
    } finally {
      setSaving(false);
    }
  };

  const num = (k: 'min_deals' | 'min_revenue' | 'commission_rate', label: string, step: string) => {
    const err = errorOf(k);
    return (
      <div>
        <Label htmlFor={`${prefix}-${k}`} className="text-xs text-gray-700 dark:text-gray-300">{label}</Label>
        <Input id={`${prefix}-${k}`} type="number" inputMode="decimal" min={0} step={step} value={f[k]} aria-invalid={!!err} aria-describedby={err ? `${prefix}-${k}-error` : undefined} onChange={(e) => update({ ...f, [k]: e.target.value })} />
        {err && <p id={`${prefix}-${k}-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{err}</p>}
      </div>
    );
  };

  return (
    <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div>
        <Label htmlFor={`${prefix}-name`} className="text-xs text-gray-700 dark:text-gray-300">Nombre</Label>
        <Input id={`${prefix}-name`} value={f.name} autoComplete="off" aria-invalid={!!errorOf('name')} aria-describedby={errorOf('name') ? `${prefix}-name-error` : undefined} onChange={(e) => update({ ...f, name: e.target.value })} />
        {errorOf('name') && <p id={`${prefix}-name-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{errorOf('name')}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {num('min_deals', 'Deals mínimos', '1')}
        {num('min_revenue', 'Revenue mínimo', 'any')}
        {num('commission_rate', 'Comisión %', 'any')}
      </div>
      <div>
        <Label htmlFor={`${prefix}-benefits`} className="text-xs text-gray-700 dark:text-gray-300">Beneficios (uno por línea)</Label>
        <Textarea id={`${prefix}-benefits`} rows={3} value={f.benefitsText} onChange={(e) => update({ ...f, benefitsText: e.target.value })} />
      </div>
      {serverError && (
        <Alert id={`${prefix}-server-error`} variant="destructive" tabIndex={-1}>
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving}>{saving ? 'Guardando…' : tier ? 'Guardar' : 'Crear tier'}</Button>
      </div>
    </form>
  );
}
