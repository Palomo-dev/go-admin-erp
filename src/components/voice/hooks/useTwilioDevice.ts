'use client';

/**
 * useTwilioDevice — ciclo de vida del `Device` del SDK de Twilio Voice.
 * GO Admin ERP — FASE-03 §5.2 (extraído de `SoftphoneProvider` en la ronda 2
 * para cumplir la regla de ≤300 líneas por componente).
 *
 * Responsabilidad única: token → permiso de micrófono → carga perezosa del SDK
 * → `Device` registrado, con reintentos acotados y renovación de token. No sabe
 * nada de la UI ni de la llamada en curso: expone el `Device` por ref y notifica
 * las entrantes con `onIncoming`.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Call, Device } from '@twilio/voice-sdk';

export type DeviceState = 'idle' | 'unregistered' | 'registering' | 'registered' | 'error' | 'no_permission' | 'not_configured';

export class VoiceTokenError extends Error {
  status: number;
  code: string | null;
  /** Nombres de las credenciales que faltan (409 VOICE_NOT_CONFIGURED). Sin valores. */
  missing: string[];
  constructor(status: number, code: string | null, message: string, missing: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.missing = missing;
  }
}

export async function fetchVoiceToken(): Promise<{ token: string; identity: string; ttl: number }> {
  const res = await fetch('/api/voice/token', { method: 'POST', headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new VoiceTokenError(
      res.status,
      body.code ?? null,
      body.error || `Error ${res.status} al obtener el token de voz`,
      Array.isArray(body.missing) ? (body.missing as string[]) : []
    );
  }
  return { token: body.token, identity: body.identity, ttl: body.ttl ?? 3600 };
}

/** Etiqueta legible de cada credencial que puede faltar (nombre, nunca valor). */
export const VOICE_CREDENTIAL_LABELS: Record<string, string> = {
  TWILIO_ACCOUNT_SID: 'Account SID de Twilio',
  TWILIO_AUTH_TOKEN: 'Auth Token de Twilio',
  TWILIO_API_KEY: 'API Key de Twilio',
  TWILIO_API_SECRET: 'API Secret de Twilio',
  TWILIO_TWIML_APP_SID: 'TwiML App SID',
  TWILIO_PHONE_NUMBER: 'Número de teléfono de Twilio',
};

/** Mapea códigos del SDK a estado + motivo (FASE-03 §5.5). */
export function describeDeviceError(err: unknown): { state: DeviceState; reason: string; code: number | null } {
  const code = typeof (err as { code?: unknown })?.code === 'number' ? ((err as { code: number }).code as number) : null;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  switch (code) {
    case 31201:
    case 31202:
    case 31204:
      return { state: 'error', reason: `Credenciales de Twilio inválidas (API Key/Secret o AccountSid) · código ${code}`, code };
    case 31205:
      return { state: 'registering', reason: 'Token expirado; renovando…', code };
    case 31208:
    case 31401:
    case 31402:
      return { state: 'no_permission', reason: 'Permite el micrófono en el navegador para usar el softphone', code };
    case 31000:
    case 31005:
    case 31009:
      return { state: 'error', reason: `Sin conexión con Twilio (código ${code}). Revisa tu red o firewall (WebSocket/WebRTC).`, code };
    default:
      return { state: 'error', reason: msg || 'Error del dispositivo de voz', code };
  }
}

function isMobileNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

const RETRY_BACKOFF_MS = 30_000;
const MAX_RETRIES = 5;

export interface TwilioDeviceApi {
  deviceRef: MutableRefObject<Device | null>;
  deviceState: DeviceState;
  deviceReason: string | null;
  deviceErrorCode: number | null;
  /**
   * Credenciales que faltan cuando `deviceState === 'not_configured'`
   * (nombres de variable, nunca valores). Vacío en el resto de estados.
   */
  deviceMissing: string[];
  /** Reintenta la inicialización (tras configurar telefonía o dar permiso al micrófono). */
  retry: () => void;
}

/**
 * @param onIncoming  se invoca con cada llamada entrante aceptable (el provider
 *                    decide si la rechaza por ocupado).
 * @param onDestroy   limpieza extra al desmontar (colgar la llamada activa).
 */
export function useTwilioDevice(onIncoming: (call: Call) => void, onDestroy?: () => void): TwilioDeviceApi {
  const deviceRef = useRef<Device | null>(null);
  const retriesRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [deviceState, setDeviceState] = useState<DeviceState>('idle');
  const [deviceReason, setDeviceReason] = useState<string | null>(null);
  const [deviceErrorCode, setDeviceErrorCode] = useState<number | null>(null);
  const [deviceMissing, setDeviceMissing] = useState<string[]>([]);

  // Refs para no reinicializar el Device cuando cambian los callbacks.
  const incomingRef = useRef(onIncoming);
  incomingRef.current = onIncoming;
  const destroyRef = useRef(onDestroy);
  destroyRef.current = onDestroy;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMobileNative()) {
      setDeviceState('not_configured');
      setDeviceMissing([]);
      setDeviceReason('En la app móvil usa "Mi celular" (el softphone del navegador no está soportado en WebView)');
      return;
    }
    let cancelled = false;
    let retryTimer: number | null = null;

    const scheduleRetry = () => {
      if (retriesRef.current >= MAX_RETRIES) return;
      retriesRef.current += 1;
      retryTimer = window.setTimeout(() => setAttempt((a) => a + 1), RETRY_BACKOFF_MS * retriesRef.current);
    };

    async function init() {
      setDeviceState('registering');
      setDeviceReason(null);
      setDeviceErrorCode(null);
      setDeviceMissing([]);
      let tokenRes: { token: string; identity: string; ttl: number };
      try {
        tokenRes = await fetchVoiceToken();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof VoiceTokenError && (err.status === 409 || err.code === 'VOICE_NOT_CONFIGURED')) {
          setDeviceState('not_configured');
          setDeviceMissing(err.missing);
          setDeviceReason(
            err.missing.length > 0
              ? `Faltan ${err.missing.map((k) => VOICE_CREDENTIAL_LABELS[k] ?? k).join(', ')} para llamar desde el navegador.`
              : err.message || 'Telefonía no configurada'
          );
          return; // sin reintentos: el admin debe configurar; `retry()` manual
        }
        if (err instanceof VoiceTokenError && (err.status === 401 || err.status === 403)) {
          setDeviceState('unregistered');
          setDeviceReason('Sesión no válida para telefonía');
          return;
        }
        setDeviceState('error');
        setDeviceReason(err instanceof Error ? err.message : 'No se pudo obtener el token de voz');
        scheduleRetry();
        return;
      }

      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
      } catch (err) {
        if (cancelled) return;
        setDeviceState('no_permission');
        setDeviceReason('Permite el micrófono en el navegador para usar el softphone');
        setDeviceErrorCode(31208);
        void err;
        return;
      }

      let mod: typeof import('@twilio/voice-sdk');
      try {
        mod = await import('@twilio/voice-sdk');
      } catch (err) {
        if (cancelled) return;
        setDeviceState('error');
        setDeviceReason(`No se pudo cargar el SDK de voz: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (cancelled) return;

      const device = new mod.Device(tokenRes.token, {
        codecPreferences: [mod.Call.Codec.Opus, mod.Call.Codec.PCMU],
        closeProtection: 'Hay una llamada en curso. ¿Seguro que quieres salir?',
        logLevel: 1,
        tokenRefreshMs: 10_000,
        allowIncomingWhileBusy: false,
        appName: 'goadmin-crm',
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      });
      deviceRef.current = device;

      device.on('registered', () => {
        retriesRef.current = 0;
        setDeviceState('registered');
        setDeviceReason(null);
        setDeviceErrorCode(null);
      });
      device.on('registering', () => setDeviceState('registering'));
      device.on('unregistered', () => setDeviceState((s) => (s === 'error' || s === 'no_permission' ? s : 'unregistered')));
      device.on('error', async (error: unknown) => {
        const d = describeDeviceError(error);
        console.error('[Softphone] Device error:', d.code, d.reason);
        if (d.code === 31205) {
          try {
            const t = await fetchVoiceToken();
            device.updateToken(t.token);
            return;
          } catch {
            /* cae al estado de error */
          }
        }
        setDeviceState(d.state === 'registering' ? 'error' : d.state);
        setDeviceReason(d.reason);
        setDeviceErrorCode(d.code);
        if (d.state === 'error' && d.code !== 31201 && d.code !== 31202 && d.code !== 31204) scheduleRetry();
      });
      device.on('tokenWillExpire', async () => {
        try {
          const t = await fetchVoiceToken();
          device.updateToken(t.token);
        } catch (err) {
          console.error('[Softphone] Error renovando token:', err);
        }
      });
      device.on('incoming', (call: Call) => incomingRef.current(call));

      try {
        await device.register();
      } catch (err) {
        if (cancelled) return;
        const d = describeDeviceError(err);
        setDeviceState(d.state === 'registering' ? 'error' : d.state);
        setDeviceReason(d.reason);
        setDeviceErrorCode(d.code);
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try {
        destroyRef.current?.();
      } catch {
        /* noop */
      }
      try {
        deviceRef.current?.destroy();
      } catch {
        /* noop */
      }
      deviceRef.current = null;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    retriesRef.current = 0;
    setAttempt((a) => a + 1);
  }, []);

  return { deviceRef, deviceState, deviceReason, deviceErrorCode, deviceMissing, retry };
}
