/**
 * Utilidades para detectar y usar Go Admin Desktop (Electron).
 *
 * Cuando la app corre dentro de Go Admin Desktop, el proceso principal expone
 * un bridge seguro en `window.goAdminDesktop` (contextBridge). Eso permite
 * acceder a hardware local —impresoras USB, red, sistema— sin depender del
 * servidor HTTP de descubrimiento del print-agent de consola.
 *
 * En el navegador el bridge no existe, así que todo consumidor debe degradar
 * con elegancia. Las funciones de este módulo son seguras en SSR.
 */

export interface DesktopSystemPrinter {
  name: string;
  isDefault: boolean;
}

export interface DesktopNetworkPrinter {
  ip: string;
  port: number;
}

export interface DesktopUsbDevice {
  /** Hexadecimal con prefijo, ej. "0x04b8". Se guarda tal cual en `printers`. */
  vendorId: string;
  productId: string;
  name?: string;
  /** El dispositivo se declara de clase Impresora en el bus USB. */
  isPrinter: boolean;
  /** true si fue detectado via PowerShell/WMI (no via libusb). */
  viaWmi?: boolean;
}

export interface DesktopBluetoothDevice {
  name: string;
  macAddress: string;
  isPaired: boolean;
  isPrinter: boolean;
}

/** Respuesta del handler `printing:list` del proceso principal. */
export interface DesktopPrintersResponse {
  printers?: DesktopSystemPrinter[];
}

/** Respuesta del handler `printing:discover` del proceso principal. */
export interface DesktopDiscoverResponse {
  printers?: DesktopNetworkPrinter[];
}

/** Respuesta del endpoint `/usb` del agente (o su handler equivalente). */
export interface DesktopUsbResponse {
  devices?: DesktopUsbDevice[];
}

/** Respuesta del endpoint `/bluetooth` del agente. */
export interface DesktopBluetoothResponse {
  devices?: DesktopBluetoothDevice[];
}

/** Respuesta al imprimir directamente via IPC. */
export interface DesktopPrintResult {
  success: boolean;
  error?: string;
}

/** Estado del agente de impresión embebido. */
export interface DesktopAgentStatus {
  running: boolean;
  email: string | null;
  organizationName: string | null;
  branchNames: string[];
  lastHeartbeatAt: string | null;
  jobsPrinted: number;
  jobsFailed: number;
}

export interface DesktopUpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

/**
 * API expuesta por el preload de Go Admin Desktop.
 * Los métodos son opcionales porque un cliente puede tener una versión antigua
 * instalada: siempre hay que comprobar su existencia antes de invocarlos.
 */
export interface DesktopDisplayInfo {
  id: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface DesktopPosDisplayBridge {
  send?: (payload: unknown) => void;
  onMessage?: (handler: (payload: unknown) => void) => () => void;
  open?: (displayId?: number) => Promise<{ ok: boolean; reason?: string }>;
  close?: () => Promise<void>;
  status?: () => Promise<{ open: boolean; displayId: number | null }>;
  listDisplays?: () => Promise<DesktopDisplayInfo[]>;
  setEnabled?: (enabled: boolean, displayId?: number) => Promise<void>;
}

export interface GoAdminDesktopBridge {
  // Agente
  startAgent?: (
    refreshToken: string,
    orgId: number,
    orgName: string,
    branchIds: number[],
    branchNames: string[],
  ) => Promise<DesktopAgentStatus>;
  /**
   * Arranque con código de vinculación (POST /api/desktop/agent-session):
   * el agente abre su propia sesión y no comparte el refresh token de la web.
   * Solo existe en Desktop >= 0.1.3; si falta, se cae al `startAgent` legado.
   */
  startAgentWithToken?: (
    tokenHash: string,
    orgId: number,
    orgName: string,
    branchIds: number[],
    branchNames: string[],
  ) => Promise<DesktopAgentStatus>;
  stopAgent?: () => Promise<DesktopAgentStatus>;
  status?: () => Promise<DesktopAgentStatus>;
  logout?: () => Promise<boolean>;
  setAgentName?: (name: string) => Promise<boolean>;

  // Auto-arranque
  getAutoStart?: () => Promise<boolean>;
  setAutoStart?: (enabled: boolean) => Promise<boolean>;

  // Impresoras
  listPrinters?: () => Promise<DesktopPrintersResponse>;
  discoverNetwork?: () => Promise<DesktopDiscoverResponse>;
  listUsbDevices?: () => Promise<DesktopUsbResponse>;
  listBluetoothDevices?: () => Promise<DesktopBluetoothResponse>;
  printRaw?: (printerId: string, payload: unknown) => Promise<DesktopPrintResult>;
  reprintJob?: (jobId: string) => Promise<DesktopPrintResult>;
  openCashDrawer?: (printerName?: string) => Promise<DesktopPrintResult>;

  // Conectividad real (health-check contra Supabase, no navigator.onLine)
  isOnline?: () => Promise<boolean>;
  checkConnectivity?: () => Promise<boolean>;
  onConnectivity?: (callback: (online: boolean) => void) => void;

  // Ventana
  reload?: () => Promise<boolean>;

