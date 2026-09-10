'use client';

/**
 * useCallRealtime — resuelve `calls.id` (y estado/grabación) de la llamada
 * activa a partir de `provider_call_sid = call.parameters.CallSid` (FASE-03 §5.2).
 *
 * 1. Carga inicial: GET /api/crm/calls?provider_call_sid=… (reintenta cada 2 s
 *    hasta 10 veces: el webhook del TwiML App puede llegar después del connect).
 * 2. Realtime `postgres_changes` (UPDATE en calls filtrado por provider_call_sid);
 *    si el canal no conecta, polling cada 5 s mientras `active`.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/config';

export interface LiveCallRow {
  id: string;
  status: string;
  recording_enabled: boolean;
  consent_given: boolean;
}

export function useCallRealtime(callSid: string | null, active: boolean): { callId: string | null; row: LiveCallRow | null } {
  const [row, setRow] = useState<LiveCallRow | null>(null);
  const rowRef = useRef<LiveCallRow | null>(null);

  useEffect(() => {
    if (!callSid) {
      setRow(null);
      rowRef.current = null;
      return;
    }
    let cancelled = false;
    let tries = 0;
    let pollTimer: number | null = null;
    let realtimeOk = false;

    const load = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/crm/calls?provider_call_sid=${encodeURIComponent(callSid)}&limit=1`);
        if (!res.ok) return false;
        const body = await res.json();
        const r = body?.data?.[0];
        if (r && !cancelled) {
          const next = { id: r.id, status: r.status, recording_enabled: !!r.recording_enabled, consent_given: !!r.consent_given };
          rowRef.current = next;
          setRow(next);
          return true;
        }
      } catch {
        /* noop */
      }
      return false;
    };

    const schedule = () => {
      if (cancelled) return;
      tries += 1;
      const found = rowRef.current !== null;
      // Sin fila aún: reintento rápido (≤10); con fila y sin realtime: polling 5 s mientras la llamada siga activa.
      if (!found && tries <= 10) pollTimer = window.setTimeout(async () => { await load(); schedule(); }, 2000);
      else if (found && !realtimeOk && active) pollTimer = window.setTimeout(async () => { await load(); schedule(); }, 5000);
    };

    void load().then(() => schedule());

    const channel = supabase
      .channel(`call:${callSid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `provider_call_sid=eq.${callSid}` }, (payload) => {
        const r = payload.new as Partial<LiveCallRow> & { id: string };
        if (!r?.id || cancelled) return;
        const next = { id: r.id, status: String(r.status ?? rowRef.current?.status ?? ''), recording_enabled: !!r.recording_enabled, consent_given: !!r.consent_given };
        rowRef.current = next;
        setRow(next);
      })
      .subscribe((status) => {
        realtimeOk = status === 'SUBSCRIBED';
      });

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [callSid, active]);

  return { callId: row?.id ?? null, row };
}
