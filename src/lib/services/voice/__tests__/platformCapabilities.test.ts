/// <reference types="jest" />
/**
 * F15 — `platformCapabilities`: detección honesta de plataforma y capacidades
 * con dobles de `window` / `navigator` (jest corre en `node`: sin jsdom).
 *
 * Decisiones que fija:
 * - Capacitor nativo (`window.Capacitor.getPlatform()` = ios/android) manda
 *   sobre todo lo demás; Electron (`goAdminDesktop`, como `desktop.ts`) sobre
 *   PWA (`display-mode: standalone` o `navigator.standalone` en iOS).
 * - `webrtc` es false en Capacitor aunque exista `RTCPeerConnection`: el
 *   softphone del navegador no está soportado en el WebView (F3/F5, ruta A).
 * - `requestMicrophone` pide con `getUserMedia` (en Capacitor el WebView
 *   dispara el permiso nativo: no hay plugin de micrófono en `mobile/`),
 *   libera las pistas y traduce el error a un motivo estable.
 * - Sin `window` (SSR) todo es false y `detectPlatform()` es 'web'.
 */
import {
  detectPlatform,
  getCapabilities,
  queryMicrophonePermission,
  requestMicrophone,
  supportsBrowserSoftphone,
} from '../platformCapabilities';

type AnyRecord = Record<string, unknown>;

