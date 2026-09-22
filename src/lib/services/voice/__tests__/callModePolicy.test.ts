/**
 * F5/F15-B — `resolveDefaultCallMode`: matriz plataforma × preferencia ×
 * micrófono. Es la única decisión «softphone o bridge» de la app (regla 7).
 */
import {
  detectDesktopOs,
  isMobileLike,
  microphoneSettingsHint,
  resolveDefaultCallMode,
  type CallModeCapabilities,
} from '../callModePolicy';
import type { MicrophonePermission } from '../platformCapabilities';

const CAPS: Record<'web' | 'pwa-desktop' | 'pwa-mobile' | 'electron' | 'android' | 'ios', CallModeCapabilities> = {
  web: { platform: 'web', webrtc: true, backgroundAudio: true, nativeDialer: false },
  'pwa-desktop': { platform: 'pwa', webrtc: true, backgroundAudio: true, nativeDialer: false },
  'pwa-mobile': { platform: 'pwa', webrtc: true, backgroundAudio: false, nativeDialer: true },
  electron: { platform: 'electron', webrtc: true, backgroundAudio: true, nativeDialer: false },
  // getCapabilities() deja webrtc=false en Capacitor (F15): el softphone in-app no se inicializa ahí.
  android: { platform: 'capacitor-android', webrtc: false, backgroundAudio: false, nativeDialer: true },
  ios: { platform: 'capacitor-ios', webrtc: false, backgroundAudio: false, nativeDialer: true },
};

const PREFS = { none: null, browser: { default_call_mode: 'browser' as const }, mobile: { default_call_mode: 'mobile' as const } };
const MICS: MicrophonePermission[] = ['granted', 'prompt', 'unknown'];

describe('resolveDefaultCallMode — escritorio (web, PWA de escritorio, Electron)', () => {
  it.each(['web', 'pwa-desktop', 'electron'] as const)('%s: sin preferencia y micrófono permitido → softphone por defecto', (p) => {
    for (const mic of MICS) {
      expect(resolveDefaultCallMode(CAPS[p], PREFS.none, mic)).toEqual({ mode: 'browser', reason: 'platform_default', message: null, settingsHint: null });
    }
  });

  it.each(['web', 'pwa-desktop', 'electron'] as const)('%s: la preferencia del usuario manda (browser/mobile)', (p) => {
    expect(resolveDefaultCallMode(CAPS[p], PREFS.browser, 'granted').mode).toBe('browser');
    expect(resolveDefaultCallMode(CAPS[p], PREFS.mobile, 'granted')).toEqual({ mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null });
  });

  it('Electron con micrófono denegado por el SO → bridge + dónde activarlo (Windows / macOS)', () => {
    const win = resolveDefaultCallMode(CAPS.electron, PREFS.none, 'denied', 'win32');
    expect(win.mode).toBe('mobile');
    expect(win.reason).toBe('mic_denied');
    expect(win.message).toMatch(/desde tu celular/);
    expect(win.settingsHint).toMatch(/Windows: Configuración → Privacidad y seguridad → Micrófono/);
    expect(win.settingsHint).toMatch(/aplicaciones de escritorio/);

    const mac = resolveDefaultCallMode(CAPS.electron, PREFS.browser, 'denied', 'darwin');
    expect(mac.mode).toBe('mobile');
    expect(mac.reason).toBe('mic_denied');
    expect(mac.settingsHint).toMatch(/macOS: Ajustes del Sistema → Privacidad y seguridad → Micrófono/);
  });

  it('web con micrófono denegado → bridge con la pista del candado del navegador', () => {
    const d = resolveDefaultCallMode(CAPS.web, PREFS.browser, 'denied');
    expect(d.mode).toBe('mobile');
    expect(d.reason).toBe('mic_denied');
    expect(d.settingsHint).toMatch(/candado/);
  });

  it('micrófono denegado pero preferencia mobile → user_preference sin mensaje (nada que explicar)', () => {
    expect(resolveDefaultCallMode(CAPS.electron, PREFS.mobile, 'denied', 'win32')).toEqual({ mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null });
  });
});

