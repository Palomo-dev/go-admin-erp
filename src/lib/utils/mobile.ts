/**
 * Utilidades para detectar y usar Go Admin Mobile (Capacitor).
 *
 * Cuando la app corre dentro de Go Admin Mobile, Capacitor expone
 * un bridge en `window.Capacitor` con acceso a plugins nativos
 * —cámara, geolocalización, Bluetooth LE, NFC, biometría, push—.
 *
 * En el navegador el bridge no existe, así que todo consumidor debe degradar
 * con elegancia. Las funciones de este módulo son seguras en SSR.
 *
 * IMPORTANTE: No se importa @capacitor/core directamente porque no está
 * instalado en el package.json raíz (solo en mobile/). Se usa detección
 * runtime de `window.Capacitor` y `window.Capacitor.Plugins.*`, igual que
 * desktop.ts usa `window.goAdminDesktop`. Los tipos se definen aquí mismo
 * para mantener el build web sin dependencias de Capacitor.
 */

// ============================================================================
// Tipos de plataforma
// ============================================================================

/** Plataforma nativa detectada por Capacitor. */
export type MobilePlatform = 'ios' | 'android' | 'web';

// ============================================================================
// Tipos de plugins (espejo de las interfaces de @capacitor/* sin importarlos)
// ============================================================================

/** Foto devuelta por Camera.takePhoto() o Camera.pickImages(). */
export interface MobilePhoto {
  format: 'jpeg' | 'png' | 'webp';
  dataUrl?: string;
  base64String?: string;
  saved?: boolean;
  path?: string;
  webPath?: string;
  exif?: Record<string, unknown>;
}

/** Resultado de escaneo de código de barras. */
export interface MobileBarcodeResult {
  barcode: string;
  format: string;
}

/** Posición geográfica devuelta por Geolocation. */
export interface MobileGeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

/** Token de notificaciones push (FCM Android / APNs iOS). */
export interface MobilePushToken {
  token: string;
  platform: 'ios' | 'android';
}

/** Estado de conexión de red. */
export interface MobileNetworkStatus {
  connected: boolean;
  connectionType: 'wifi' | 'cellular' | 'none' | 'unknown';
}

/** Resultado de autenticación biométrica. */
export interface MobileBiometricResult {
  verified: boolean;
  reason?: string;
}

/** Dispositivo Bluetooth LE descubierto. */
export interface MobileBluetoothDevice {
  deviceId: string;
  name?: string;
  rssi?: number;
  localName?: string;
}

// ============================================================================
// Interfaces de plugins (contrato que exponen los plugins Capacitor en runtime)
// ============================================================================

export interface MobileCameraPlugin {
  takePhoto(options?: { quality?: number; allowEditing?: boolean; resultType?: string }): Promise<MobilePhoto>;
  pickImages(options?: { quality?: number; limit?: number }): Promise<{ photos: MobilePhoto[] }>;
}

export interface MobileBarcodeScannerPlugin {
  scan(options?: { barcodeFormats?: string[] }): Promise<MobileBarcodeResult>;
}

export interface MobileGeolocationPlugin {
  getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<MobileGeolocationPosition>;
  checkPermissions(): Promise<{ location: string }>;
  requestPermissions(): Promise<{ location: string }>;
}

export interface MobilePushNotificationsPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  getToken(): Promise<{ token: string }>;
  addListener(event: string, callback: (payload: unknown) => void): Promise<void>;
  removeAllListeners(): Promise<void>;
}

export interface MobileLocalNotificationsPlugin {
  schedule(options: { notifications: Array<{ id: number; title: string; body: string; schedule?: unknown }> }): Promise<void>;
  cancel(options: { notifications: Array<{ id: number }> }): Promise<void>;
}

export interface MobileNetworkPlugin {
  getStatus(): Promise<MobileNetworkStatus>;
  addListener(event: string, callback: (status: MobileNetworkStatus) => void): Promise<void>;
}

export interface MobilePreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