function setGlobals(win: AnyRecord | undefined, nav: AnyRecord | undefined) {
  for (const [key, value] of [['window', win], ['navigator', nav]] as const) {
    if (value === undefined) {
      delete (globalThis as AnyRecord)[key];
    } else {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  }
}

const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128';
const iphoneUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605';
const mediaOk = { getUserMedia: jest.fn() };
const matchMedia = (standalone: boolean) => jest.fn(() => ({ matches: standalone }));

afterEach(() => setGlobals(undefined, undefined));

describe('detectPlatform', () => {
  it('SSR: sin window es web y sin capacidades', () => {
    expect(detectPlatform()).toBe('web');
    const { platform, ...caps } = getCapabilities();
    expect(platform).toBe('web');
    expect(Object.values(caps).every((v) => v === false)).toBe(true);
  });

  it('web de escritorio', () => {
    setGlobals({ matchMedia: matchMedia(false), RTCPeerConnection: class {} }, { userAgent: desktopUa, mediaDevices: mediaOk });
    expect(detectPlatform()).toBe('web');
  });

  it('PWA instalada por display-mode: standalone', () => {
    setGlobals({ matchMedia: matchMedia(true) }, { userAgent: desktopUa });
    expect(detectPlatform()).toBe('pwa');
  });

  it('PWA en iOS por navigator.standalone (Safari no soporta display-mode)', () => {
    setGlobals({ matchMedia: matchMedia(false) }, { userAgent: iphoneUa, standalone: true });
    expect(detectPlatform()).toBe('pwa');
  });

  it('Electron por el bridge goAdminDesktop (mismo criterio que desktop.ts), aun en standalone', () => {
    setGlobals({ goAdminDesktop: {}, matchMedia: matchMedia(true) }, { userAgent: desktopUa });
    expect(detectPlatform()).toBe('electron');
  });

  it('Electron por user agent cuando el preload no expone bridge', () => {
    setGlobals({ matchMedia: matchMedia(false) }, { userAgent: `${desktopUa} Electron/31.0` });
    expect(detectPlatform()).toBe('electron');
  });

  it('Capacitor android/ios por Capacitor.getPlatform(), por encima de Electron y PWA', () => {
    setGlobals({ Capacitor: { getPlatform: () => 'android' }, goAdminDesktop: {}, matchMedia: matchMedia(true) }, { userAgent: desktopUa });
    expect(detectPlatform()).toBe('capacitor-android');
    setGlobals({ Capacitor: { getPlatform: () => 'ios' } }, { userAgent: iphoneUa });
    expect(detectPlatform()).toBe('capacitor-ios');
  });

  it("Capacitor cargado en web (getPlatform() = 'web') NO es nativo", () => {
    setGlobals({ Capacitor: { getPlatform: () => 'web' }, matchMedia: matchMedia(false) }, { userAgent: desktopUa });
    expect(detectPlatform()).toBe('web');
  });
});

describe('getCapabilities', () => {
  it('web: micrófono, webrtc y portapapeles según las APIs presentes; sin marcador nativo', () => {
    setGlobals(
      { matchMedia: matchMedia(false), RTCPeerConnection: class {}, PushManager: class {}, Notification: class {} },
      { userAgent: desktopUa, mediaDevices: mediaOk, clipboard: { writeText: jest.fn() }, serviceWorker: {} },
    );
    expect(getCapabilities()).toEqual({
      platform: 'web',
      microphone: true,
      webrtc: true,
      pushNotifications: true,
      backgroundAudio: true,
      clipboard: true,
      nativeDialer: false,
    });
  });

  it('web sin getUserMedia ni RTCPeerConnection: micrófono y webrtc false', () => {
    setGlobals({ matchMedia: matchMedia(false) }, { userAgent: desktopUa });
    const caps = getCapabilities();
    expect(caps.microphone).toBe(false);
    expect(caps.webrtc).toBe(false);
    expect(caps.pushNotifications).toBe(false);
    expect(caps.clipboard).toBe(false);
  });

  it('Capacitor: webrtc false aunque el WebView tenga RTCPeerConnection; marcador nativo; sin audio en background', () => {
    setGlobals(
      { Capacitor: { getPlatform: () => 'android', Plugins: { PushNotifications: {} } }, RTCPeerConnection: class {} },
      { userAgent: desktopUa, mediaDevices: mediaOk },
    );
    const caps = getCapabilities();
    expect(caps.platform).toBe('capacitor-android');
    expect(caps.webrtc).toBe(false);
    expect(caps.microphone).toBe(true);
    expect(caps.nativeDialer).toBe(true);
    expect(caps.backgroundAudio).toBe(false);
    expect(caps.pushNotifications).toBe(true);
    expect(supportsBrowserSoftphone()).toBe(false);
  });

  it('PWA en iPhone: marcador nativo por tel:, audio en background no garantizado', () => {
    setGlobals({ matchMedia: matchMedia(true), RTCPeerConnection: class {} }, { userAgent: iphoneUa, mediaDevices: mediaOk });
    const caps = getCapabilities();
    expect(caps.platform).toBe('pwa');
    expect(caps.nativeDialer).toBe(true);
    expect(caps.backgroundAudio).toBe(false);
    expect(supportsBrowserSoftphone()).toBe(true);
  });

  it('Electron: audio en background y webrtc; sin marcador nativo', () => {
    setGlobals({ goAdminDesktop: {}, RTCPeerConnection: class {} }, { userAgent: `${desktopUa} Electron/31.0`, mediaDevices: mediaOk });
    const caps = getCapabilities();
    expect(caps.platform).toBe('electron');
    expect(caps.backgroundAudio).toBe(true);
    expect(caps.webrtc).toBe(true);
    expect(caps.nativeDialer).toBe(false);
  });
});

describe('queryMicrophonePermission', () => {
  it("devuelve el estado de permissions.query, o 'unknown' si no existe o falla", async () => {
    setGlobals({}, { userAgent: desktopUa, permissions: { query: jest.fn(async () => ({ state: 'denied' })) } });
    expect(await queryMicrophonePermission()).toBe('denied');
    setGlobals({}, { userAgent: desktopUa });
    expect(await queryMicrophonePermission()).toBe('unknown');
    setGlobals({}, { userAgent: desktopUa, permissions: { query: jest.fn(async () => { throw new TypeError('no'); }) } });
    expect(await queryMicrophonePermission()).toBe('unknown');
    setGlobals(undefined, undefined);
    expect(await queryMicrophonePermission()).toBe('unknown');
  });
});

describe('requestMicrophone', () => {
  it('pide audio con getUserMedia y libera las pistas', async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn(async () => ({ getTracks: () => [{ stop }, { stop }] }));
    setGlobals({}, { userAgent: desktopUa, mediaDevices: { getUserMedia } });
    expect(await requestMicrophone()).toEqual({ granted: true });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("traduce NotAllowedError a 'denied', NotFoundError a 'no_device' y el resto a 'error'", async () => {
    for (const [name, reason] of [['NotAllowedError', 'denied'], ['NotFoundError', 'no_device'], ['AbortError', 'error']] as const) {
      const err = Object.assign(new Error(name), { name });
      setGlobals({}, { userAgent: desktopUa, mediaDevices: { getUserMedia: jest.fn(async () => { throw err; }) } });
      expect(await requestMicrophone()).toEqual({ granted: false, reason, message: name });
    }
  });

  it("sin getUserMedia (SSR o WebView antiguo) responde 'unsupported' sin lanzar", async () => {
    setGlobals(undefined, undefined);
    expect(await requestMicrophone()).toEqual({ granted: false, reason: 'unsupported' });
    setGlobals({}, { userAgent: desktopUa });
    expect(await requestMicrophone()).toEqual({ granted: false, reason: 'unsupported' });
  });
});

describe('cableado F3: useTwilioDevice decide por platformCapabilities', () => {
  const fs = jest.requireActual<typeof import('fs')>('fs');
  const src = fs.readFileSync('src/components/voice/hooks/useTwilioDevice.ts', 'utf8');

  it('no repite la detección de Capacitor ni consulta permissions.query a mano', () => {
    expect(src).toMatch(/from '@\/lib\/services\/voice\/platformCapabilities'/);
    expect(src).toMatch(/getCapabilities\(\)/);
    expect(src).toMatch(/queryMicrophonePermission\(\)/);
    expect(src).toMatch(/if \(!caps\.webrtc\)/); // sin WebRTC (Capacitor o navegador sin RTCPeerConnection) → not_configured
    expect(src).not.toMatch(/isNativePlatform/);
    expect(src).not.toMatch(/navigator\.permissions/);
  });

  it('Capacitor: RECORD_AUDIO + MODIFY_AUDIO_SETTINGS en ambos manifests y NSMicrophoneUsageDescription en la plantilla iOS', () => {
    for (const f of ['mobile/android/app/src/main/AndroidManifest.xml', 'mobile/templates/AndroidManifest.xml']) {
      const xml = fs.readFileSync(f, 'utf8');
      for (const perm of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']) {
        expect((xml.match(new RegExp(`<uses-permission android:name="android\\.permission\\.${perm}" />`, 'g')) ?? []).length).toBe(1);
      }
    }
    expect(fs.readFileSync('mobile/templates/Info.plist', 'utf8')).toMatch(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]{10,}<\/string>/);
  });

  it('el módulo es hoja: no toca window/navigator al importarse', () => {
    const mod = fs.readFileSync('src/lib/services/voice/platformCapabilities.ts', 'utf8');
    const topLevel = mod.split('\n').filter((l) => /^(const|let|export const) /.test(l));
    for (const line of topLevel) expect(line).not.toMatch(/\b(window|navigator)\.(?!\w*\()/);
    expect(mod).not.toMatch(/^import .*(react|supabase|services\/crm)/m);
  });
});
