/**
 * Servicio de NFC para Go Admin Mobile (Capacitor).
 *
 * Wrapper sobre @capgo/capacitor-nfc con graceful degradation.
 * - Android: lectura/escritura de tags NDEF.
 * - iOS: solo lectura de tags NDEF (limitación de Apple).
 *
 * En web/desktop todas las funciones retornan { success: false }.
 * No importa paquetes @capacitor/* — usa detección runtime via getMobilePlugin().
 */

import {
  isMobile,
  isAndroid,
  isIOS,
  getMobilePlugin,
  type MobilePluginListenerHandle,
} from '@/lib/utils/mobile';

// ============================================================================
// Tipos
// ============================================================================

export interface NfcTagData {
  id: string;
  text?: string;
  raw?: string;
}

export interface NfcScanResult {
  success: boolean;
  data?: NfcTagData;
  error?: string;
}

// ============================================================================
// Estado interno del listener
// ============================================================================

let nfcListenerHandle: MobilePluginListenerHandle | null = null;
let scanResolve: ((result: NfcScanResult) => void) | null = null;
let scanTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// API pública
// ============================================================================

/**
 * Verifica si NFC está disponible en el dispositivo.
 * NFC es principalmente Android; iOS tiene soporte limitado (solo lectura NDEF).
 */
export function isNfcAvailable(): boolean {
  if (!isMobile()) return false;
  return isAndroid() || isIOS();
}

/**
 * Inicia el escaneo de tags NFC.
 * @param timeoutMs - Tiempo máximo de espera (default: 30s)
 * @returns Promise que resuelve cuando se lee un tag, hay error, o expira el timeout.
 */
export async function startNfcScan(timeoutMs = 30000): Promise<NfcScanResult> {
  if (!isMobile()) {
    return { success: false, error: 'not_mobile' };
  }

  if (!isAndroid() && !isIOS()) {
    return { success: false, error: 'platform_not_supported' };
  }

  const nfc = getMobilePlugin('NFC');
  if (!nfc?.startScan || !nfc?.addListener) {
    return { success: false, error: 'plugin_not_available' };
  }

  try {
    // Iniciar escaneo nativo
    await nfc.startScan();

    // Escuchar eventos de tag descubiertos
    return new Promise<NfcScanResult>((resolve) => {
      scanResolve = resolve;

      nfc.addListener('nfcTagDiscovered', (payload: unknown) => {
        const p = payload as { id?: string; text?: string; ndefMessage?: Array<{ payload?: string }> };
        const data: NfcTagData = {
          id: p?.id || '',
          text: p?.text || p?.ndefMessage?.[0]?.payload,
          raw: JSON.stringify(payload),
        };
        void stopNfcScan();
        resolve({ success: true, data });
      }).then((handle) => {
        nfcListenerHandle = handle;
      }).catch((err) => {
        console.error('[nfcService] Error adding listener:', err);
        void stopNfcScan();
        resolve({ success: false, error: 'listener_error' });
      });

      // Timeout para no quedar colgado esperando un tag
      scanTimeout = setTimeout(() => {
        if (scanResolve) {
          void stopNfcScan();
          resolve({ success: false, error: 'timeout' });
        }
      }, timeoutMs);
    });
  } catch (error) {
    console.error('[nfcService] Error starting scan:', error);
    return { success: false, error: 'scan_error' };
  }
}

/**
 * Detiene el escaneo de NFC y limpia listeners.
 */
export async function stopNfcScan(): Promise<void> {
  const nfc = getMobilePlugin('NFC');

  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }

  if (nfcListenerHandle) {
    try {
      await nfcListenerHandle.remove();
    } catch (err) {
      console.warn('[nfcService] Error removing listener:', err);
    }
    nfcListenerHandle = null;
  }

  if (nfc?.stopScan) {
    try {
      await nfc.stopScan();
    } catch (err) {
      console.warn('[nfcService] Error stopping scan:', err);
    }
  }

  scanResolve = null;
}

/**
 * Limpieza total al desmontar componente.
 */
export function cleanupNfc(): void {
  void stopNfcScan();
}
