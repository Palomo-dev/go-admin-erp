'use client';

/**
 * SoftphoneProvider — Context provider para Twilio Voice SDK.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Inicializa un Device de Twilio con el token de /api/voice/token,
 * maneja llamadas entrantes (evento 'incoming') y salientes, y expone
 * el estado de la llamada a través del hook useSoftphone().
 *
 * Reconecta el token automáticamente cuando el evento 'tokenWillExpire'
 * se dispara (10s antes de expirar).
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { useToast } from '@/components/ui/use-toast';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'ended';

export type DeviceState = 'unregistered' | 'registering' | 'registered' | 'error';

interface MakeCallOptions {
  customerId?: string;
  opportunityId?: string;
  recordingEnabled?: boolean;
}

interface SoftphoneContextValue {
  /** Instancia del Device de Twilio (null si no se ha inicializado). */
  device: Device | null;
  /** Llamada activa (entrante o saliente). */
  currentCall: Call | null;
  /** Estado de la llamada actual. */
  callStatus: CallStatus;
  /** Estado del Device (registro). */
  deviceState: DeviceState;
  /** Número destino de la llamada saliente en curso. */
  activeNumber: string | null;
  /** Inicia una llamada saliente vía /api/voice/call. */
  makeCall: (to: string, opts?: MakeCallOptions) => Promise<void>;
  /** Cuelga la llamada activa. */
  hangup: () => void;
  /** Acepta una llamada entrante. */
  acceptIncoming: () => void;
  /** Rechaza una llamada entrante. */
  rejectIncoming: () => void;
  /** Si hay una llamada entrante pendiente. */
  hasIncoming: boolean;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

// ─── Helper: fetch token ─────────────────────────────────────────────────────