  /**
   * Pantalla del cliente del POS (docs/pos-doble-pantalla/PLAN.md §9).
   * Contrato acordado con el proceso principal:
   * - `send`/`onMessage`: un solo relay simétrico ('pos-display:message') con
   *   semántica de BroadcastChannel (quien envía no se recibe; los demás
   *   renderers sí). El payload es { channel, data } structured-clonable; el
   *   filtrado por `channel` lo hace el adaptador web (desktopChannel.ts).
   *   No depende del origen ni de la red: enlaza offline y aunque la ventana
   *   del POS y la de la pantalla carguen orígenes distintos (localhost vs
   *   127.0.0.1).
   * - `open`/`close`/`status`/`listDisplays`/`setEnabled`: ventana hija con la
   *   misma session/partition, en el monitor secundario a pantalla completa
   *   si existe. Solo existe en Desktop >= 0.2.1.
   */
  posDisplay?: DesktopPosDisplayBridge;

  // Versión y actualizaciones
  version?: () => Promise<string>;
  updateState?: () => Promise<DesktopUpdateState>;
  checkForUpdates?: () => Promise<DesktopUpdateState>;
  installUpdate?: () => Promise<boolean>;

  // Eventos
  onAutoStarted?: (callback: () => void) => void;
  onUpdateState?: (callback: (state: DesktopUpdateState) => void) => void;
}

/**
 * true si la app corre dentro de Go Admin Desktop.
 * Seguro en SSR: devuelve false en el servidor.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && 'goAdminDesktop' in window;
}

/**
 * Devuelve el bridge si está disponible, o null en navegador/SSR.
 */
export function getDesktopBridge(): GoAdminDesktopBridge | null {
  if (!isDesktop()) return null;
  return window.goAdminDesktop ?? null;
}

/**
 * Versión instalada de Go Admin Desktop, o null si no aplica.
 * Útil para mostrar el dato en la UI y para diagnóstico de soporte.
 */
export async function getDesktopVersion(): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.version) return null;
  try {
    return await bridge.version();
  } catch {
    return null;
  }
}

/**
 * Conectividad real vista desde el Desktop.
 *
 * `navigator.onLine` solo dice "hay un adaptador con enlace": con WiFi
 * conectado y router sin internet devuelve true y cada consulta a Supabase
 * se queda esperando timeouts. El proceso principal hace un health-check con
 * histéresis contra Supabase (`connectivity.ts`) y lo expone en `isOnline()`.
 *
 * Fuera del Desktop, o con un Desktop antiguo sin el método, se cae a
 * `navigator.onLine` (o true en SSR) para no cambiar el comportamiento.
 */
export async function isDesktopOnline(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.isOnline) {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
  try {
    return await bridge.isOnline();
  } catch {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
}

type ConnectivityListener = (online: boolean) => void;
const connectivityListeners = new Set<ConnectivityListener>();
let bridgeConnectivitySubscribed = false;

/**
 * Suscripción a los cambios de conectividad real del Desktop
 * (`connectivity:state`, emitido por `electron/src/main/connectivity.ts`).
 *
 * El preload registra UN solo listener (`onConnectivity` hace
 * `removeAllListeners` antes de suscribir), así que si dos módulos de la web
 * llamaran a `window.goAdminDesktop.onConnectivity()` el segundo pisaría al
 * primero. Este helper se suscribe al bridge una sola vez y reparte el evento
 * a todos los interesados (`offlineCache.ts`, `OfflineIndicator.tsx`).
 *
 * Devuelve la función para darse de baja. Fuera del Desktop, o con un
 * Desktop antiguo sin `onConnectivity`, no hace nada y devuelve un no-op:
 * el llamador debe caer a `window` `online`/`offline` si lo necesita.
 */
export function onDesktopConnectivity(listener: ConnectivityListener): () => void {
  const bridge = getDesktopBridge();
  if (!bridge?.onConnectivity) return () => {};
  connectivityListeners.add(listener);
  if (!bridgeConnectivitySubscribed) {
    bridgeConnectivitySubscribed = true;
    bridge.onConnectivity((online) => {
      for (const l of connectivityListeners) {
        try {
          l(online);
        } catch (err) {
          console.error('[desktop] Error en listener de conectividad:', err);
        }
      }
    });
  }
  return () => {
    connectivityListeners.delete(listener);
  };
}

/**
 * true si el Desktop instalado emite conectividad real por el bridge. Cuando
 * es true, `navigator.onLine` NO debe usarse como fuente de verdad: con WiFi
 * enlazado y sin internet devuelve true.
 */
export function desktopReportsConnectivity(): boolean {
  const bridge = getDesktopBridge();
  return typeof bridge?.onConnectivity === 'function' && typeof bridge?.isOnline === 'function';
}

/**
 * Comprueba si el Desktop instalado soporta una capacidad concreta del bridge.
 * Evita romper la web cuando el cliente tiene un .exe anterior.
 */
export function desktopSupports(method: keyof GoAdminDesktopBridge): boolean {
  const bridge = getDesktopBridge();
  return typeof bridge?.[method] === 'function';
}