describe('resolveDefaultCallMode — móvil (Capacitor Android/iOS, PWA en el teléfono)', () => {
  it.each(['android', 'ios'] as const)('%s: por defecto bridge F5; el softphone no se puede cumplir (sin WebRTC) y se dice', (p) => {
    for (const mic of [...MICS, 'denied' as const]) {
      const none = resolveDefaultCallMode(CAPS[p], PREFS.none, mic);
      expect(none.mode).toBe('mobile');
      expect(none.reason).toBe('no_webrtc');
      expect(none.message).toMatch(/app móvil/);

      const browser = resolveDefaultCallMode(CAPS[p], PREFS.browser, mic);
      expect(browser.mode).toBe('mobile');
      expect(browser.reason).toBe('no_webrtc');
      expect(browser.message).toMatch(/desde tu celular/);

      expect(resolveDefaultCallMode(CAPS[p], PREFS.mobile, mic)).toEqual({ mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null });
    }
  });

  it('Capacitor con WebRTC habilitado (ruta B futura): la preferencia softphone se respeta; sin preferencia sigue el bridge', () => {
    const android = { ...CAPS.android, webrtc: true };
    expect(resolveDefaultCallMode(android, PREFS.none, 'granted')).toEqual({ mode: 'mobile', reason: 'platform_default', message: null, settingsHint: null });
    expect(resolveDefaultCallMode(android, PREFS.browser, 'granted').mode).toBe('browser');
    const denied = resolveDefaultCallMode(android, PREFS.browser, 'denied');
    expect(denied.mode).toBe('mobile');
    expect(denied.reason).toBe('mic_denied');
    expect(denied.settingsHint).toMatch(/Android: Ajustes → Aplicaciones → GoAdmin ERP → Permisos → Micrófono/);
    const ios = resolveDefaultCallMode({ ...CAPS.ios, webrtc: true }, PREFS.none, 'denied');
    expect(ios.settingsHint).toMatch(/iOS: Ajustes → GoAdmin ERP → Micrófono/);
  });

  it('PWA en el teléfono: bridge por defecto; en escritorio, softphone', () => {
    expect(resolveDefaultCallMode(CAPS['pwa-mobile'], PREFS.none, 'granted').mode).toBe('mobile');
    expect(resolveDefaultCallMode(CAPS['pwa-mobile'], PREFS.browser, 'granted').mode).toBe('browser');
    expect(resolveDefaultCallMode(CAPS['pwa-desktop'], PREFS.none, 'granted').mode).toBe('browser');
  });

  it('web sin RTCPeerConnection → bridge con mensaje de navegador', () => {
    const d = resolveDefaultCallMode({ ...CAPS.web, webrtc: false }, PREFS.none, 'granted');
    expect(d.mode).toBe('mobile');
    expect(d.reason).toBe('no_webrtc');
    expect(d.message).toMatch(/navegador no soporta/);
  });

  it('preferencias inválidas o ausentes se ignoran', () => {
    expect(resolveDefaultCallMode(CAPS.web, undefined, 'granted').reason).toBe('platform_default');
    expect(resolveDefaultCallMode(CAPS.web, { default_call_mode: 'ai' as never }, 'granted').reason).toBe('platform_default');
    expect(resolveDefaultCallMode(CAPS.web, { default_call_mode: null }, 'granted').reason).toBe('platform_default');
  });
});

describe('helpers', () => {
  it('isMobileLike', () => {
    expect(isMobileLike(CAPS.android)).toBe(true);
    expect(isMobileLike(CAPS.ios)).toBe(true);
    expect(isMobileLike(CAPS['pwa-mobile'])).toBe(true);
    expect(isMobileLike(CAPS.web)).toBe(false);
    expect(isMobileLike(CAPS.electron)).toBe(false);
  });

  it('detectDesktopOs por user agent', () => {
    expect(detectDesktopOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/33.4.11')).toBe('win32');
    expect(detectDesktopOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Electron/33.4.11')).toBe('darwin');
    expect(detectDesktopOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(detectDesktopOs('')).toBe('unknown');
    expect(detectDesktopOs(undefined)).toBe('unknown');
  });

  it('microphoneSettingsHint cubre cada plataforma con una ruta concreta', () => {
    expect(microphoneSettingsHint('electron', 'win32')).toMatch(/Windows/);
    expect(microphoneSettingsHint('electron', 'darwin')).toMatch(/macOS/);
    expect(microphoneSettingsHint('electron', 'linux')).toMatch(/privacidad del sistema/);
    expect(microphoneSettingsHint('capacitor-android')).toMatch(/Android/);
    expect(microphoneSettingsHint('capacitor-ios')).toMatch(/iOS/);
    expect(microphoneSettingsHint('web')).toMatch(/candado/);
    expect(microphoneSettingsHint('pwa')).toMatch(/candado/);
  });
});
