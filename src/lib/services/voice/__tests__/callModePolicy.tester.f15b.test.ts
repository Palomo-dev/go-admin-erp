/**
 * F5/F15-B — tester adversarial: matriz COMPLETA plataforma × preferencia ×
 * micrófono × webrtc de `resolveDefaultCallMode`, con invariantes en vez de
 * casos sueltos. Si alguien "relaja" la política (browser en Capacitor,
 * settingsHint vacío, mensaje sin ruta del SO) esto lo atrapa.
 */
import { microphoneSettingsHint, resolveDefaultCallMode, type CallModeCapabilities, type DesktopOs } from '../callModePolicy';
import type { MicrophonePermission } from '../platformCapabilities';

const PLATFORMS: Record<string, Omit<CallModeCapabilities, 'webrtc'>> = {
  web: { platform: 'web', backgroundAudio: true, nativeDialer: false },
  'pwa-desktop': { platform: 'pwa', backgroundAudio: true, nativeDialer: false },
  'pwa-mobile': { platform: 'pwa', backgroundAudio: false, nativeDialer: true },
  electron: { platform: 'electron', backgroundAudio: true, nativeDialer: false },
  android: { platform: 'capacitor-android', backgroundAudio: false, nativeDialer: true },
  ios: { platform: 'capacitor-ios', backgroundAudio: false, nativeDialer: true },
  // Un teléfono con navegador que declara backgroundAudio (raro): no es "mobile-like".
  'phone-bg-audio': { platform: 'web', backgroundAudio: true, nativeDialer: true },
};
const PREFS = [undefined, null, {}, { default_call_mode: null }, { default_call_mode: 'browser' as const }, { default_call_mode: 'mobile' as const }, { default_call_mode: 'ai' as never }, { default_call_mode: '' as never }, { default_call_mode: 'BROWSER' as never }];
const MICS: (MicrophonePermission | 'unsupported')[] = ['granted', 'denied', 'prompt', 'unknown', 'unsupported'];
const OSES: DesktopOs[] = ['win32', 'darwin', 'linux', 'unknown'];

describe('matriz completa', () => {
  const rows: string[] = [];
  for (const [name, base] of Object.entries(PLATFORMS)) {
    for (const webrtc of [true, false]) {
      for (const prefs of PREFS) {
        for (const mic of MICS) {
          for (const os of OSES) {
            const caps = { ...base, webrtc };
            const d = resolveDefaultCallMode(caps, prefs, mic as MicrophonePermission, os);
            rows.push(`${name} webrtc=${webrtc} pref=${JSON.stringify(prefs)} mic=${mic} os=${os} → ${d.mode}/${d.reason}`);
            const pref = prefs?.default_call_mode === 'browser' || prefs?.default_call_mode === 'mobile' ? prefs.default_call_mode : null;

            // I1: sin WebRTC NUNCA browser (Capacitor es webrtc=false siempre).
            if (!webrtc) expect(d.mode).toBe('mobile');
            // I2: mic denegado NUNCA browser.
            if (mic === 'denied') expect(d.mode).toBe('mobile');
            // I3: browser solo si webrtc && mic != denied && (pref browser || escritorio sin pref).
            if (d.mode === 'browser') {
              expect(webrtc).toBe(true);
              expect(mic).not.toBe('denied');
              expect(pref === 'browser' || (pref === null && !(name.startsWith('capacitor') || base.nativeDialer && !base.backgroundAudio))).toBe(true);
            }
            // I4: settingsHint solo con mic_denied, y entonces no vacío y del SO correcto.
            if (d.reason === 'mic_denied') {
              expect(d.settingsHint).toBeTruthy();
              expect(d.settingsHint).toBe(microphoneSettingsHint(caps.platform, os));
              if (caps.platform === 'electron') {
                if (os === 'win32') expect(d.settingsHint).toMatch(/^Windows/);
                if (os === 'darwin') expect(d.settingsHint).toMatch(/^macOS/);
                if (os === 'linux' || os === 'unknown') expect(d.settingsHint).not.toMatch(/Windows|macOS|navegador/);
              }
              if (caps.platform === 'capacitor-android') expect(d.settingsHint).toMatch(/^Android/);
              if (caps.platform === 'capacitor-ios') expect(d.settingsHint).toMatch(/^iOS/);
              if (caps.platform === 'web' || caps.platform === 'pwa') expect(d.settingsHint).toMatch(/candado/);
              expect(d.message).toMatch(/celular/);
            } else {
              expect(d.settingsHint).toBeNull();
            }
            // I5: pref mobile explícita → nunca hay nada que explicar.
            if (pref === 'mobile') expect(d).toEqual({ mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null });
            // I6: message solo cuando no se cumplió el softphone (no_webrtc / mic_denied).
            if (d.reason === 'platform_default' || d.reason === 'user_preference') expect(d.message).toBeNull();
            else expect(d.message).toBeTruthy();
            // I7: no_webrtc en Capacitor habla de la app móvil; en escritorio, del navegador.
            if (d.reason === 'no_webrtc') {
              if (caps.platform.startsWith('capacitor') || (base.nativeDialer && !base.backgroundAudio)) expect(d.message).toMatch(/app móvil/);
              else expect(d.message).toMatch(/navegador/);
            }
            // I8: preferencia inválida (ai, '', BROWSER) equivale a ninguna.
            if (prefs && 'default_call_mode' in prefs && pref === null) {
              expect(d).toEqual(resolveDefaultCallMode(caps, null, mic as MicrophonePermission, os));
            }
          }
        }
      }
    }
  }
  it(`evaluó ${rows.length} combinaciones sin violar invariantes`, () => {
    expect(rows.length).toBe(Object.keys(PLATFORMS).length * 2 * PREFS.length * MICS.length * OSES.length);
  });
});
