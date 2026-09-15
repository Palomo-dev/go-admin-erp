'use client';

/**
 * Registrar un referido: quién lo recomienda (buscador de clientes de la
 * organización, RLS), a quién (nombre, correo, teléfono) y en qué programa
 * activo. Validación junto al campo con `aria-describedby`, foco al primer
 * error y retorno de foco al disparador (o al fallback) al cerrar.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { ReferralProgram, ReferralView } from '@/lib/services/crm/referralsService';
import { emptyRegisterForm, registerFormToPayload, validateRegisterForm, type FormError, type RegisterReferralForm } from '@/lib/services/crm/referralModel';
import { EntitySearchList } from '@/components/crm/shared/EntitySearchList';
import { useCustomerSearch } from '@/components/crm/shared/useCustomerSearch';
import { ReferredPersonFields } from './ReferredPersonFields';

interface Props {
  open: boolean;
  /** Referidor prellenado (desde «pedir referido» de F10). */
  preset: { id: string; name: string } | null;
  programs: ReferralProgram[];
  currency: string | null;
  onOpenChange: (open: boolean) => void;
  onRegister: (payload: Record<string, unknown>) => Promise<ReferralView>;
  returnFocusFallback: () => HTMLElement | null;
}

export function RegisterReferralDialog({ open, preset, programs, currency, onOpenChange, onRegister, returnFocusFallback }: Props) {
  const [form, setForm] = useState<RegisterReferralForm>(emptyRegisterForm);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const { hits, loading, error: searchError } = useCustomerSearch(query, open && !preset);
  const active = programs.filter((p) => p.is_active);

  useEffect(() => {
    if (!open) return;
    const base = emptyRegisterForm();
    const first = active.length === 1 ? active[0].id : '';
    setForm({ ...base, referrer_customer_id: preset?.id ?? null, referrer_name: preset?.name ?? null, program_id: first });
    setQuery('');
    setErrors([]);
    setServerError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset?.id]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (next: RegisterReferralForm) => {
    setForm(next);
    if (errors.length) setErrors(validateRegisterForm(next));
  };
  const errorOf = (field: FormError['field']) => errors.find((e) => e.field === field)?.message;

  const submit = async () => {
    const errs = validateRegisterForm(form);
    setErrors(errs);
    if (errs.length) {
      setFocusId(errs[0].field === 'referrer_customer_id' ? 'referral-referrer' : `referral-${errs[0].field}`);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      const row = await onRegister(registerFormToPayload(form));
      toast({ title: 'Referido registrado', description: `«${row.referred_name}» recomendado por ${form.referrer_name ?? 'el cliente elegido'}.` });
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId('referral-server-error');
    } finally {
      setSaving(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[90vh] max-w-lg overflow-y-auto bg-white dark:bg-gray-950">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">Registrar referido</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">Quién recomienda, a quién, y en qué programa. Nace pendiente de contacto.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {preset ? (
            <div>
              <p className="text-xs text-gray-700 dark:text-gray-300">Cliente que recomienda</p>
              <p className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-100">{preset.name}</p>
            </div>
          ) : (
            <EntitySearchList
              id="referral-referrer"
              label="Cliente que recomienda"
              placeholder="Buscar por nombre o correo…"
              query={query}
              onQueryChange={setQuery}
              hits={hits.map((h) => ({ id: h.id, title: h.full_name ?? 'Cliente sin nombre', subtitle: h.email ?? h.phone ?? null }))}
              loading={loading}
              error={searchError}
              selectedId={form.referrer_customer_id}
              onSelect={(h) => update({ ...form, referrer_customer_id: h.id, referrer_name: h.title })}
              hint={form.referrer_name ? `Elegido: ${form.referrer_name}` : 'Escribe para buscar entre los clientes de la organización.'}
              fieldError={errorOf('referrer_customer_id')}
            />
          )}

          <ReferredPersonFields form={form} errors={errors} programs={active} currency={currency} onChange={update} />

          {serverError && (
            <Alert id="referral-server-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>No se pudo registrar</AlertTitle>
              <AlertDescription>{serverError}. Revisa los datos y vuelve a intentarlo.</AlertDescription>
            </Alert>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Registrar</button>
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Registrando…' : 'Registrar referido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
