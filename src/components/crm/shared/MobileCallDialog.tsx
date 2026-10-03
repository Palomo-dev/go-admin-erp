'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Phone, PhoneCall, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { MobileDialerSurface } from '@/components/voice/mobile/MobileDialerSurface';
import { MobileBridgeView } from '@/components/voice/mobile/MobileBridgeView';
import { CallDispositionDialog } from '@/components/voice/CallDispositionDialog';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMobilePhoneViewport } from '@/components/voice/mobile/useMobilePhoneViewport';
import type { EndedCallInfo } from '@/components/voice/softphoneTypes';
import { isRealtimePublished } from './realtimeTables';
import { normalizePhone } from './quickActionsConfig';
import { useOrgDefaultCountry } from './useOrgDefaultCountry';

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
  allowNumberEdit?: boolean;
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

export function MobileCallDialog({ open, onOpenChange, opportunityId, customerId, targetPhone, customerName, onStarted, allowNumberEdit = false }: MobileCallDialogProps) {
  // F16 r5 · T-3: indicativo de la organización para los teléfonos nacionales
  // (antes siempre '57'; de aquí sale la LLAMADA real al cliente).
  const defaultCountry = useOrgDefaultCountry() ?? undefined;
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const mobileView = useMobilePhoneViewport();
  const [dialNumber, setDialNumber] = useState(targetPhone);
  const [note, setNote] = useState('');
  const [call, setCall] = useState<{ id: string; status: string; answered_at: string | null; ended_at: string | null; duration_seconds: number | null; recording_enabled: boolean; consent_given: boolean; recording_started?: boolean } | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false); const cancelPending = useRef(false);
  const generation = useRef(0); const currentOrg = useRef(organizationId); currentOrg.current = organizationId;
  const bridgeRef = useRef<string | null>(null);
  const refreshing = useRef<AbortController | null>(null);
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

  // La misma API de preferencias aplica la prueba OTP vigente, también tras cambiar de organización.
  useEffect(() => {
    const run = ++generation.current; const controller = new AbortController();
    stopPolling(); refreshing.current?.abort(); refreshing.current = null;
    pending.current = false; cancelPending.current = false; setSubmitting(false); setCanceling(false);
    bridgeRef.current = null; setBridgeId(null); setStatus(null); setCall(null); setCallId(null); setNote(''); setResultOpen(false); setError(null); setMobile(null); setLoadingPrefs(true);
    if (!organizationId) { setLoadingPrefs(false); return () => controller.abort(); }
    void fetch('/api/crm/me/comm-preferences', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json(); const row = body?.data;
      if (controller.signal.aborted || generation.current !== run) return;
      if (row?.mobile_phone_e164 && row.mobile_verified_at && row.requires_verification !== true) setMobile(normalizePhone(row.mobile_phone_e164) ?? row.mobile_phone_e164);
    }).catch(() => undefined).finally(() => { if (!controller.signal.aborted && generation.current === run) setLoadingPrefs(false); });
    return () => { controller.abort(); refreshing.current?.abort(); };
  }, [organizationId]);
  useEffect(() => { if (!bridgeId) setDialNumber(targetPhone); }, [targetPhone, bridgeId]);

  useEffect(() => () => stopPolling(), []);

  const refresh = useCallback(async (id: string) => {
    if (refreshing.current || bridgeRef.current !== id) return;
    const controller = new AbortController(); refreshing.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`/api/voice/bridge/${id}`, { signal: controller.signal });
      if (bridgeRef.current !== id || currentOrg.current !== organizationId || controller.signal.aborted) return;
      if ([401, 403, 404].includes(res.status)) {
        stopPolling(); bridgeRef.current = null; setBridgeId(null); setCall(null); setCallId(null); setStatus(null);
        setError('La llamada ya no está disponible en esta sesión.'); return;
      }
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (bridgeRef.current !== id || currentOrg.current !== organizationId || controller.signal.aborted) return;
      const s = json?.data?.bridge?.status as string | undefined;
      if (s) setStatus(s);
      if (json?.data?.call) { setCall(json.data.call); setCallId(json.data.call.id); }
      if (json?.data?.bridge?.call_id) setCallId(json.data.bridge.call_id);
      if (s && TERMINAL.includes(s)) stopPolling();
    } catch { /* Un único respaldo por tick, sin acumular peticiones. */ }
    finally { clearTimeout(timeout); if (refreshing.current === controller) refreshing.current = null; }
  }, [organizationId]);

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
            if (bridgeRef.current !== bridgeId || currentOrg.current !== organizationId) return;
            if (s) { setStatus(s); void refresh(bridgeId); }
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
  }, [bridgeId, refresh, organizationId]);

  const handleStart = async () => {
    if (pending.current || bridgeRef.current || !currentOrg.current) return;
    const scope = currentOrg.current; const run = generation.current;
    const targetPhone = allowNumberEdit ? dialNumber : normalizePhone(dialNumber, defaultCountry) ?? dialNumber;
    const to = normalizePhone(targetPhone, defaultCountry);
    if (!to) {
      toast({ title: 'Número inválido', description: 'El cliente no tiene un teléfono en formato válido.', variant: 'destructive' });
      return;
    }
    pending.current = true; setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/voice/bridge/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, customerId: customerId ?? null, opportunityId: opportunityId ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (currentOrg.current !== scope || generation.current !== run) return;
      if (!res.ok || !json.success) {
        const code = json?.code as string | undefined;
        if (code === 'MOBILE_NOT_VERIFIED') setMobile(null);
        throw new Error(json.error || `Error ${res.status}`);
      }
      if (currentOrg.current !== scope) return;
      const id: string = json.data?.bridgeId ?? json.data?.bridge_id;
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('El servidor no devolvió la llamada iniciada');
      bridgeRef.current = id; setDialNumber(to); setCallId(json.data?.callId ?? null);
      setBridgeId(id ?? null);
      setStatus(json.data?.status ?? 'agent_ringing');
      toast({ title: 'Te estamos llamando', description: 'Contesta en tu celular y presiona 1 para conectar.' });
      onStarted?.({ bridge_id: id });
    } catch (err) {
      if (currentOrg.current !== scope || generation.current !== run) return;
      setError(err instanceof Error ? err.message : 'Error');
      toast({ title: 'No se pudo iniciar la llamada', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      if (generation.current === run) { pending.current = false; setSubmitting(false); }
    }
  };

  const handleCancel = async () => {
    if (!bridgeId || cancelPending.current) return;
    cancelPending.current = true; setCanceling(true); setError(null);
    const id = bridgeId; const run = generation.current;
    try {
      const res = await fetch(`/api/voice/bridge/${bridgeId}/cancel`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (generation.current !== run || bridgeRef.current !== id) return;
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      if (bridgeRef.current !== id) return;
      setStatus(json?.data?.status ?? 'failed');
      void refresh(id);
      stopPolling();
      toast({ title: 'Llamada cancelada' });
    } catch (err) {
      if (generation.current !== run || bridgeRef.current !== id) return;
      setError(err instanceof Error ? err.message : 'Error');
      toast({ title: 'No se pudo cancelar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      if (generation.current === run) { cancelPending.current = false; setCanceling(false); }
    }
  };

  const finished = Boolean(status && TERMINAL.includes(status));


  const ended: EndedCallInfo = { callId: callId, callSid: null, number: dialNumber, displayName: customerName ?? null, customerId: customerId ?? null, opportunityId: opportunityId ?? null, direction: 'outbound', connectedAt: call?.answered_at ? Date.parse(call.answered_at) : null, durationSeconds: call?.duration_seconds ?? 0, liveNote: note, endedAt: call?.ended_at ? Date.parse(call.ended_at) : Date.now() };
  if (resultOpen) return <CallDispositionDialog open ended={ended} onClose={() => { setResultOpen(false); onOpenChange(false); }} />;
  const bridgeView = <MobileBridgeView showHeader={Boolean(status)} number={dialNumber} onNumberChange={allowNumberEdit ? setDialNumber : undefined} customerId={customerId ?? null} customerName={customerName ?? null} opportunityId={opportunityId ?? null} mobile={mobile} loadingPrefs={loadingPrefs} submitting={submitting} canceling={canceling} status={status} callId={callId} call={call} note={note} onNote={setNote} error={error} onStart={() => { void handleStart(); }} onCancel={() => { void handleCancel(); }} onClose={() => onOpenChange(false)} onResult={() => { if (call) setResultOpen(true); }} />;
  if (mobileView && !status && open) return <MobileDialerSurface onClose={() => onOpenChange(false)}>{bridgeView}</MobileDialerSurface>;
  if (mobileView) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent hideCloseButton className="inset-0 left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-canvas p-0 sm:rounded-none" aria-describedby={undefined}>
    <DialogTitle className="sr-only">Llamar desde mi celular</DialogTitle>{bridgeView}
  </DialogContent></Dialog>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Phone className="h-5 w-5 text-blue-500" />
            Llamar desde mi celular
          </DialogTitle>
          <DialogDescription>
            Te llamamos a tu celular verificado y, al presionar 1, conectamos con {customerName || 'el cliente'}. El resultado queda en el historial.
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
                  Cliente: <span className="font-medium">{normalizePhone(targetPhone, defaultCountry) ?? targetPhone}</span>
                </p>

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
          {Boolean(bridgeId) && !finished && (
            <Button type="button" variant="destructive" onClick={handleCancel} disabled={canceling}>
              {canceling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Cancelar llamada
            </Button>
          )}
          {finished && callId && <Button type="button" onClick={() => setResultOpen(true)}>Registrar resultado</Button>}
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
