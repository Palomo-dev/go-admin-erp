'use client';

/**
 * Formulario de un programa de referidos. Extraído de
 * `configuracion/.../ReferralsProgramCard.tsx` (F12) para que la tarjeta de
 * configuración y la página de referidos usen UN solo formulario. Sin
 * lógica de negocio: valida junto al campo y entrega el payload; guarda
 * quien lo monta (rutas `/api/crm/referrals/programs`).
 */

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ReferralProgram } from '@/lib/services/crm/referralsService';
import { REWARD_TO, REWARD_TO_LABELS, REWARD_TYPES, REWARD_TYPE_LABELS, describeReward } from '@/lib/services/crm/referralReward';

export interface ProgramFormPayload {
  name: string;
  description: string | null;
  reward_type: string;
  reward_amount: number;
  reward_to: string;
  is_active: boolean;
}

interface Props {
  program: ReferralProgram | null;
  currency: string | null;
  /** Prefijo de ids para poder montar dos formularios en la misma página. */
  idPrefix?: string;
  onSave: (payload: ProgramFormPayload, id?: string) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
}

interface State {
  name: string;
  description: string;
  reward_type: string;
  reward_amount: string;
  reward_to: string;
  is_active: boolean;
}

function fromProgram(p: ReferralProgram | null): State {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    reward_type: p?.reward_type ?? 'discount',
    reward_amount: p ? String(p.reward_amount) : '10',
    reward_to: p?.reward_to ?? 'both',
    is_active: p?.is_active ?? true,
  };
}

export function validateProgramForm(s: State): { name?: string; reward_amount?: string } {
  const errors: { name?: string; reward_amount?: string } = {};
  if (!s.name.trim()) errors.name = 'El nombre del programa es obligatorio';
  const n = Number(s.reward_amount);
  if (s.reward_amount.trim() === '' || !Number.isFinite(n) || n < 0) errors.reward_amount = 'El valor debe ser un número mayor o igual a 0';
  else if (s.reward_type === 'discount' && n > 100) errors.reward_amount = 'Un descuento no puede superar el 100 %';
  return errors;
}

export function ReferralProgramForm({ program, currency, idPrefix = 'program', onSave, onCancel, submitLabel }: Props) {
  const [s, setS] = useState<State>(() => fromProgram(program));
  const [errors, setErrors] = useState<ReturnType<typeof validateProgramForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const id = (k: string) => `${idPrefix}-${k}`;

  useEffect(() => {
    setS(fromProgram(program));
    setErrors({});
    setServerError(null);
  }, [program]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (next: State) => {
    setS(next);
    if (Object.keys(errors).length) setErrors(validateProgramForm(next));
  };

  const submit = async () => {
    const errs = validateProgramForm(s);
    setErrors(errs);
    if (errs.name) return setFocusId(id('name'));
    if (errs.reward_amount) return setFocusId(id('amount'));
    setSaving(true);
    setServerError(null);
    try {
      await onSave(
        { name: s.name.trim(), description: s.description.trim() || null, reward_type: s.reward_type, reward_amount: Number(s.reward_amount), reward_to: s.reward_to, is_active: s.is_active },
        program?.id,
      );
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId(id('server-error'));
    } finally {
      setSaving(false);
    }
  };

  const preview = describeReward({ reward_type: s.reward_type, reward_amount: Number(s.reward_amount) || 0, reward_to: s.reward_to }, currency);

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor={id('active')} className="text-sm text-gray-900 dark:text-gray-100">{s.is_active ? 'Programa activo' : 'Programa inactivo'}</Label>
          <p className="text-xs text-gray-600 dark:text-gray-400">Solo los activos se ofrecen al registrar un referido.</p>
        </div>
        <Switch id={id('active')} checked={s.is_active} disabled={saving} onCheckedChange={(v) => update({ ...s, is_active: v })} />
      </div>
      <div>
        <Label htmlFor={id('name')} className="text-xs text-gray-700 dark:text-gray-300">Nombre del programa</Label>
        <Input id={id('name')} value={s.name} placeholder="Trae un amigo" autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? id('name-error') : undefined} onChange={(e) => update({ ...s, name: e.target.value })} />
        {errors.name && <p id={id('name-error')} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.name}</p>}
      </div>
      <div>
        <Label htmlFor={id('description')} className="text-xs text-gray-700 dark:text-gray-300">Descripción (opcional)</Label>
        <Input id={id('description')} value={s.description} placeholder="10 % de descuento para quien recomienda y para el referido" autoComplete="off" onChange={(e) => update({ ...s, description: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor={id('type')} className="text-xs text-gray-700 dark:text-gray-300">Tipo de recompensa</Label>
          <Select value={s.reward_type} onValueChange={(v) => update({ ...s, reward_type: v })}>
            <SelectTrigger id={id('type')} className="text-left [&>span]:line-clamp-1"><SelectValue /></SelectTrigger>
            <SelectContent>{REWARD_TYPES.map((t) => <SelectItem key={t} value={t}>{REWARD_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={id('amount')} className="text-xs text-gray-700 dark:text-gray-300">{s.reward_type === 'discount' ? 'Porcentaje' : 'Valor'}</Label>
          <Input id={id('amount')} type="number" inputMode="decimal" min={0} step="any" value={s.reward_amount} aria-invalid={!!errors.reward_amount}
            aria-describedby={errors.reward_amount ? id('amount-error') : id('preview')} onChange={(e) => update({ ...s, reward_amount: e.target.value })} />
          {errors.reward_amount && <p id={id('amount-error')} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{errors.reward_amount}</p>}
        </div>
        <div>
          <Label htmlFor={id('to')} className="text-xs text-gray-700 dark:text-gray-300">Recompensa para</Label>
          <Select value={s.reward_to} onValueChange={(v) => update({ ...s, reward_to: v })}>
            <SelectTrigger id={id('to')} className="text-left [&>span]:line-clamp-1"><SelectValue /></SelectTrigger>
            <SelectContent>{REWARD_TO.map((t) => <SelectItem key={t} value={t}>{REWARD_TO_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <p id={id('preview')} className="text-xs text-gray-600 dark:text-gray-400" aria-live="polite">{preview ? `Así se verá: ${preview.summary}` : ''}</p>
      {serverError && (
        <Alert id={id('server-error')} variant="destructive" tabIndex={-1}>
          <AlertTitle>No se pudo guardar</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2 [&>button]:h-11 sm:[&>button]:h-9">
        {onCancel && <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving}>
          {saving ? 'Guardando…' : submitLabel ?? (program ? 'Guardar cambios' : 'Crear programa')}
        </Button>
      </div>
    </form>
  );
}
