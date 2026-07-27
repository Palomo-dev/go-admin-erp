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

/** Respuesta del handler `printing:list` del proceso principal. */
export interface DesktopPrintersResponse {
  printers?: DesktopSystemPrinter[];
}

/** Respuesta del handler `printing:discover` del proceso principal. */
export interface DesktopDiscoverResponse {
  printers?: DesktopNetworkPrinter[];
}

/**
 * API expuesta por el preload de Go Admin Desktop.
 * Los métodos son opcionales porque un cliente puede tener una versión antigua
 * instalada: siempre hay que comprobar su existencia antes de invocarlos.
 */
export interface GoAdminDesktopBridge {
  listPrinters?: () => Promise<DesktopPrintersResponse>;
  discoverNetwork?: () => Promise<DesktopDiscoverResponse>;
  version?: () => Promise<string>;
  updateState?: () => Promise<unknown>;
  checkForUpdates?: () => Promise<unknown>;
  installUpdate?: () => Promise<boolean>;
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
