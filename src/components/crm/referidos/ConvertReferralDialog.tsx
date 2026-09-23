'use client';

/**
 * Convertir un referido calificado en lead: crea la ficha de cliente y la
 * oportunidad (`source='referral'`, `deal_type='referral'`) con el mismo alta
 * que Leads, o enlaza una ficha existente. Se confirman los datos de contacto
 * porque sin correo ni teléfono el alta se rechaza (y se dice aquí antes).
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { ReferralView } from '@/lib/services/crm/referralsService';
import { EntitySearchList } from '@/components/crm/shared/EntitySearchList';
import { useCustomerSearch } from '@/components/crm/shared/useCustomerSearch';

interface Props {
  open: boolean;
  referral: ReferralView | null;
  onOpenChange: (open: boolean) => void;
  onConvert: (id: string, payload: Record<string, unknown>) => Promise<{ lead: { id: string; name: string } }>;
  returnFocusFallback: () => HTMLElement | null;
}

export function ConvertReferralDialog({ open, referral, onOpenChange, onConvert, returnFocusFallback }: Props) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [useExisting, setUseExisting] = useState(false);
  const [query, setQuery] = useState('');
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);
  const { hits, loading, error: searchError } = useCustomerSearch(query, open && useExisting);

  useEffect(() => {
    if (!open) return;
    setEmail(referral?.referred_email ?? '');
    setPhone(referral?.referred_phone ?? '');
    setUseExisting(false);
    setQuery('');
    setExisting(null);
    setError(null);
  }, [open, referral?.id, referral?.referred_email, referral?.referred_phone]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const contactMissing = !useExisting && !email.trim() && !phone.trim();

  const submit = async () => {
    if (!referral) return;
    if (useExisting && !existing) {
      setError('Elige la ficha de cliente existente o desactiva esa opción.');
      setFocusId('convert-existing');
      return;
    }
    if (contactMissing) {
      setError('Para crear el lead hace falta al menos correo o teléfono.');
      setFocusId('convert-email');
      return;
    }
    const phoneError = useExisting ? null : mensajeErrorTelefono(phone);
    if (phoneError) {
      setError(phoneError);
      setFocusId('convert-phone');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = useExisting
        ? { customer_id: existing!.id }
        : { referred_email: email.trim() || null, referred_phone: phone.trim() || null };
      const { lead } = await onConvert(referral.id, payload);
      toast({ title: 'Referido convertido en lead', description: `«${lead.name}» ya está en el pipeline.` });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setFocusId('convert-error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[90vh] max-w-lg overflow-y-auto bg-white dark:bg-gray-950">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-gray-900 dark:text-gray-100">Convertir «{referral?.referred_name}» en lead</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Se crea la ficha de cliente y un lead con origen «referido» en el pipeline por defecto. El referido queda como convertido.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex items-center gap-2">
            <Switch id="convert-existing-toggle" checked={useExisting} disabled={saving} onCheckedChange={setUseExisting} />
            <Label htmlFor="convert-existing-toggle" className="text-sm text-gray-900 dark:text-gray-100">Ya existe como cliente: enlazar su ficha</Label>
          </div>
          {useExisting ? (
            <EntitySearchList
              id="convert-existing"
              label="Ficha de cliente existente"
              placeholder="Buscar por nombre o correo…"
              query={query}
              onQueryChange={setQuery}
              hits={hits.map((h) => ({ id: h.id, title: h.full_name ?? 'Cliente sin nombre', subtitle: h.email ?? h.phone ?? null }))}
              loading={loading}
              error={searchError}
              selectedId={existing?.id ?? null}
              onSelect={(h) => setExisting({ id: h.id, title: h.title })}
              hint={existing ? `Elegido: ${existing.title}` : 'Se enlazará esa ficha sin crear otra.'}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="convert-email" className="text-xs text-gray-700 dark:text-gray-300">Correo</Label>
                <Input id="convert-email" type="email" value={email} autoComplete="off" aria-invalid={contactMissing && !!error} aria-describedby="convert-contact-hint" onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="convert-phone" className="text-xs text-gray-700 dark:text-gray-300">Teléfono</Label>
                <PhoneInput id="convert-phone" value={phone} autoComplete="off" aria-describedby="convert-contact-hint" onChange={setPhone} />
              </div>
              <p id="convert-contact-hint" className="text-xs text-gray-600 dark:text-gray-400 sm:col-span-2">Al menos uno de los dos: un lead sin forma de contacto no sirve para nada.</p>
            </div>
          )}
          {error && (
            <Alert id="convert-error" variant="destructive" tabIndex={-1}>
              <AlertTitle>No se pudo convertir</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">Convertir</button>
        </form>
        <DialogFooter className="gap-2 [&>button]:h-11 sm:[&>button]:h-9">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Convirtiendo…' : 'Crear lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
