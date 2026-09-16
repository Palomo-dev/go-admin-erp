import { webContents } from 'electron';

/**
 * Envía un mensaje IPC a todos los renderers vivos de la app: la barra de
 * aplicación (webContents de la ventana) y la web cargada en el
 * WebContentsView. Antes cada módulo enviaba a `win.webContents`, que desde
 * la fase 2 es la barra y no la web; centralizarlo aquí evita que un estado
 * (conectividad, actualización, tema) llegue a un renderer y no al otro.
 *
 * No hay dependencia con mainWindow.ts para evitar ciclos de importación
 * (connectivity.ts lo usa y mainWindow.ts importa connectivity.ts).
 */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    try {
      wc.send(channel, ...args);
    } catch {
      // Un renderer a medio cerrar no debe tumbar al resto.
    }
  }
}
