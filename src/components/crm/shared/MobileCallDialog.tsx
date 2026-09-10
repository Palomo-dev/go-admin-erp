'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Phone, PhoneCall, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { isRealtimePublished } from './realtimeTables';
import { normalizePhone } from './quickActionsConfig';

/**
 * MobileCallDialog — "Llamar desde mi celular" (FASE-05 §5).
 *
 * El celular del vendedor NO se escribe ni se envía: sale de
 * `user_comm_preferences.mobile_phone_e164` de ESTA organización y solo si está
 * verificado por OTP (`mobile_verified_at`). Si no lo está, el diálogo no deja
 * llamar y manda a Configuración › Telefonía › Mi celular.
 *
 * El progreso llega por Realtime (`mobile_call_bridges` ya está en la
 * publicación `supabase_realtime`), con respaldo por
 * `GET /api/voice/bridge/[id]` mientras el canal no está suscrito. Cancelar
 * llama a `POST /api/voice/bridge/[id]/cancel`.
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
  agent_answered: 'Contesta y presiona 1',
  customer_dialing: 'Conectando al cliente…',
  in_progress: 'En llamada',
  completed: 'Llamada finalizada',
  failed: 'Falló la llamada',
  agent_no_answer: 'No contestaste en tu celular',
  agent_rejected: 'Cancelaste la llamada',
};

const TERMINAL = ['completed', 'failed', 'agent_no_answer', 'agent_rejected'];

/** `+573101234567` → `+57 310 *** 4567`. */
function maskPhone(e164: string): string {
  return e164.length < 7 ? '***' : `${e164.slice(0, 6)} *** ${e164.slice(-4)}`;
}

export function MobileCallDialog({ open, onOpenChange, opportunityId, customerId, targetPhone, customerName, onStarted }: MobileCallDialogProps) {
  const [mobile, setMobile] = useState<string | null>(null);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  // Celular verificado de ESTA organización (sin caer a `profiles.phone`).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        const orgId = getOrganizationId();
        if (!uid || !orgId) return;
        const { data: pref } = await supabase
          .from('user_comm_preferences')
          .select('mobile_phone_e164, mobile_verified_at')
          .eq('user_id', uid)
          .eq('organization_id', orgId)
          .maybeSingle();
        const row = pref as { mobile_phone_e164?: string | null; mobile_verified_at?: string | null } | null;
        if (!cancelled && row?.mobile_phone_e164 && row.mobile_verified_at) {
          setMobile(normalizePhone(row.mobile_phone_e164) ?? row.mobile_phone_e164);
        }
      } catch {
        /* sin celular verificado: el diálogo lo dice y no deja llamar */
      } finally {
        if (!cancelled) setLoadingPrefs(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => stopPolling(), []);

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/voice/bridge/${id}`);
      const json = await res.json().catch(() => ({}));
      const s = json?.data?.bridge?.status as string | undefined;
      if (s) setStatus(s);
      if (s && TERMINAL.includes(s)) stopPolling();
    } catch {
      /* respaldo: el siguiente tick lo reintenta */
    }
  }, []);

  // Realtime + respaldo por HTTP mientras el canal no está suscrito.
  useEffect(() => {
    if (!bridgeId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let connected = false;

    if (isRealtimePublished('mobile_call_bridges')) {
      channel = supabase
        .channel(`bridge:${bridgeId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'mobile_call_bridges', filter: `id=eq.${bridgeId}` },
          (payload) => {
            const s = (payload.new as { status?: string } | null)?.status;
            if (s) setStatus(s);
            if (s && TERMINAL.includes(s)) stopPolling();
          }
        )
        .subscribe((state) => {
          connected = state === 'SUBSCRIBED';
        });
    }

    // Los primeros callbacks pueden llegar antes de la suscripción.
    void refresh(bridgeId);
    pollRef.current = setInterval(() => {
      if (!connected) void refresh(bridgeId);
    }, 4000);

    return () => {
      stopPolling();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [bridgeId, refresh]);

  const handleStart = async () => {
    const to = normalizePhone(targetPhone);
    if (!to) {
      toast({ title: 'Número inválido', description: 'El cliente no tiene un teléfono en formato válido.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/voice/bridge/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, customerId: customerId ?? null, opportunityId: opportunityId ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        const code = json?.code as string | undefined;
        if (code === 'MOBILE_NOT_VERIFIED') setMobile(null);
        throw new Error(json.error || `Error ${res.status}`);
      }
      const id: string = json.data?.bridgeId ?? json.data?.bridge_id;
      setBridgeId(id ?? null);
      setStatus(json.data?.status ?? 'agent_ringing');
      toast({ title: 'Te estamos llamando', description: 'Contesta en tu celular y presiona 1 para conectar.' });
      onStarted?.({ bridge_id: id });
    } catch (err) {
      toast({ title: 'No se pudo iniciar la llamada', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!bridgeId) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/voice/bridge/${bridgeId}/cancel`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      setStatus('failed');
      stopPolling();
      toast({ title: 'Llamada cancelada' });
    } catch (err) {
      toast({ title: 'No se pudo cancelar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setCanceling(false);
    }
  };

  const finished = Boolean(status && TERMINAL.includes(status));
  const cancellable = Boolean(bridgeId) && !finished && status !== 'in_progress';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Phone className="h-5 w-5 text-blue-500" />
            Llamar desde mi celular
          </DialogTitle>
          <DialogDescription>
            Te llamamos a tu celular verificado y, al presionar 1, conectamos con {customerName || 'el cliente'}. La llamada se graba y queda en el timeline.
          </DialogDescription>
        </DialogHeader>

        {!bridgeId ? (
          <div className="space-y-3 py-1 text-sm">
            {loadingPrefs ? (
              <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Comprobando tu celular…
              </p>
            ) : mobile ? (
              <>
                <p className="text-gray-700 dark:text-gray-200">
                  Tu celular: <span className="font-medium">{maskPhone(mobile)}</span>
                </p>
                <p className="text-gray-700 dark:text-gray-200">
                  Cliente: <span className="font-medium">{normalizePhone(targetPhone) ?? targetPhone}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Costo aproximado: 2 patas PSTN (≈ USD 0,08/min).</p>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Necesitas verificar tu celular por SMS antes de llamar desde él. Ve a Configuración › Telefonía › Mi celular.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 flex flex-col items-center gap-3 text-center" aria-live="polite">
            {finished ? (
              status === 'completed' ? <CheckCircle2 className="h-10 w-10 text-green-500" /> : <XCircle className="h-10 w-10 text-red-500" />
            ) : (
              <PhoneCall className="h-10 w-10 text-blue-500 animate-pulse" />
            )}
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{STATUS_LABEL[status ?? 'initiating'] ?? status}</p>
            {mobile && <p className="text-xs text-gray-500 dark:text-gray-400">{maskPhone(mobile)}</p>}
          </div>
        )}

        <DialogFooter>
          {cancellable && (
            <Button type="button" variant="destructive" onClick={handleCancel} disabled={canceling}>
              {canceling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancelar llamada
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{bridgeId ? 'Cerrar' : 'Cancelar'}</Button>
          {!bridgeId && (
            <Button type="button" onClick={handleStart} disabled={submitting || loadingPrefs || !mobile}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Phone className="h-4 w-4 mr-2" />}
              Llamar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
