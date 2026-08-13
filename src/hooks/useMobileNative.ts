'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isMobile,
  isIOS,
  isAndroid,
  getMobilePlugin,
  mobilePluginAvailable,
  type MobilePhoto,
  type MobileBarcodeResult,
  type MobileGeolocationPosition,
  type MobilePushToken,
  type MobileNetworkStatus,
  type MobileBiometricResult,
  type MobileBluetoothDevice,
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
  /** Descubre dispositivos Bluetooth LE (para impresoras térmicas). */
  discoverBluetoothPrinters: (options?: { services?: string[] }) => Promise<MobileBluetoothDevice | null>;
  /** Feedback háptico (vibración). */
  hapticImpact: (style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => Promise<void>;
  /** Notificación háptica (success/warning/error). */
  hapticNotification: (type: 'success' | 'warning' | 'error') => Promise<void>;
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
    if (network?.addListener) {
      network.addListener('networkStatusChange', (status: MobileNetworkStatus) => {
        setNetworkStatus(status);
      }).catch(() => { /* silencioso */ });
    }

    return () => {
      listenersRegistered.current = false;
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
    discoverBluetoothPrinters,
    hapticImpact,
    hapticNotification,
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
