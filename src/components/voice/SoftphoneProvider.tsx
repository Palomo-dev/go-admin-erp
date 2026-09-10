'use client';

/**
 * SoftphoneProvider — contexto global del softphone (Twilio Voice JS SDK).
 * GO Admin ERP — FASE-03 §5.2 (montado UNA vez en src/app/app/layout.tsx).
 *
 * - El ciclo de vida del `Device` (token, permiso de micrófono, carga perezosa
 *   del SDK, reintentos y renovación) vive en `hooks/useTwilioDevice` desde la
 *   ronda 2; aquí queda solo el estado de la llamada y la API del contexto.
 * - `makeCall` SOLO hace `device.connect({ params: { To, opportunityId, customerId } })`
 *   (la fila `calls` la crea el webhook del TwiML App; sin POST previo, C10).
 * - `useSoftphone()` es SEGURO: sin provider devuelve `{ available: false }`.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Call } from '@twilio/voice-sdk';
import { toast } from '@/components/ui/use-toast';
import { useCallRealtime } from './hooks/useCallRealtime';
import { useAudioDevices } from './hooks/useAudioDevices';
import { useTwilioDevice, describeDeviceError } from './hooks/useTwilioDevice';
import type { ActiveCallInfo, CallStatus, EndedCallInfo, MakeCallOptions, SoftphoneContextValue, SoftphoneValue } from './softphoneTypes';

// ─── Tipos (definidos en ./softphoneTypes, reexportados aquí) ─────────────────

export type { DeviceState } from './hooks/useTwilioDevice';
export { describeDeviceError } from './hooks/useTwilioDevice';
export type {
  CallStatus,
  MakeCallOptions,
  ActiveCallInfo,
  EndedCallInfo,
  SoftphoneContextValue,
  SoftphoneValue,
} from './softphoneTypes';

const SoftphoneContext = createContext<SoftphoneValue>({ available: false });

// ─── Provider ────────────────────────────────────────────────────────────────

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const callRef = useRef<Call | null>(null);
  const activeRef = useRef<ActiveCallInfo | null>(null);
  const liveNoteRef = useRef('');

  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [incoming, setIncoming] = useState<{ from: string; callSid: string | null } | null>(null);
  const [liveNote, setLiveNoteState] = useState('');
  const [lastEndedCall, setLastEndedCall] = useState<EndedCallInfo | null>(null);

  const { callId: activeCallId, row: activeCallRow } = useCallRealtime(activeCall?.callSid ?? null, callStatus !== 'idle' && callStatus !== 'ended');
  const activeCallIdRef = useRef<string | null>(null);
  activeCallIdRef.current = activeCallId;

  const setLiveNote = useCallback((text: string) => {
    liveNoteRef.current = text;
    setLiveNoteState(text);
  }, []);

  const setActive = useCallback((info: ActiveCallInfo | null) => {
    activeRef.current = info;
    setActiveCall(info);
  }, []);

  const finishCall = useCallback(
    (reason: 'disconnect' | 'cancel' | 'reject' | 'error') => {
      const info = activeRef.current;
      const call = callRef.current;
      callRef.current = null;
      setMuted(false);
      setIncoming(null);
      if (call) call.removeAllListeners();
      if (info && (reason === 'disconnect' || reason === 'error') && info.connectedAt) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - info.connectedAt) / 1000));
        setLastEndedCall({ ...info, callId: activeCallIdRef.current, durationSeconds, liveNote: liveNoteRef.current, endedAt: Date.now() });
      } else if (info && reason === 'disconnect' && info.direction === 'outbound') {
        // Saliente que no llegó a conectar (no contestó / canceló): también se dispone.
        setLastEndedCall({ ...info, callId: activeCallIdRef.current, durationSeconds: 0, liveNote: liveNoteRef.current, endedAt: Date.now() });
      }
      setCallStatus('ended');
      window.setTimeout(() => {
        setCallStatus((s) => (s === 'ended' ? 'idle' : s));
        setActive(null);
        setLiveNote('');
      }, 1200);
    },
    [setActive, setLiveNote]
  );

  const bindCallEvents = useCallback(
    (call: Call) => {
      call.on('accept', () => {
        const sid = call.parameters?.CallSid ?? null;
        const prev = activeRef.current;
        if (prev) setActive({ ...prev, callSid: sid ?? prev.callSid, connectedAt: Date.now() });
        setCallStatus('connected');
        setIncoming(null);
      });
      call.on('ringing', () => setCallStatus((s) => (s === 'connecting' ? 'ringing' : s)));
      call.on('mute', (isMuted: boolean) => setMuted(isMuted));
      call.on('disconnect', () => finishCall('disconnect'));
      call.on('cancel', () => finishCall('cancel'));
      call.on('reject', () => finishCall('reject'));
      call.on('error', (error: unknown) => {
        const d = describeDeviceError(error);
        toast({ title: 'Error en la llamada', description: d.reason, variant: 'destructive' });
        finishCall('error');
      });
    },
    [finishCall, setActive]
  );

  // ─── Entrantes + ciclo de vida del Device (hooks/useTwilioDevice) ─────────
  const handleIncoming = useCallback(
    (call: Call) => {
      if (callRef.current) {
        call.reject();
        return;
      }
      const from = call.parameters?.From ?? 'Número desconocido';
      callRef.current = call;
      setActive({
        direction: 'inbound',
        callSid: call.parameters?.CallSid ?? null,
        number: from,
        displayName: null,
        opportunityId: null,
        customerId: null,
        connectedAt: null,
      });
      setIncoming({ from, callSid: call.parameters?.CallSid ?? null });
      setCallStatus('ringing');
      bindCallEvents(call);
    },
    [bindCallEvents, setActive]
  );

  const onDeviceDestroy = useCallback(() => {
    callRef.current?.disconnect();
    callRef.current = null;
  }, []);

  const { deviceRef, deviceState, deviceReason, deviceErrorCode, deviceMissing, retry } = useTwilioDevice(handleIncoming, onDeviceDestroy);
  const audio = useAudioDevices(deviceRef, deviceState === 'registered');

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const makeCall = useCallback(
    async (to: string, opts?: MakeCallOptions) => {
      const device = deviceRef.current;
      if (!device || deviceState !== 'registered') {
        toast({ title: 'Telefonía no disponible', description: deviceReason ?? 'El softphone no está registrado', variant: 'destructive' });
        return;
      }
      if (callRef.current) {
        toast({ title: 'Ya hay una llamada en curso', description: 'Finaliza la llamada actual antes de iniciar otra', variant: 'destructive' });
        return;
      }
      const number = to.trim();
      if (!number) return;
      setLiveNote('');
      setLastEndedCall(null);
      setActive({
        direction: 'outbound',
        callSid: null,
        number,
        displayName: opts?.displayName ?? null,
        opportunityId: opts?.opportunityId ?? null,
        customerId: opts?.customerId ?? null,
        connectedAt: null,
      });
      setCallStatus('connecting');
      try {
        // Solo device.connect: la fila `calls` la crea /api/voice/twiml/outbound (C10).
        const call = await device.connect({
          params: { To: number, opportunityId: opts?.opportunityId ?? '', customerId: opts?.customerId ?? '' },
        });
        callRef.current = call;
        bindCallEvents(call);
        // `parameters.CallSid` está disponible tras el handshake inicial.
        const sid = call.parameters?.CallSid ?? null;
        if (sid) setActive({ ...(activeRef.current as ActiveCallInfo), callSid: sid });
      } catch (err) {
        const d = describeDeviceError(err);
        setCallStatus('idle');
        setActive(null);
        toast({ title: 'No se pudo iniciar la llamada', description: d.reason, variant: 'destructive' });
      }
    },
    [deviceState, deviceReason, bindCallEvents, setActive, setLiveNote]
  );

  const hangup = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    if (incoming) call.reject();
    else call.disconnect();
  }, [incoming]);

  const mute = useCallback((m: boolean) => {
    callRef.current?.mute(m);
    setMuted(m);
  }, []);

  const sendDigits = useCallback((digits: string) => {
    const clean = digits.replace(/[^0-9*#w]/g, '');
    if (clean && callRef.current && callRef.current.status() === 'open') callRef.current.sendDigits(clean);
  }, []);

  const acceptIncoming = useCallback(() => {
    if (callRef.current && incoming) callRef.current.accept();
  }, [incoming]);

  const rejectIncoming = useCallback(() => {
    if (callRef.current && incoming) {
      callRef.current.reject();
      finishCall('reject');
    }
  }, [incoming, finishCall]);

  const clearLastEndedCall = useCallback(() => setLastEndedCall(null), []);

  // ─── Atajos globales (fuera de inputs): Ctrl+Shift+D colgar, Ctrl+Shift+M mute, Ctrl+Shift+A aceptar ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const editable = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable;
      const key = e.key.toUpperCase();
      if (key === 'D' && callRef.current) {
        e.preventDefault();
        hangup();
      } else if (key === 'M' && callRef.current && !editable) {
        e.preventDefault();
        mute(!muted);
      } else if (key === 'A' && incoming) {
        e.preventDefault();
        acceptIncoming();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hangup, mute, muted, incoming, acceptIncoming]);

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      available: true,
      deviceState,
      deviceReason,
      deviceErrorCode,
      deviceMissing,
      callStatus,
      activeCall,
      activeCallId,
      activeCallRow,
      muted,
      hasIncoming: Boolean(incoming),
      incoming,
      liveNote,
      setLiveNote,
      lastEndedCall,
      clearLastEndedCall,
      audio,
      makeCall,
      hangup,
      mute,
      sendDigits,
      acceptIncoming,
      rejectIncoming,
      retry,
    }),
    [deviceState, deviceReason, deviceErrorCode, deviceMissing, callStatus, activeCall, activeCallId, activeCallRow, muted, incoming, liveNote, setLiveNote, lastEndedCall, clearLastEndedCall, audio, makeCall, hangup, mute, sendDigits, acceptIncoming, rejectIncoming, retry]
  );

  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

// ─── Hook seguro ─────────────────────────────────────────────────────────────

/** Sin `<SoftphoneProvider>` devuelve `{ available: false }` (nunca lanza). */
export function useSoftphone(): SoftphoneValue {
  return useContext(SoftphoneContext);
}

/** Variante que exige el provider (dock, botones). */
export function useSoftphoneStrict(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx.available) throw new Error('useSoftphoneStrict debe usarse dentro de <SoftphoneProvider>');
  return ctx;
}