async function fetchVoiceToken(): Promise<{ token: string; identity: string }> {
  const res = await fetch('/api/voice/token', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al obtener token de voz`);
  }
  const data = await res.json();
  return { token: data.token, identity: data.identity };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const deviceRef = useRef<Device | null>(null);
  const currentCallRef = useRef<Call | null>(null);

  const [device, setDevice] = useState<Device | null>(null);
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [deviceState, setDeviceState] = useState<DeviceState>('unregistered');
  const [activeNumber, setActiveNumber] = useState<string | null>(null);
  const [hasIncoming, setHasIncoming] = useState(false);

  // ─── Limpieza de la llamada actual ─────────────────────────────────────────
  const cleanupCall = useCallback((call: Call) => {
    call.removeAllListeners();
    if (currentCallRef.current === call) {
      currentCallRef.current = null;
      setCurrentCall(null);
    }
    setHasIncoming(false);
  }, []);

  // ─── Vincular eventos de un Call ───────────────────────────────────────────
  const bindCallEvents = useCallback(
    (call: Call) => {
      call.on('accept', (acceptedCall: Call) => {
        currentCallRef.current = acceptedCall;
        setCurrentCall(acceptedCall);
        setCallStatus('connected');
        setHasIncoming(false);
      });

      call.on('disconnect', (disconnectedCall: Call) => {
        setCallStatus('ended');
        cleanupCall(disconnectedCall);
        // Reset a idle tras un breve delay para mostrar "Finalizada"
        setTimeout(() => {
          setCallStatus('idle');
          setActiveNumber(null);
        }, 1500);
      });

      call.on('cancel', () => {
        setCallStatus('ended');
        cleanupCall(call);
        setTimeout(() => {
          setCallStatus('idle');
          setActiveNumber(null);
        }, 1500);
      });

      call.on('error', (error: unknown) => {
        console.error('[Softphone] Call error:', error);
        setCallStatus('ended');
        cleanupCall(call);
        toast({
          title: 'Error de llamada',
          description: error instanceof Error ? error.message : 'Error desconocido',
          variant: 'destructive',
        });
        setTimeout(() => {
          setCallStatus('idle');
          setActiveNumber(null);
        }, 1500);
      });
    },
    [cleanupCall, toast]
  );

  // ─── Inicializar Device ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initDevice() {
      try {
        const { token } = await fetchVoiceToken();
        if (cancelled) return;

        const newDevice = new Device(token, {
          logLevel: 1, // WARN
          // edge: 'ashburn' — usar default
        });

        // Eventos del Device
        newDevice.on('registered', () => {
          setDeviceState('registered');
        });

        newDevice.on('registering', () => {
          setDeviceState('registering');
        });

        newDevice.on('unregistered', () => {
          setDeviceState('unregistered');
        });

        newDevice.on('error', (error: unknown) => {
          console.error('[Softphone] Device error:', error);
          setDeviceState('error');
          toast({
            title: 'Error de telefonía',
            description: error instanceof Error ? error.message : 'Error en el dispositivo',
            variant: 'destructive',
          });
        });

        newDevice.on('incoming', (call: Call) => {
          // Solo permitir una llamada a la vez
          if (currentCallRef.current) {
            call.reject();
            return;
          }

          currentCallRef.current = call;
          setCurrentCall(call);
          setCallStatus('connecting');
          setHasIncoming(true);
          bindCallEvents(call);
        });

        // Reconectar token antes de expirar
        newDevice.on('tokenWillExpire', async () => {
          try {
            const { token: newToken } = await fetchVoiceToken();
            newDevice.updateToken(newToken);
          } catch (err) {
            console.error('[Softphone] Error renovando token:', err);
          }
        });

        deviceRef.current = newDevice;
        setDevice(newDevice);

        // Registrar para recibir llamadas entrantes
        await newDevice.register();
      } catch (err) {
        console.error('[Softphone] Error inicializando Device:', err);
        setDeviceState('error');
        // No mostrar toast en carga inicial para no spammear si no hay provider
      }
    }

    initDevice();

    return () => {
      cancelled = true;
      if (currentCallRef.current) {
        try {
          currentCallRef.current.disconnect();
        } catch {
          // noop
        }
      }
      if (deviceRef.current) {
        try {
          deviceRef.current.destroy();
        } catch {
          // noop
        }
        deviceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── makeCall ──────────────────────────────────────────────────────────────
  const makeCall = useCallback(
    async (to: string, opts?: MakeCallOptions) => {
      if (!deviceRef.current) {
        toast({
          title: 'Telefonía no disponible',
          description: 'El dispositivo de voz no está inicializado',
          variant: 'destructive',
        });
        return;
      }

      if (currentCallRef.current) {
        toast({
          title: 'Ya hay una llamada en curso',
          description: 'Finaliza la llamada actual antes de iniciar otra',
          variant: 'destructive',
        });
        return;
      }

      // Iniciar la llamada server-side para registrar en BD
      try {
        await fetch('/api/voice/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            customer_id: opts?.customerId,
            opportunity_id: opts?.opportunityId,
            recording_enabled: opts?.recordingEnabled,
            mode: 'click-to-call',
          }),
        });
      } catch (err) {
        console.error('[Softphone] Error iniciando llamada server-side:', err);
      }

      // Conectar vía SDK (cliente)
      try {
        setActiveNumber(to);
        setCallStatus('connecting');

        const call = await deviceRef.current.connect({
          params: { To: to },
        });

        currentCallRef.current = call;
        setCurrentCall(call);
        bindCallEvents(call);
      } catch (err) {
        console.error('[Softphone] Error conectando llamada:', err);
        setCallStatus('idle');
        setActiveNumber(null);
        toast({
          title: 'No se pudo iniciar la llamada',
          description: err instanceof Error ? err.message : 'Error desconocido',
          variant: 'destructive',
        });
      }
    },
    [bindCallEvents, toast]
  );

  // ─── hangup ────────────────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    if (currentCallRef.current) {
      currentCallRef.current.disconnect();
    }
  }, []);

  // ─── acceptIncoming ────────────────────────────────────────────────────────
  const acceptIncoming = useCallback(() => {
    if (currentCallRef.current && hasIncoming) {
      currentCallRef.current.accept();
    }
  }, [hasIncoming]);

  // ─── rejectIncoming ────────────────────────────────────────────────────────
  const rejectIncoming = useCallback(() => {
    if (currentCallRef.current && hasIncoming) {
      currentCallRef.current.reject();
      cleanupCall(currentCallRef.current);
      setCallStatus('idle');
    }
  }, [hasIncoming, cleanupCall]);

  const value: SoftphoneContextValue = {
    device,
    currentCall,
    callStatus,
    deviceState,
    activeNumber,
    makeCall,
    hangup,
    acceptIncoming,
    rejectIncoming,
    hasIncoming,
  };

  return <SoftphoneContext.Provider value={value}>{children}</SoftphoneContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSoftphone(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error('useSoftphone debe usarse dentro de <SoftphoneProvider>');
  }
  return ctx;
}
