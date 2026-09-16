import { app, net } from 'electron';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';
import { broadcast } from './broadcast';

/**
 * Monitor de conectividad real.
 *
 * `navigator.onLine` / `net.online` solo dicen "hay un adaptador de red con
 * enlace". El caso más común en un local comercial —WiFi conectado, router sin
 * internet— reporta `true` y la app se queda colgada en timeouts en vez de
 * entrar en modo offline.
 *
 * Aquí se hace una comprobación real contra Supabase con histéresis: hacen
 * falta varios fallos seguidos para declararse offline, y un solo éxito para
 * volver a online.
 */

const CHECK_INTERVAL_MS = 15_000;
const CHECK_TIMEOUT_MS = 8_000;
const FAILURES_TO_GO_OFFLINE = 2;

/**
 * URL del health-check. Solo en desarrollo se puede sustituir con la variable
 * de entorno GOADMIN_HEALTHCHECK_URL para simular una caída (p. ej.
 * `http://127.0.0.1:9/`) y ver cómo reacciona la barra sin apagar la red.
 * En la app empaquetada se ignora.
 */
function getHealthcheckUrl(): string {
  const override = process.env.GOADMIN_HEALTHCHECK_URL;
  if (!app.isPackaged && override) return override;
  return `${SUPABASE_URL}/rest/v1/`;
}

let online = true;
let consecutiveFailures = 0;
let timer: NodeJS.Timeout | null = null;
let checking = false;

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

export function isOnline(): boolean {
  return online;
}

export function onConnectivityChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

async function probe(): Promise<boolean> {
  // Sin enlace físico no hace falta ni intentarlo.
  if (!net.online) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await net.fetch(getHealthcheckUrl(), {
      method: 'HEAD',
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal,
      cache: 'no-store',
    });
    // Cualquier respuesta del servidor (incluido 401/404) prueba que hay ruta.
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function setOnline(next: boolean): void {
  if (next === online) return;
  online = next;
  console.log(`[connectivity] Estado: ${online ? 'ONLINE' : 'OFFLINE'}`);
  for (const cb of listeners) {
    try {
      cb(online);
    } catch (err) {
      console.error('[connectivity] Error en listener:', err);
    }
  }
  // Llega a la barra (webContents de la ventana) y a la web (WebContentsView).
  broadcast('connectivity:state', online);
}

export async function checkNow(): Promise<boolean> {
  if (checking) return online;
  checking = true;
  try {
    const ok = await probe();
    if (ok) {
      consecutiveFailures = 0;
      setOnline(true);
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURES_TO_GO_OFFLINE) setOnline(false);
    }
    return online;
  } finally {
    checking = false;
  }
}

export function initConnectivity(): void {
  if (timer) return;
  // El evento nativo acelera la reacción; la comprobación real la hace checkNow.
  net.online === false && setOnline(false);
  void checkNow();
  timer = setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
}

export function stopConnectivity(): void {
  if (timer) clearInterval(timer);
  timer = null;
  listeners.clear();
}
