'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isMobile,
  isIOS,
  isAndroid,
  getMobilePlugin,
  mobilePluginAvailable,
  safeAddListener,
  type MobilePhoto,
  type MobileBarcodeResult,
  type MobileGeolocationPosition,
  type MobilePushToken,
  type MobileNetworkStatus,
  type MobileBiometricResult,
  type MobileBluetoothDevice,
  type MobilePluginListenerHandle,
} from '@/lib/utils/mobile';

// ============================================================================
// Interfaces de retorno
// ============================================================================

interface UseMobileNativeReturn {
  /** true si la app corre dentro de Go Admin Mobile (Capacitor nativo). */
  isMobileApp: boolean;
  /** true si corre en iOS nativo. */
  isIOSApp: boolean;
  /** true si corre en Android nativo. */
  isAndroidApp: boolean;
  /** Estado de conexión de red (solo se actualiza en móvil). */
  networkStatus: MobileNetworkStatus | null;
  /** Carga la cámara nativa y devuelve una foto. */
  takePhoto: (options?: { quality?: number; allowEditing?: boolean }) => Promise<MobilePhoto | null>;
  /** Selecciona imágenes de la galería nativa. */
  pickImages: (options?: { quality?: number; limit?: number }) => Promise<MobilePhoto[]>;
  /** Escanea un código de barras/QR con la cámara nativa. */
  scanBarcode: (options?: { barcodeFormats?: string[] }) => Promise<MobileBarcodeResult | null>;
  /** Obtiene la posición GPS actual. */
  getCurrentPosition: (options?: { enableHighAccuracy?: boolean; timeout?: number }) => Promise<MobileGeolocationPosition | null>;
  /** Solicita permiso y registra el token de push notifications. */
  registerPushToken: () => Promise<MobilePushToken | null>;
  /** Verifica al usuario con biometría (Touch ID / Face ID). */
  authenticateBiometric: (options?: { reason?: string }) => Promise<MobileBiometricResult | null>;
  /** Verifica si la biometría está disponible en el dispositivo. */
  checkBiometricAvailable: () => Promise<{ available: boolean; biometryType?: string }>;
  /** Inicia escaneo de tag NFC. Resuelve al leer un tag o timeout. */
  startNfcScan: (timeoutMs?: number) => Promise<{ success: boolean; data?: { id: string; text?: string; raw?: string }; error?: string }>;
  /** Detiene escaneo NFC y limpia listeners. */
  stopNfcScan: () => Promise<void>;
  /** Descubre dispositivos Bluetooth LE (para impresoras térmicas). */
  discoverBluetoothPrinters: (options?: { services?: string[] }) => Promise<MobileBluetoothDevice | null>;
  /** Feedback háptico (vibración). */
  hapticImpact: (style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => Promise<void>;
  /** Notificación háptica (success/warning/error). */
  hapticNotification: (type: 'success' | 'warning' | 'error') => Promise<void>;
  /** Abre URL en navegador nativo (in-app browser). */
  openBrowser: (url: string) => Promise<void>;
  /** Cierra navegador nativo. */
  closeBrowser: () => Promise<void>;
  /** Escribe archivo en filesystem del dispositivo. */
  writeFile: (path: string, data: string, directory?: string) => Promise<{ uri: string } | null>;
  /** Lee archivo del filesystem del dispositivo. */
  readFile: (path: string, directory?: string) => Promise<{ data: string } | null>;
  /** Comparte contenido vía sheet nativo. */
  shareContent: (options: { title?: string; text?: string; url?: string; files?: string[] }) => Promise<void>;
  /** Programa notificación local. */
  scheduleNotification: (id: number, title: string, body: string) => Promise<void>;
  /** Cancela notificación local. */
  cancelNotification: (id: number) => Promise<void>;
  /** Oculta teclado nativo. */
  hideKeyboard: () => Promise<void>;
}

// ============================================================================
// Hook principal
// ============================================================================

/**
 * Hook para acceder a plugins nativos de Capacitor desde componentes React.
 *
 * Sigue el mismo patrón que `useDesktopAgent`: lazy init con `useState(() => isMobile())`,
 * early return en useEffect si no aplica, y graceful degradation (retorna null
 * en web/desktop en lugar de throw).
 *
 * @example
 * const { isMobileApp, takePhoto, scanBarcode } = useMobileNative();
 * if (isMobileApp) { const photo = await takePhoto(); }
 */
export function useMobileNative(): UseMobileNativeReturn {
  const [isMobileApp] = useState(() => isMobile());
  const [isIOSApp] = useState(() => isIOS());
  const [isAndroidApp] = useState(() => isAndroid());
  const [networkStatus, setNetworkStatus] = useState<MobileNetworkStatus | null>(null);
  const listenersRegistered = useRef(false);

  // ==========================================================================
  // Cámara
  // ==========================================================================

  const takePhoto = useCallback(
    async (options?: { quality?: number; allowEditing?: boolean }): Promise<MobilePhoto | null> => {
      const camera = getMobilePlugin('Camera');
      if (!camera?.takePhoto) return null;
      try {
        return await camera.takePhoto(options);
      } catch (err) {
        console.warn('[useMobileNative] Error takePhoto:', err);
        return null;
      }
    },
    [],
  );

  const pickImages = useCallback(
    async (options?: { quality?: number; limit?: number }): Promise<MobilePhoto[]> => {
      const camera = getMobilePlugin('Camera');
      if (!camera?.pickImages) return [];
      try {
        const result = await camera.pickImages(options);
        return result.photos ?? [];
      } catch (err) {
        console.warn('[useMobileNative] Error pickImages:', err);
        return [];
      }
    },
    [],
  );

  // ==========================================================================
  // Escáner de códigos de barras
  // ==========================================================================

  const scanBarcode = useCallback(
    async (options?: { barcodeFormats?: string[] }): Promise<MobileBarcodeResult | null> => {
      const scanner = getMobilePlugin('BarcodeScanner');
      if (!scanner?.scan) return null;
      try {
        return await scanner.scan(options);
      } catch (err) {
        console.warn('[useMobileNative] Error scanBarcode:', err);
        return null;
      }
    },
    [],
  );

  // ==========================================================================
  // Geolocalización
  // ==========================================================================

  const getCurrentPosition = useCallback(
    async (options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<MobileGeolocationPosition | null> => {
      const geo = getMobilePlugin('Geolocation');
      if (!geo?.getCurrentPosition) return null;
      try {
        return await geo.getCurrentPosition(options);
      } catch (err) {
        console.warn('[useMobileNative] Error getCurrentPosition:', err);
        return null;
      }
    },
    [],
  );

  // ==========================================================================
  // Push notifications
  // ==========================================================================

  const registerPushToken = useCallback(async (): Promise<MobilePushToken | null> => {
    const push = getMobilePlugin('PushNotifications');
    if (!push?.requestPermissions || !push?.register || !push?.getToken) return null;
    try {
      const permResult = await push.requestPermissions();
      if (permResult.receive !== 'granted') return null;
      await push.register();
      const { token } = await push.getToken();
      return { token, platform: isIOS() ? 'ios' : 'android' };
    } catch (err) {
      console.warn('[useMobileNative] Error registerPushToken:', err);
      return null;
    }
  }, []);

  // ==========================================================================
  // Biometría
  // ==========================================================================

  const authenticateBiometric = useCallback(
    async (options?: { reason?: string }): Promise<MobileBiometricResult | null> => {
      const biometric = getMobilePlugin('BiometricAuth');
      if (!biometric?.authenticate) return null;
      try {
        return await biometric.authenticate(options);
      } catch (err) {
        console.warn('[useMobileNative] Error authenticateBiometric:', err);
        return { verified: false, reason: 'error' };
      }
    },
    [],
  );

  const checkBiometricAvailable = useCallback(
    async (): Promise<{ available: boolean; biometryType?: string }> => {
      const biometric = getMobilePlugin('BiometricAuth');
      if (!biometric?.isBiometricAvailable) return { available: false };
      try {
        return await biometric.isBiometricAvailable();
      } catch (err) {
        console.warn('[useMobileNative] Error checkBiometricAvailable:', err);
        return { available: false };
      }
    },
    [],
  );

  // ==========================================================================
  // NFC
  // ==========================================================================

  const startNfcScan = useCallback(
    async (timeoutMs?: number): Promise<{ success: boolean; data?: { id: string; text?: string; raw?: string }; error?: string }> => {
      const nfc = getMobilePlugin('NFC');
      if (!nfc?.startScan) return { success: false, error: 'plugin_not_available' };
      try {
        // Import dinámico para evitar acoplamiento en web
        const { startNfcScan: serviceStartNfcScan } = await import('@/lib/services/nfcService');
        return await serviceStartNfcScan(timeoutMs);
      } catch (err) {
        console.warn('[useMobileNative] Error startNfcScan:', err);
        return { success: false, error: 'error' };
      }
    },
    [],
  );

  const stopNfcScan = useCallback(async (): Promise<void> => {
    try {
      const { stopNfcScan: serviceStopNfcScan } = await import('@/lib/services/nfcService');
      await serviceStopNfcScan();
    } catch (err) {
      console.warn('[useMobileNative] Error stopNfcScan:', err);
    }
  }, []);

  // ==========================================================================
  // Bluetooth LE (impresoras térmicas)
  // ==========================================================================

  const discoverBluetoothPrinters = useCallback(
    async (options?: { services?: string[] }): Promise<MobileBluetoothDevice | null> => {
      const ble = getMobilePlugin('BluetoothLe');
      if (!ble?.requestDevice) return null;
      try {
        return await ble.requestDevice(options);
      } catch (err) {
        console.warn('[useMobileNative] Error discoverBluetoothPrinters:', err);
        return null;
      }
    },
    [],
  );

  // ==========================================================================
  // Haptics
  // ==========================================================================

  const hapticImpact = useCallback(
    async (style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' = 'medium'): Promise<void> => {
      const haptics = getMobilePlugin('Haptics');
      if (!haptics?.impact) return;
      try {
        await haptics.impact({ style });
      } catch {
        /* silencioso */
      }
    },
    [],
  );

  const hapticNotification = useCallback(
    async (type: 'success' | 'warning' | 'error'): Promise<void> => {
      const haptics = getMobilePlugin('Haptics');
      if (!haptics?.notification) return;
      try {
        await haptics.notification({ type });
      } catch {
        /* silencioso */
      }
    },
    [],
  );

  // ==========================================================================
  // Browser (in-app browser nativo)
  // ==========================================================================

  const openBrowser = useCallback(async (url: string): Promise<void> => {
    const browser = getMobilePlugin('Browser');
    if (!browser?.open) return;
    try {
      await browser.open({ url });
    } catch (err) {
      console.warn('[useMobileNative] Error openBrowser:', err);
    }
  }, []);

  const closeBrowser = useCallback(async (): Promise<void> => {
    const browser = getMobilePlugin('Browser');
    if (!browser?.close) return;
    try {
      await browser.close();
    } catch (err) {
      console.warn('[useMobileNative] Error closeBrowser:', err);
    }
  }, []);

  // ==========================================================================
  // Filesystem
  // ==========================================================================

  const writeFile = useCallback(
    async (path: string, data: string, directory?: string): Promise<{ uri: string } | null> => {
      const fs = getMobilePlugin('Filesystem');
      if (!fs?.writeFile) return null;
      try {
        return await fs.writeFile({ path, data, directory, encoding: 'utf8' });
      } catch (err) {
        console.warn('[useMobileNative] Error writeFile:', err);
        return null;
      }
    },
    [],
  );

  const readFile = useCallback(
    async (path: string, directory?: string): Promise<{ data: string } | null> => {
      const fs = getMobilePlugin('Filesystem');
      if (!fs?.readFile) return null;
      try {
        return await fs.readFile({ path, directory, encoding: 'utf8' });
      } catch (err) {
        console.warn('[useMobileNative] Error readFile:', err);
        return null;
      }
    },
    [],
  );

  // ==========================================================================
  // Share
  // ==========================================================================

  const shareContent = useCallback(
    async (options: { title?: string; text?: string; url?: string; files?: string[] }): Promise<void> => {
      const share = getMobilePlugin('Share');
      if (!share?.share) return;
      try {
        await share.share(options);
      } catch (err) {
        console.warn('[useMobileNative] Error shareContent:', err);
      }
    },
    [],
  );

  // ==========================================================================
  // Local notifications
  // ==========================================================================

  const scheduleNotification = useCallback(
    async (id: number, title: string, body: string): Promise<void> => {
      const notifications = getMobilePlugin('LocalNotifications');
      if (!notifications?.schedule) return;
      try {
        await notifications.schedule({ notifications: [{ id, title, body }] });
      } catch (err) {
        console.warn('[useMobileNative] Error scheduleNotification:', err);
      }
    },
    [],
  );

  const cancelNotification = useCallback(
    async (id: number): Promise<void> => {
      const notifications = getMobilePlugin('LocalNotifications');
      if (!notifications?.cancel) return;
      try {
        await notifications.cancel({ notifications: [{ id }] });
      } catch (err) {
        console.warn('[useMobileNative] Error cancelNotification:', err);
      }
    },
    [],
  );

  // ==========================================================================
  // Keyboard
  // ==========================================================================

  const hideKeyboard = useCallback(async (): Promise<void> => {
    const keyboard = getMobilePlugin('Keyboard');
    if (!keyboard?.hide) return;
    try {
      await keyboard.hide();
    } catch (err) {
      console.warn('[useMobileNative] Error hideKeyboard:', err);
    }
  }, []);

  // ==========================================================================
  // Network status + listeners (solo en móvil)
  // ==========================================================================

  useEffect(() => {
    if (!isMobileApp || listenersRegistered.current) return;
    listenersRegistered.current = true;

    const network = getMobilePlugin('Network');

    // Estado inicial de red
    if (network?.getStatus) {
      network.getStatus().then(setNetworkStatus).catch(() => { /* silencioso */ });
    }

    // Listener de cambios de red
    let networkListenerHandle: MobilePluginListenerHandle | null = null;
    if (network?.addListener) {
      safeAddListener(
        network,
        'networkStatusChange',
        (status: unknown) => {
          setNetworkStatus(status as MobileNetworkStatus);
        },
      ).then((handle) => {
        networkListenerHandle = handle;
      });
    }

    return () => {
      listenersRegistered.current = false;
      networkListenerHandle?.remove().catch(() => { /* silencioso */ });
    };
  }, [isMobileApp]);

  return {
    isMobileApp,
    isIOSApp,
    isAndroidApp,
    networkStatus,
    takePhoto,
    pickImages,
    scanBarcode,
    getCurrentPosition,
    registerPushToken,
    authenticateBiometric,
    checkBiometricAvailable,
    startNfcScan,
    stopNfcScan,
    discoverBluetoothPrinters,
    hapticImpact,
    hapticNotification,
    openBrowser,
    closeBrowser,
    writeFile,
    readFile,
    shareContent,
    scheduleNotification,
    cancelNotification,
    hideKeyboard,
  };
}

// ============================================================================
// Hooks especializados (para uso granular sin cargar todo el hook principal)
// ============================================================================

/**
 * Hook mínimo: solo detecta si es móvil. Útil para componentes que solo
 * necesitan saber si están en app nativa sin cargar lógica de plugins.
 */
export function useIsMobile(): boolean {
  const [isMobileApp] = useState(() => isMobile());
  return isMobileApp;
}

/**
 * Hook para verificar disponibilidad de un plugin específico.
 * Útil para mostrar/ocultar UI condicional basada en capacidades nativas.
 */
export function useMobilePluginAvailable<K extends Parameters<typeof mobilePluginAvailable>[0]>(
  pluginName: K,
): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!isMobile()) {
      setAvailable(false);
      return;
    }
    setAvailable(mobilePluginAvailable(pluginName));
  }, [pluginName]);

  return available;
}
