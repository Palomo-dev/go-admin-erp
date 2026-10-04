'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { phoneControlDto, UNSUPPORTED_PHONE_CONTROL, type PhoneControlCommand, type PhoneControlResult, type PhoneControlState, type PhoneTransferMode, type PhoneTransferTarget } from '@/lib/services/crm/phoneConferenceTypes';
import type { LiveCallRow } from './useCallRealtime';

interface PhoneLiveCall extends LiveCallRow { recording_started: boolean; answered_at: string | null; number: string; displayName: string | null }

/** Estado observado en servidor. Los controles no dan por hecho un cambio de audio local. */
export function usePhoneConference(sid: string | null, active: boolean, registered: boolean, organizationId: number | null) {
  const [state, setState] = useState<PhoneControlState>(UNSUPPORTED_PHONE_CONTROL);
  const [call, setCall] = useState<PhoneLiveCall | null>(null);
  const pending = useRef(false);
  const scope = useRef(0);
  const clientKey = useRef<string | null>(null);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!sid || !active) return;
    const revision = scope.current;
    try {
      const response = await fetch(`/api/voice/call/${encodeURIComponent(sid)}/control`, { cache: 'no-store' });
      const body = await response.json();
      if (revision !== scope.current) return;
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) { setState(UNSUPPORTED_PHONE_CONTROL); setCall(null); }
        return;
      }
      const observed = phoneControlDto(body.data?.state);
      if (observed) setState(observed);
      const row = body.data?.call;
      if (row && typeof row.id === 'string' && typeof row.recording_enabled === 'boolean' && typeof row.consent_given === 'boolean') setCall(row);
    } catch { /* Un fallo de lectura conserva la última evidencia; no confirma una acción pendiente. */ }
  }, [sid, active]);

  useEffect(() => {
    scope.current += 1;
    intent.current = null;
    pending.current = false;
    setState(UNSUPPORTED_PHONE_CONTROL);
    setCall(null);
    if (!sid || !active) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 1500);
    return () => { scope.current += 1; window.clearInterval(timer); };
  }, [sid, active, organizationId, refresh]);

  useEffect(() => {
    if (!organizationId) return;
    clientKey.current ??= crypto.randomUUID();
    const heartbeat = () => { void fetch('/api/voice/team', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_key: clientKey.current, registered }) }).catch(() => undefined); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15000);
    return () => { window.clearInterval(timer); };
  }, [organizationId, registered]);

  const command = useCallback(async (payload: PhoneControlCommand): Promise<PhoneControlResult> => {
    if (!sid || !active || !state.supported) return { ok: false, code: 'unsupported', message: 'Los controles no están disponibles para esta llamada' };
    if (pending.current) return { ok: false, code: 'pending', message: 'Espera a que termine la acción anterior' };
    const fingerprint = JSON.stringify(payload);
    if (!intent.current || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() };
    pending.current = true;
    const revision = scope.current;
    setState((previous) => ({ ...previous, busy: true }));
    try {
      const response = await fetch(`/api/voice/call/${encodeURIComponent(sid)}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: intent.current.key, command: payload }) });
      const body = await response.json();
      const observed = phoneControlDto(body.data?.state);
      if (!response.ok || !observed) throw new Error(body.error ?? 'No pudimos confirmar la acción');
      if (revision !== scope.current) return { ok: false, code: 'scope_changed', message: 'La llamada cambió' };
      setState(observed);
      intent.current = null;
      return { ok: true, state: observed };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos confirmar la acción';
      if (revision === scope.current) { setState((previous) => ({ ...previous, error: message })); void refresh(); }
      return { ok: false, code: 'control_pending', message };
    } finally { if (revision === scope.current) pending.current = false; }
  }, [sid, active, state.supported, refresh]);

  const setHold = useCallback((held: boolean) => command({ action: 'hold', held }), [command]);
  const transferCall = useCallback((target: PhoneTransferTarget, mode: PhoneTransferMode) => command({ action: 'transfer', mode, target }), [command]);
  const confirmTransfer = useCallback(() => command({ action: 'confirm_transfer' }), [command]);
  const cancelTransfer = useCallback(() => command({ action: 'cancel_transfer' }), [command]);
  return { state, call, setHold, transferCall, confirmTransfer, cancelTransfer, command };
}
