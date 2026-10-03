'use client';

/** Controlador único del Device y las acciones de conferencia verificadas. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Call } from '@twilio/voice-sdk';
import { toast } from '@/components/ui/use-toast';
import { useCallRealtime } from './hooks/useCallRealtime';
import { useAudioDevices } from './hooks/useAudioDevices';
import { useTwilioDevice, describeDeviceError } from './hooks/useTwilioDevice';
import { microphoneDeniedReason } from './hooks/useCallModePolicy';
import { useDesktopPhoneController } from './hooks/useDesktopPhoneController';
import { usePhoneConference } from './hooks/usePhoneConference';
import { usePhoneShortcuts } from './hooks/usePhoneShortcuts';
import type { ActiveCallInfo, CallStatus, EndedCallInfo, MakeCallOptions, MakeCallResult, SoftphoneContextValue, SoftphoneValue } from './softphoneTypes';

// ─── Tipos (definidos en ./softphoneTypes, reexportados aquí) ─────────────────

export type { DeviceState } from './hooks/useTwilioDevice';
export { describeDeviceError } from './hooks/useTwilioDevice';
export type {
  CallStatus,
  MakeCallOptions,
  MakeCallResult,
  ActiveCallInfo,
  EndedCallInfo,
  SoftphoneContextValue,
  SoftphoneValue,
} from './softphoneTypes';

const SoftphoneContext = createContext<SoftphoneValue>({ available: false });

export function SoftphoneProvider({ children, enabled = true, organizationId = null }: { children: ReactNode; enabled?: boolean; organizationId?: number | null }) {
  const callRef = useRef<Call | null>(null);
  const connectingRef = useRef(false);
  const scopeRef = useRef(organizationId);
  scopeRef.current = organizationId;
  const [blockedCall, setBlockedCall] = useState<import('./softphoneTypes').BlockedCallInfo | null>(null);
  const clearBlockedCall = useCallback(() => setBlockedCall(null), []);
  useEffect(() => { setBlockedCall(null); }, [organizationId]);
  const activeRef = useRef<ActiveCallInfo | null>(null);
  const liveNoteRef = useRef('');

  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [incoming, setIncoming] = useState<{ from: string; callSid: string | null } | null>(null);
  const [liveNote, setLiveNoteState] = useState('');
  const [lastEndedCall, setLastEndedCall] = useState<EndedCallInfo | null>(null);

  const { callId: legacyCallId, row: legacyCallRow } = useCallRealtime(activeCall?.callSid ?? null, callStatus !== 'idle' && callStatus !== 'ended');
  const activeCallIdRef = useRef<string | null>(null);

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
      connectingRef.current = false;
      callRef.current = null;
      setMuted(false);
      setIncoming(null);
      if (call) call.removeAllListeners();
      if (info?.direction === 'inbound' && !info.connectedAt && (reason === 'cancel' || reason === 'disconnect')) {
        window.dispatchEvent(new CustomEvent('go-admin:phone-missed', { detail: { number: info.number, displayName: info.displayName } }));
      }
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

  const { deviceRef, deviceState, deviceReason, deviceErrorCode, deviceMissing, deviceScope, retry } = useTwilioDevice(handleIncoming, onDeviceDestroy, enabled);
  const audio = useAudioDevices(deviceRef, deviceState === 'registered');
  const [ringtoneMuted, setRingtoneMutedState] = useState(false);
  const setRingtoneMuted = useCallback((next: boolean) => {
    if (!deviceRef.current?.audio) return;
    deviceRef.current.audio.incoming(!next);
    setRingtoneMutedState(next);
  }, [deviceRef]);
  useEffect(() => { deviceRef.current?.audio?.incoming(!ringtoneMuted); }, [deviceRef, deviceState, ringtoneMuted]);
  const phone = usePhoneConference(activeCall?.callSid ?? null, callStatus !== 'idle' && callStatus !== 'ended', deviceState === 'registered', organizationId);
  const activeCallId = phone.call?.id ?? legacyCallId;
  const activeCallRow = phone.call ?? legacyCallRow;
  activeCallIdRef.current = activeCallId;
  const observedCall = useMemo(() => activeCall && phone.call ? { ...activeCall, number: phone.call.number,
    displayName: activeCall.displayName ?? phone.call.displayName, connectedAt: phone.call.answered_at ? Date.parse(phone.call.answered_at) : null } : activeCall, [activeCall, phone.call]);
  activeRef.current = observedCall;
  const observedStatus = phone.state.supported && phone.call && !phone.call.answered_at && callStatus === 'connected' ? 'ringing' : callStatus;

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const makeCall = useCallback(
    async (to: string, opts?: MakeCallOptions): Promise<MakeCallResult> => {
      const device = deviceRef.current;
      if (!device || deviceState !== 'registered') {
        const message = deviceReason ?? 'El softphone no está registrado';
        toast({ title: 'Telefonía no disponible', description: message, variant: 'destructive' });
        // F15-B: micrófono bloqueado por el SO (`mic_denied`) → el llamador ofrece el bridge.
        const denied = deviceState === 'no_permission';
        return { ok: false, reason: denied ? 'mic_denied' : 'unavailable', message, settingsHint: denied ? microphoneDeniedReason() : null };
      }
      if (callRef.current || connectingRef.current) {
        toast({ title: 'Ya hay una llamada en curso', description: 'Finaliza la llamada actual antes de iniciar otra', variant: 'destructive' });
        return { ok: false, reason: 'busy', message: 'Finaliza la llamada actual antes de iniciar otra', settingsHint: null };
      }
      const number = to.trim();
      if (!number) return { ok: false, reason: 'no_number', message: 'Sin número', settingsHint: null };
      connectingRef.current = true;
      const requestScope = scopeRef.current;
      setBlockedCall(null);
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
        const precheck = await fetch('/api/voice/precheck', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number, customer_id: opts?.customerId ?? null }) });
        const checked = await precheck.json();
        if (deviceRef.current !== device || scopeRef.current !== requestScope) throw new Error('La organización o la conexión cambió');
        if (precheck.ok && checked.data?.allowed === false && typeof checked.data.code === 'string') {
          setBlockedCall({ number: checked.data.number ?? number, code: checked.data.code, nextAt: typeof checked.data.nextAt === 'string' ? checked.data.nextAt : null,
            timezone: checked.data.timezone, ...opts });
        }
        if (!precheck.ok || checked.data?.allowed !== true) throw new Error(checked.error ?? checked.data?.code ?? 'Este número no puede recibir llamadas ahora');
        if (deviceRef.current !== device) throw new Error('La organización o la conexión cambió');
        // Solo device.connect: la fila `calls` la crea /api/voice/twiml/outbound (C10).
        const call = await device.connect({
          params: { To: number, opportunityId: opts?.opportunityId ?? '', customerId: opts?.customerId ?? '' },
        });
        if (deviceRef.current !== device) { call.disconnect(); throw new Error('La organización o la conexión cambió'); }
        callRef.current = call;
        bindCallEvents(call);
        connectingRef.current = false;
        // `parameters.CallSid` está disponible tras el handshake inicial.
        const sid = call.parameters?.CallSid ?? null;
        if (sid) setActive({ ...(activeRef.current as ActiveCallInfo), callSid: sid });
        return { ok: true };
      } catch (err) {
        connectingRef.current = false;
        const d = describeDeviceError(err);
        setCallStatus('idle');
        setActive(null);
        // getUserMedia falló (NotAllowedError → 31401/31402): decir DÓNDE activarlo, no tragarlo.
        const settingsHint = d.state === 'no_permission' ? microphoneDeniedReason() : null;
        toast({ title: 'No se pudo iniciar la llamada', description: settingsHint ?? d.reason, variant: 'destructive' });
        return { ok: false, reason: settingsHint ? 'mic_denied' : 'error', message: d.reason, settingsHint };
      }
    },
    [deviceRef, deviceState, deviceReason, bindCallEvents, setActive, setLiveNote]
  );

  const hangup = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    if (incoming) call.reject();
    else if (phone.state.supported) { void phone.command({ action: 'hangup' }).then((result) => {
      if (!result.ok) toast({ title: 'No se pudo confirmar el cierre', description: result.message, variant: 'destructive' });
    }); }
    else call.disconnect();
  }, [incoming, phone]);

  const mute = useCallback((m: boolean) => {
    if ((phone.state.held && phone.state.phase !== 'consulting') || phone.state.busy) return;
    callRef.current?.mute(m);
    setMuted(m);
  }, [phone.state.held, phone.state.phase, phone.state.busy]);

  const sendDigits = useCallback((digits: string) => {
    const clean = digits.replace(/[^0-9*#w]/g, '');
    if (clean && callRef.current && !phone.state.held && !phone.state.busy && callRef.current.status() === 'open') callRef.current.sendDigits(clean);
  }, [phone.state.held, phone.state.busy]);

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

  usePhoneShortcuts(callRef, { hangup, mute, muted, hasIncoming: Boolean(incoming), acceptIncoming });

  const value = useMemo<SoftphoneValue>(
    () => (enabled ? {
      available: true,
      blockedCall,
      clearBlockedCall,
      ringtoneMuted,
      setRingtoneMuted,
      deviceState,
      deviceReason,
      deviceErrorCode,
      deviceMissing,
      deviceScope,
      callStatus: observedStatus,
      activeCall: observedCall,
      activeCallId,
      activeCallRow,
      muted: muted || (phone.state.held && phone.state.phase !== 'consulting'),
      phoneControl: phone.state,
      setHold: phone.setHold,
      transferCall: phone.transferCall,
      confirmTransfer: phone.confirmTransfer,
      cancelTransfer: phone.cancelTransfer,
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
    } : { available: false }),
    [enabled, blockedCall, clearBlockedCall, ringtoneMuted, setRingtoneMuted, deviceState, deviceReason, deviceErrorCode, deviceMissing, deviceScope, observedStatus, observedCall, activeCallId, activeCallRow, muted, incoming, liveNote, setLiveNote, lastEndedCall, clearLastEndedCall, audio, makeCall, hangup, mute, sendDigits, acceptIncoming, rejectIncoming, retry, phone]
  );

  useDesktopPhoneController(value, organizationId);
  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

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
