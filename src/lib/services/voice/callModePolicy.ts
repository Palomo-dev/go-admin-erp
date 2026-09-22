/**
 * Política del modo de llamada por plataforma (F5/F15-B). Módulo hoja y puro:
 * sin React, sin `window`, sin servicios. Es la ÚNICA función que decide
 * «¿softphone in-app o bridge "Llamar desde mi celular"?» (regla 7): la usan
 * `useCallModePolicy` (QuickActionsBar, CallButton) y `useTwilioDevice`
 * (texto del estado `no_permission`).
 *
 * Reglas, en orden:
 *  1. Sin WebRTC utilizable (Capacitor nativo, navegador viejo) → `mobile`,
 *     aunque el usuario prefiera el softphone: no hay forma de cumplirlo.
 *  2. Micrófono denegado por el SO → `mobile` con la ruta de Ajustes de ESA
 *     plataforma (Windows / macOS / Android / iOS / navegador).
 *  3. Preferencia del usuario (`user_comm_preferences.default_call_mode`).
 *  4. Por defecto: móvil (Capacitor, navegador móvil o PWA en el teléfono) →
 *     `mobile`; escritorio (web, PWA de escritorio, Electron) → `browser`.
 *
 * `mobile` = bridge F5: Twilio llama al celular verificado del vendedor y
 * luego al cliente. La llamada va por la red celular y sobrevive a que el
 * sistema mate el WebView: por eso es el modo seguro en móvil.
 */
import type { MicrophonePermission, Platform, PlatformCapabilities } from './platformCapabilities';

/** Mismo dominio que `user_comm_preferences.default_call_mode`. */
export type CallMode = 'browser' | 'mobile';

export type DesktopOs = 'win32' | 'darwin' | 'linux' | 'unknown';

export interface CallModePrefs {
  default_call_mode?: CallMode | null;
}

export type CallModeReason = 'platform_default' | 'user_preference' | 'no_webrtc' | 'mic_denied';

export interface CallModeDecision {
  mode: CallMode;
  reason: CallModeReason;
  /** Texto honesto para el usuario cuando NO se pudo cumplir su preferencia o el softphone. */
  message: string | null;
  /** Dónde activar el micrófono en esta plataforma (solo con `mic_denied`). */
  settingsHint: string | null;
}

export type CallModeCapabilities = Pick<PlatformCapabilities, 'platform' | 'webrtc' | 'backgroundAudio' | 'nativeDialer'>;

/** SO de escritorio a partir del user agent (Electron/web). Puro. */
export function detectDesktopOs(userAgent: string | null | undefined): DesktopOs {
  const ua = userAgent ?? '';
  if (/Windows/i.test(ua)) return 'win32';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'darwin';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
}

/** Ruta exacta de Ajustes para volver a permitir el micrófono, por plataforma. */
export function microphoneSettingsHint(platform: Platform, os: DesktopOs = 'unknown'): string {
  switch (platform) {
    case 'electron':
      if (os === 'win32') {
        return 'Windows: Configuración → Privacidad y seguridad → Micrófono → activa «Permitir que las aplicaciones de escritorio accedan al micrófono» y reinicia GO Admin ERP.';
      }
      if (os === 'darwin') {
        return 'macOS: Ajustes del Sistema → Privacidad y seguridad → Micrófono → activa «GO Admin ERP» y reinicia la app.';
      }
      return 'Activa el micrófono para GO Admin ERP en los ajustes de privacidad del sistema y reinicia la app.';
    case 'capacitor-android':
      return 'Android: Ajustes → Aplicaciones → GoAdmin ERP → Permisos → Micrófono → Permitir.';
    case 'capacitor-ios':
      return 'iOS: Ajustes → GoAdmin ERP → Micrófono → activar.';
    default:
      return 'Permite el micrófono desde el candado de la barra de direcciones del navegador y recarga la página.';
  }
}

/** Móvil «de verdad»: app Capacitor, o navegador/PWA en un teléfono (marcador nativo y sin audio en segundo plano). */
export function isMobileLike(caps: CallModeCapabilities): boolean {
  return caps.platform.startsWith('capacitor') || (caps.nativeDialer && !caps.backgroundAudio);
}

const NO_WEBRTC_MESSAGE: Record<'mobile' | 'desktop', string> = {
  mobile: 'El softphone in-app no está disponible en la app móvil. La llamada se hará desde tu celular: te llamamos y luego conectamos al cliente.',
  desktop: 'Este navegador no soporta llamadas WebRTC. La llamada se hará desde tu celular: te llamamos y luego conectamos al cliente.',
};

export function resolveDefaultCallMode(
  caps: CallModeCapabilities,
  prefs: CallModePrefs | null | undefined,
  mic: MicrophonePermission = 'unknown',
  os: DesktopOs = 'unknown',
): CallModeDecision {
  const pref = prefs?.default_call_mode === 'browser' || prefs?.default_call_mode === 'mobile' ? prefs.default_call_mode : null;
  const mobileLike = isMobileLike(caps);

  if (!caps.webrtc) {
    // Preferencia `mobile` explícita: no hay nada que explicar.
    if (pref === 'mobile') return { mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null };
    return { mode: 'mobile', reason: 'no_webrtc', message: NO_WEBRTC_MESSAGE[mobileLike ? 'mobile' : 'desktop'], settingsHint: null };
  }

  if (mic === 'denied') {
    if (pref === 'mobile') return { mode: 'mobile', reason: 'user_preference', message: null, settingsHint: null };
    return {
      mode: 'mobile',
      reason: 'mic_denied',
      message: 'El sistema tiene el micrófono bloqueado para esta app, así que la llamada se hará desde tu celular.',
      settingsHint: microphoneSettingsHint(caps.platform, os),
    };
  }

  if (pref) return { mode: pref, reason: 'user_preference', message: null, settingsHint: null };

  return { mode: mobileLike ? 'mobile' : 'browser', reason: 'platform_default', message: null, settingsHint: null };
}
