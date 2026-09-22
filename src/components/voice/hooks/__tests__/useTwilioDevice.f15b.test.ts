/**
 * F5/F15-B — `useTwilioDevice` con dobles de `platformCapabilities`.
 *
 * Sin DOM ni renderer en el repo: se ejecuta el hook con un despachador
 * mínimo de React (mismo patrón que f0RegTesterR4) en el que `useEffect`
 * corre el efecto de inmediato y los `setState` quedan registrados.
 *
 * Qué se prueba:
 *  - Capacitor (webrtc=false): `not_configured` y se manda a «Mi celular»
 *    sin pedir token ni cargar el SDK.
 *  - Electron con micrófono denegado por el SO: `no_permission` con la ruta
 *    de Ajustes de Windows/macOS, no «permite el micrófono en el navegador».
 *  - Electron con `register()` fallando por 31402 (getUserMedia denegado a
 *    mitad de camino): el motivo también trae la ruta de Ajustes.
 */
import * as React from 'react';

type Caps = { platform: string; webrtc: boolean; microphone: boolean };
const doubles = {
  caps: { platform: 'electron', webrtc: true, microphone: true } as Caps,
  mic: 'granted' as 'granted' | 'denied' | 'prompt' | 'unknown',
};

jest.mock('@/lib/services/voice/platformCapabilities', () => ({
  getCapabilities: () => ({ ...doubles.caps, pushNotifications: false, backgroundAudio: true, clipboard: true, nativeDialer: false }),
  queryMicrophonePermission: async () => doubles.mic,
  requestMicrophone: async () => ({ granted: true }),
}));

const sdk = { registerError: null as unknown, constructed: 0 };
jest.mock('@twilio/voice-sdk', () => ({
  Call: { Codec: { Opus: 'opus', PCMU: 'pcmu' } },
  Device: class {
    handlers: Record<string, (...a: unknown[]) => void> = {};
    constructor() {
      sdk.constructed += 1;
    }
    on(evt: string, fn: (...a: unknown[]) => void) {
      this.handlers[evt] = fn;
    }
    async register() {
      if (sdk.registerError) throw sdk.registerError;
      this.handlers.registered?.();
    }
    updateToken() {}
    destroy() {}
  },
}));

import { useTwilioDevice } from '../useTwilioDevice';

const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ token: 't', identity: 'u', ttl: 3600 }) }));

function runHook() {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } })
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prev = internals.H;
  const states: unknown[][] = [];
  let i = 0;
  let cleanup: (() => void) | void;
  internals.H = {
    useState: (init: unknown) => {
      const idx = i++;
      states[idx] = [];
      return [typeof init === 'function' ? (init as () => unknown)() : init, (v: unknown) => states[idx].push(typeof v === 'function' ? (v as (p: unknown) => unknown)(states[idx].at(-1)) : v)];
    },
    useRef: (init: unknown) => ({ current: init }),
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => (() => void) | void) => {
      cleanup = fn();
    },
  };
  try {
    // Fuera de un componente a propósito: el despachador de arriba sustituye al de React.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTwilioDevice(() => {}, undefined, true);
  } finally {
    internals.H = prev;
  }
  // Orden de useState en el hook: attempt, deviceState, deviceReason, deviceErrorCode, deviceMissing, deviceScope.
  return {
    lastState: () => states[1].at(-1) as string | undefined,
    lastReason: () => states[2].at(-1) as string | null | undefined,
    cleanup: () => cleanup?.(),
  };
}

/** Deja correr todas las microtareas del init (token → permiso → SDK → register). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('useTwilioDevice por plataforma (F15-B)', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { setTimeout, clearTimeout };
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/33.4.11' },
      configurable: true,
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    fetchMock.mockClear();
    sdk.registerError = null;
    sdk.constructed = 0;
    doubles.caps = { platform: 'electron', webrtc: true, microphone: true };
    doubles.mic = 'granted';
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('Capacitor: sin WebRTC → not_configured con «Mi celular»; no pide token ni carga el SDK', async () => {
    doubles.caps = { platform: 'capacitor-android', webrtc: false, microphone: true };
    const h = runHook();
    await flush();
    expect(h.lastState()).toBe('not_configured');
    expect(h.lastReason()).toMatch(/Mi celular/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.constructed).toBe(0);
    h.cleanup();
  });

  it('Electron/Windows con micrófono denegado por el SO → no_permission con la ruta de Ajustes de Windows', async () => {
    doubles.mic = 'denied';
    const h = runHook();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.lastState()).toBe('no_permission');
    expect(h.lastReason()).toMatch(/Windows: Configuración → Privacidad y seguridad → Micrófono/);
    expect(h.lastReason()).not.toMatch(/en el navegador/);
    expect(sdk.constructed).toBe(0);
    h.cleanup();
  });

  it('Electron/macOS: register() falla con 31402 (getUserMedia denegado) → motivo con Seguridad y privacidad', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Electron/33.4.11' },
      configurable: true,
    });
    sdk.registerError = Object.assign(new Error('User denied'), { code: 31402 });
    const h = runHook();
    await flush();
    expect(sdk.constructed).toBe(1);
    expect(h.lastState()).toBe('no_permission');
    expect(h.lastReason()).toMatch(/macOS: Ajustes del Sistema → Privacidad y seguridad → Micrófono/);
    h.cleanup();
  });

  it('web: micrófono denegado → pista del candado del navegador; permitido → registered', async () => {
    doubles.caps = { platform: 'web', webrtc: true, microphone: true };
    doubles.mic = 'denied';
    const denied = runHook();
    await flush();
    expect(denied.lastState()).toBe('no_permission');
    expect(denied.lastReason()).toMatch(/candado/);
    denied.cleanup();

    doubles.mic = 'granted';
    const ok = runHook();
    await flush();
    expect(ok.lastState()).toBe('registered');
    ok.cleanup();
  });
});