export interface MobileHapticsPlugin {
  impact(options: { style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' }): Promise<void>;
  notification(options: { type: 'success' | 'warning' | 'error' }): Promise<void>;
  vibrate(): Promise<void>;
}

export interface MobileBiometricPlugin {
  isBiometricAvailable(): Promise<{ available: boolean }>;
  authenticate(options?: { reason?: string }): Promise<MobileBiometricResult>;
}

export interface MobileBluetoothLePlugin {
  initialize(): Promise<void>;
  requestDevice(options?: { services?: string[]; name?: string }): Promise<MobileBluetoothDevice>;
  connect(options: { deviceId: string }): Promise<void>;
  disconnect(options: { deviceId: string }): Promise<void>;
  write(options: { deviceId: string; service: string; characteristic: string; value: string }): Promise<void>;
}

export interface MobileNfcPlugin {
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  addListener(event: string, callback: (payload: unknown) => void): Promise<void>;
}

export interface MobileAppPlugin {
  getState(): Promise<{ isActive: boolean }>;
  addListener(event: string, callback: (payload: unknown) => void): Promise<void>;
  exitApp(): void;
}

export interface MobileBrowserPlugin {
  open(options: { url: string; windowName?: string }): Promise<void>;
  close(): Promise<void>;
}

export interface MobileFilesystemPlugin {
  writeFile(options: { path: string; data: string; directory?: string; encoding?: string }): Promise<{ uri: string }>;
  readFile(options: { path: string; directory?: string; encoding?: string }): Promise<{ data: string }>;
}

export interface MobileSharePlugin {
  share(options: { title?: string; text?: string; url?: string; files?: string[] }): Promise<void>;
}

// ============================================================================
// Bridge raíz de Capacitor (window.Capacitor)
// ============================================================================

/** Bridge raíz que Capacitor inyecta en window cuando corre en nativo. */
export interface MobileCapacitorBridge {
  isNativePlatform(): boolean;
  getPlatform(): MobilePlatform;
  Plugins: {
    Camera?: MobileCameraPlugin;
    BarcodeScanner?: MobileBarcodeScannerPlugin;
    Geolocation?: MobileGeolocationPlugin;
    PushNotifications?: MobilePushNotificationsPlugin;
    LocalNotifications?: MobileLocalNotificationsPlugin;
    Network?: MobileNetworkPlugin;
    Preferences?: MobilePreferencesPlugin;
    Haptics?: MobileHapticsPlugin;
    BiometricAuth?: MobileBiometricPlugin;
    BluetoothLe?: MobileBluetoothLePlugin;
    NFC?: MobileNfcPlugin;
    App?: MobileAppPlugin;
    Browser?: MobileBrowserPlugin;
    Filesystem?: MobileFilesystemPlugin;
    Share?: MobileSharePlugin;
  };
}

// ============================================================================
// Funciones de detección (SSR-safe, mismo patrón que desktop.ts)
// ============================================================================

/**
 * true si la app corre dentro de Go Admin Mobile (Capacitor nativo).
 * Seguro en SSR: devuelve false en el servidor.
 */
export function isMobile(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

/**
 * Devuelve el bridge raíz de Capacitor si está disponible, o null en navegador/SSR.
 */
export function getMobileBridge(): MobileCapacitorBridge | null {
  if (!isMobile()) return null;
  return (window as unknown as { Capacitor?: MobileCapacitorBridge }).Capacitor ?? null;
}

/**
 * Plataforma nativa específica: 'ios', 'android' o 'web'.
 * En SSR devuelve 'web'.
 */
export function getMobilePlatform(): MobilePlatform {
  const bridge = getMobileBridge();
  if (!bridge) return 'web';
  try {
    return bridge.getPlatform();
  } catch {
    return 'web';
  }
}

/** true si corre en iOS nativo. */
export function isIOS(): boolean {
  return isMobile() && getMobilePlatform() === 'ios';
}

/** true si corre en Android nativo. */
export function isAndroid(): boolean {
  return isMobile() && getMobilePlatform() === 'android';
}

/**
 * Versión de la app móvil (leída del package.json de mobile/), o null si no aplica.
 * Por ahora retorna null; se puede extender con un plugin custom si se necesita.
 */
export async function getMobileVersion(): Promise<string | null> {
  const bridge = getMobileBridge();
  if (!bridge?.Plugins?.App) return null;
  // App plugin no expone versión directamente; placeholder para futuro plugin custom.
  return null;
}

/**
 * Devuelve un plugin específico del bridge de Capacitor, o null si no está disponible.
 * Útil para acceso tipado sin importar paquetes @capacitor/* en el build web.
 *
 * @example
 * const camera = getMobilePlugin('Camera');
 * if (camera) { const photo = await camera.takePhoto(); }
 */
export function getMobilePlugin<K extends keyof MobileCapacitorBridge['Plugins']>(
  name: K,
): MobileCapacitorBridge['Plugins'][K] | null {
  const bridge = getMobileBridge();
  if (!bridge?.Plugins?.[name]) return null;
  return bridge.Plugins[name] ?? null;
}

/**
 * Comprueba si un plugin nativo está disponible en el bridge.
 * Evita romper la web cuando el cliente tiene una versión antigua de la app.
 */
export function mobilePluginAvailable<K extends keyof MobileCapacitorBridge['Plugins']>(
  name: K,
): boolean {
  const bridge = getMobileBridge();
  return !!bridge?.Plugins?.[name];
}
