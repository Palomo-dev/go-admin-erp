'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Phone, PhoneCall, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { normalizePhone } from './quickActionsConfig';

/**
 * MobileCallDialog — "Llamar desde mi celular": bridge de 2 patas vía
 * POST /api/voice/bridge/initiate (Twilio llama al vendedor y luego al cliente).
 * El celular del vendedor se precarga de `user_comm_preferences.mobile_phone_e164`
 * (F0) o `profiles.phone`. El estado se sigue leyendo `mobile_call_bridges` (RLS).
 */
export interface MobileCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customerId?: string;
  targetPhone: string;
  customerName?: string;
  onStarted?: (result: { bridge_id: string }) => void;
}

const STATUS_LABEL: Record<string, string> = {
  initiating: 'Iniciando…',
  agent_ringing: 'Llamando a tu celular…',
  agent_answered: 'Contestaste. Marcando al cliente…',
  customer_dialing: 'Marcando al cliente…',
  in_progress: 'Llamada en curso',
  completed: 'Llamada finalizada',
  failed: 'Falló la llamada',
  agent_no_answer: 'No contestaste en tu celular',
  agent_rejected: 'Rechazaste la llamada',
};

export function MobileCallDialog({ open, onOpenChange, opportunityId, customerId, targetPhone, customerName, onStarted }: MobileCallDialogProps) {
  const [agentPhone, setAgentPhone] = useState('');
  const [target, setTarget] = useState(targetPhone);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: pref } = await supabase.from('user_comm_preferences').select('mobile_phone_e164').eq('user_id', uid).limit(1).maybeSingle();
        let phone = (pref as { mobile_phone_e164?: string | null } | null)?.mobile_phone_e164 ?? null;
        if (!phone) {
          const { data: prof } = await supabase.from('profiles').select('phone').eq('id', uid).maybeSingle();
          phone = (prof as { phone?: string | null } | null)?.phone ?? null;
        }
        if (!cancelled && phone) setAgentPhone(normalizePhone(phone) ?? phone);
      } catch {
        /* sin preferencias: el usuario escribe su número */
      } finally {
        if (!cancelled) setLoadingPrefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = (id: string) => {
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      const { data } = await supabase.from('mobile_call_bridges').select('status').eq('id', id).maybeSingle();
      const s = (data as { status?: string } | null)?.status ?? null;
      if (s) setStatus(s);
      if (ticks > 40 || (s && ['completed', 'failed', 'agent_no_answer', 'agent_rejected'].includes(s))) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3000);
  };

  const handleStart = async () => {
    const a = normalizePhone(agentPhone);
    const t = normalizePhone(target);
    if (!a || !t) {
      toast({ title: 'Faltan números', description: 'Indica tu celular y el número del cliente', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/voice/bridge/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_phone: a, target_phone: t, customer_id: customerId ?? null, opportunity_id: opportunityId ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      const id: string = json.data?.bridge_id ?? json.data?.id ?? json.data?.bridge?.id;
      setBridgeId(id ?? null);
      setStatus(json.data?.status ?? 'initiating');
      if (id) startPolling(id);
      toast({ title: 'Te estamos llamando', description: 'Contesta en tu celular para conectar con el cliente.' });
      onStarted?.({ bridge_id: id });
    } catch (err) {
      toast({ title: 'No se pudo iniciar la llamada', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const finished = status && ['completed', 'failed', 'agent_no_answer', 'agent_rejected'].includes(status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Phone className="h-5 w-5 text-blue-500" />
            Llamar desde mi celular
          </DialogTitle>
          <DialogDescription>
            Twilio llama primero a tu celular y luego conecta con {customerName || 'el cliente'}. La llamada se graba y queda en el timeline.
          </DialogDescription>
        </DialogHeader>

        {!bridgeId ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="mc-agent" className="text-xs">Mi celular (E.164)</Label>
              <Input id="mc-agent" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="+57 300 000 0000" disabled={loadingPrefs} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-target" className="text-xs">Cliente</Label>
              <Input id="mc-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="+57..." />
            </div>
          </div>
        ) : (
          <div className="py-4 flex flex-col items-center gap-3 text-center" aria-live="polite">
            {finished ? (
              status === 'completed' ? <CheckCircle2 className="h-10 w-10 text-green-500" /> : <XCircle className="h-10 w-10 text-red-500" />
            ) : (
              <PhoneCall className="h-10 w-10 text-blue-500 animate-pulse" />
            )}
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{STATUS_LABEL[status ?? 'initiating'] ?? status}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Bridge {bridgeId.slice(0, 8)}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{bridgeId ? 'Cerrar' : 'Cancelar'}</Button>
          {!bridgeId && (
            <Button type="button" onClick={handleStart} disabled={submitting || loadingPrefs || !agentPhone || !target}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
              Llamar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
