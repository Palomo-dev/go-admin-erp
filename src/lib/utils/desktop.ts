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
export interface GoAdminDesktopBridge {
  // Agente
  startAgent?: (
    refreshToken: string,
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
  printRaw?: (printerId: string, payload: unknown) => Promise<DesktopPrintResult>;
  reprintJob?: (jobId: string) => Promise<DesktopPrintResult>;
  openCashDrawer?: (printerName?: string) => Promise<DesktopPrintResult>;

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
 * Comprueba si el Desktop instalado soporta una capacidad concreta del bridge.
 * Evita romper la web cuando el cliente tiene un .exe anterior.
 */
export function desktopSupports(method: keyof GoAdminDesktopBridge): boolean {
  const bridge = getDesktopBridge();
  return typeof bridge?.[method] === 'function';
}
