/**
 * Plataforma y capacidades reales del cliente (F15, para F3/F5).
 *
 * Módulo hoja: sin `window` ni `navigator` en tiempo de import (todo se lee
 * al llamar), sin React ni servicios. Reutiliza los detectores de
 * `desktop.ts` (`window.goAdminDesktop`) y `mobile.ts`
 * (`window.Capacitor.getPlatform()`), que también son hojas SSR-safe, para
 * no tener dos definiciones de «es Desktop» o «es Capacitor» (regla 7).
 *
 * Prioridad de detección: Capacitor nativo > Electron > PWA instalada > web.
 * Las capacidades se declaran solo cuando la API existe de verdad; y
 * `webrtc` es false en Capacitor aunque el WebView tenga `RTCPeerConnection`:
 * el softphone del navegador no está soportado ahí (F3/F5, ruta A «Mi celular»).
 */
import { isDesktop } from '@/lib/utils/desktop';
import { getMobilePlatform, isMobile } from '@/lib/utils/mobile';

export type Platform = 'web' | 'pwa' | 'electron' | 'capacitor-android' | 'capacitor-ios';

export interface PlatformCapabilities {
  platform: Platform;
  /** `getUserMedia` disponible (en Capacitor el WebView pide el permiso nativo). */
  microphone: boolean;
  /** Softphone del navegador (Twilio Voice SDK) viable. */
  webrtc: boolean;
  /** Push del servidor: Web Push (PushManager + SW) o plugin nativo de Capacitor. */
  pushNotifications: boolean;
  /** El audio sigue sonando con la ventana/pestaña en segundo plano. */
  backgroundAudio: boolean;
  /** `navigator.clipboard.writeText` disponible. */
  clipboard: boolean;
  /** `tel:` abre el marcador del sistema (móvil nativo o navegador móvil). */
  nativeDialer: boolean;
}

export type MicrophonePermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export type MicrophoneRequestResult =
  | { granted: true }
  | { granted: false; reason: 'denied' | 'no_device' | 'unsupported' | 'error'; message?: string };

type AnyWindow = Record<string, unknown> & { matchMedia?: (q: string) => { matches: boolean } };
type AnyNavigator = Record<string, unknown> & {
  userAgent?: string;
  standalone?: boolean;
  mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> };
  permissions?: { query?: (d: { name: PermissionName }) => Promise<{ state: string }> };
  clipboard?: { writeText?: unknown };
};

const win = (): AnyWindow | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as AnyWindow));
const nav = (): AnyNavigator | undefined => (typeof navigator === 'undefined' ? undefined : (navigator as unknown as AnyNavigator));
const ua = (): string => nav()?.userAgent ?? '';
const isMobileUa = (): boolean => /Android|iPhone|iPad|iPod/i.test(ua());

function isStandalone(): boolean {
  const w = win();
  if (!w) return false;
  try {
    if (w.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    // matchMedia ausente o roto: seguimos con el fallback de iOS.
  }
  return nav()?.standalone === true;
}

/** Electron: bridge del preload (como `desktop.ts`) o, sin preload, el user agent. */
function isElectron(): boolean {
  return isDesktop() || /\bElectron\//.test(ua());
}

export function detectPlatform(): Platform {
  if (!win()) return 'web';
  if (isMobile()) return getMobilePlatform() === 'ios' ? 'capacitor-ios' : 'capacitor-android';
  if (isElectron()) return 'electron';
  if (isStandalone()) return 'pwa';
  return 'web';
}

export function getCapabilities(): PlatformCapabilities {
  const w = win();
  const n = nav();
  const platform = detectPlatform();
  if (!w) {
    return { platform, microphone: false, webrtc: false, pushNotifications: false, backgroundAudio: false, clipboard: false, nativeDialer: false };
  }
  const native = platform === 'capacitor-android' || platform === 'capacitor-ios';
  const microphone = typeof n?.mediaDevices?.getUserMedia === 'function';
  const webrtc = !native && typeof w.RTCPeerConnection === 'function';
  const plugins = (w.Capacitor as { Plugins?: Record<string, unknown> } | undefined)?.Plugins;
  const pushNotifications = native
    ? Boolean(plugins?.PushNotifications)
    : platform !== 'electron' && 'PushManager' in w && 'Notification' in w && Boolean(n && 'serviceWorker' in n);
  const backgroundAudio = platform === 'electron' || (!native && !isMobileUa());
  const clipboard = typeof n?.clipboard?.writeText === 'function';
  const nativeDialer = native || isMobileUa();
  return { platform, microphone, webrtc, pushNotifications, backgroundAudio, clipboard, nativeDialer };
}

/** Decisión única de F3: el softphone del navegador solo donde hay WebRTC utilizable. */
export function supportsBrowserSoftphone(): boolean {
  return getCapabilities().webrtc;
}

/** Estado del permiso de micrófono SIN pedirlo (no lanza el prompt). */
export async function queryMicrophonePermission(): Promise<MicrophonePermission> {
  const query = nav()?.permissions?.query;
  if (typeof query !== 'function') return 'unknown';
  try {
    const status = await query.call(nav()?.permissions, { name: 'microphone' as PermissionName });
    const state = status?.state;
    return state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Pide el micrófono y libera las pistas enseguida: solo sirve para obtener el
 * permiso. En Capacitor el WebView traduce `getUserMedia` al permiso nativo
 * (`RECORD_AUDIO` / `NSMicrophoneUsageDescription`): no hace falta plugin.
 */
export async function requestMicrophone(): Promise<MicrophoneRequestResult> {
  const devices = nav()?.mediaDevices;
  if (typeof devices?.getUserMedia !== 'function') return { granted: false, reason: 'unsupported' };
  try {
    const stream = await devices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const message = err instanceof Error ? err.message : String(err);
    const reason = name === 'NotAllowedError' ? 'denied' : name === 'NotFoundError' ? 'no_device' : 'error';
    return { granted: false, reason, message };
  }
}
