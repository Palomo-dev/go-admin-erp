import { WebContents, webContents } from 'electron';

/**
 * Envía un mensaje IPC a todos los renderers vivos de la app: la barra de
 * aplicación (webContents de la ventana), la web cargada en el
 * WebContentsView y, si está abierta, la pantalla del cliente. Antes cada
 * módulo enviaba a `win.webContents`, que desde la fase 2 es la barra y no la
 * web; centralizarlo aquí evita que un estado (conectividad, actualización,
 * tema) llegue a un renderer y no al otro.
 *
 * No hay dependencia con mainWindow.ts para evitar ciclos de importación
 * (connectivity.ts lo usa y mainWindow.ts importa connectivity.ts).
 */
export function broadcast(channel: string, ...args: unknown[]): void {
  broadcastExcept(null, channel, ...args);
}

/**
 * Igual que `broadcast`, pero sin entregar el mensaje al remitente. Es la
 * semántica de `BroadcastChannel` (quien publica no se recibe a sí mismo) y
 * la usa el relé de la pantalla del cliente (`pos-display:message`): la caja
 * publica y solo la pantalla —y cualquier otro renderer— lo recibe.
 *
 * `sender` admite el `WebContents` o su `id`; `null` equivale a `broadcast`.
 * Se resuelve el id una sola vez y se compara por id, no por referencia: un
 * webContents a medio destruir puede seguir en la lista pero ya no tiene
 * `id` fiable, y `isDestroyed()` lo aparta antes de tocarlo.
 */
export function broadcastExcept(
  sender: WebContents | number | null,
  channel: string,
  ...args: unknown[]
): void {
  const excludedId = resolveSenderId(sender);
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    if (excludedId !== null && wc.id === excludedId) continue;
    try {
      wc.send(channel, ...args);
    } catch {
      // Un renderer a medio cerrar no debe tumbar al resto.
    }
  }
}

function resolveSenderId(sender: WebContents | number | null): number | null {
  if (sender === null) return null;
  if (typeof sender === 'number') return Number.isInteger(sender) ? sender : null;
  try {
    return sender.isDestroyed() ? null : sender.id;
  } catch {
    return null;
  }
}
