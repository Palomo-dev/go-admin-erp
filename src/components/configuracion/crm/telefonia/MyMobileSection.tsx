'use client';

/**
 * MyMobileSection — "Mi celular" + modo de llamada por defecto (FASE-03 §5.2,
 * compartido con F5). OTP: POST /api/integrations/twilio/verify/send y
 * /verify/check con purpose 'mobile_verification' (SEC); al aprobar, el
 * servidor escribe user_comm_preferences.mobile_phone_e164/mobile_verified_at.
 * Preferencias: GET/PATCH /api/crm/me/comm-preferences.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import type { PhoneNumber } from '@/lib/services/crm/callManagementService';

interface Prefs {
  mobile_phone_e164: string | null;
  mobile_verified_at: string | null;
  default_call_mode: 'browser' | 'mobile';
  default_caller_id_id: string | null;
}

export function MyMobileSection({ numbers }: { numbers: PhoneNumber[] }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch('/api/crm/me/comm-preferences');
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setPrefs(body.data);
      setPhone(body.data?.mobile_phone_e164 ?? '');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const patch = async (p: Partial<Prefs>) => {
    const res = await fetch('/api/crm/me/comm-preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'No se pudo guardar', description: body.error || `HTTP ${res.status}`, variant: 'destructive' });
      return;
    }
    setPrefs(body.data);
  };

  const sendOtp = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/twilio/verify/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, channel: 'sms', purpose: 'mobile_verification' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStep('sent');
      toast({ title: 'Código enviado por SMS' });
    } catch (err) {
      toast({ title: 'No se pudo enviar el código', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const checkOtp = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/twilio/verify/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, code, purpose: 'mobile_verification' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStep('idle');
      setCode('');
      toast({ title: 'Celular verificado' });
      await load();
    } catch (err) {
      toast({ title: 'Código incorrecto', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const verified = Boolean(prefs?.mobile_verified_at && prefs?.mobile_phone_e164 && prefs.mobile_phone_e164 === phone.trim());

  return (
    <section aria-labelledby="tel-mobile-title" className="space-y-4">
      <h3 id="tel-mobile-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Mi celular
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">Para "Llamar desde mi celular": Twilio te llama primero y luego marca al cliente con el caller id de la organización.</p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="tel-mobile">Número (E.164)</Label>
          <div className="flex items-center gap-2">
            <Input id="tel-mobile" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57 310 123 4567" className="w-48" />
            {verified && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 size={14} aria-hidden="true" /> Verificado
              </span>
            )}
          </div>
        </div>
        {step === 'idle' ? (
          <Button size="sm" variant="outline" onClick={() => void sendOtp()} disabled={busy || !phone.trim() || verified}>
            {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" /> : <Smartphone size={14} className="mr-1.5" aria-hidden="true" />}
            {verified ? 'Verificado' : 'Enviar código'}
          </Button>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="tel-otp">Código SMS</Label>
              <Input id="tel-otp" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="w-28" maxLength={8} />
            </div>
            <Button size="sm" onClick={() => void checkOtp()} disabled={busy || code.length < 4}>
              {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" /> : null}
              Verificar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep('idle')} disabled={busy}>
              Cancelar
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tel-mode">Modo de llamada por defecto</Label>
          <select
            id="tel-mode"
            value={prefs?.default_call_mode ?? 'browser'}
            onChange={(e) => void patch({ default_call_mode: e.target.value as Prefs['default_call_mode'] })}
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="browser">Navegador (softphone)</option>
            <option value="mobile" disabled={!prefs?.mobile_verified_at}>
              Mi celular{prefs?.mobile_verified_at ? '' : ' (verifica tu número)'}
            </option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tel-my-caller">Mi caller id (opcional)</Label>
          <select
            id="tel-my-caller"
            value={prefs?.default_caller_id_id ?? ''}
            onChange={(e) => void patch({ default_caller_id_id: e.target.value || null })}
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">El de la organización</option>
            {numbers.filter((n) => n.is_active).map((n) => (
              <option key={n.id} value={n.id}>
                {n.e164}
                {n.label ? ` · ${n.label}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
