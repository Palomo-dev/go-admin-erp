/**
 * Emparejar una pantalla remota DESDE LA CAJA (Fase 3, parte C; PLAN §3.3,
 * §5.2 «Emparejar otro dispositivo» y §7). Lo que la tarjeta de
 * Configuración y el indicador del POS necesitan además de las rutas:
 * presentación del código, cuenta atrás, URL que se le dice al usuario y
 * antigüedad de la última señal de la tableta. Módulo HOJA (sin React, sin
 * Supabase, sin DOM): se prueba en Node.
 *
 * El código lo emite `POST /api/pos/terminals/[id]/pairing-code` (parte A)
 * y vale 5 minutos; aquí no se reimplementa su forma (pairing.ts) ni su TTL:
 * la cuenta atrás sale del `expiresAt` que devuelve la ruta.
 */

import { CUSTOMER_DISPLAY_ROUTE } from './route';
import { PAIRING_CODE_LENGTH, isPairingCodeShape } from './pairing';

/** «123456» → «123 456»: se lee de un vistazo desde el otro lado del mostrador. Un valor con otra forma se devuelve tal cual. */
export function formatPairingCode(code: string): string {
  if (!isPairingCodeShape(code)) return code;
  const half = PAIRING_CODE_LENGTH / 2;
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/** Milisegundos que le quedan al código; 0 si venció o si `expiresAt` no es una fecha. Nunca negativo. */
export function pairingRemainingMs(expiresAt: string | null | undefined, now: number = Date.now()): number {
  if (typeof expiresAt !== 'string') return 0;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - now);
}

/** «m:ss» a partir de milisegundos (se redondea hacia arriba: a 0,4 s del final aún se ve «0:01»). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * URL de la pantalla que se le indica al usuario para la tableta. Si la caja
 * corre en un origen de bucle local (Go Admin Desktop sirve la app desde
 * 127.0.0.1:<puerto>; `next dev` desde localhost), ese origen no existe para
 * la tableta: se usa `publicOrigin` (NEXT_PUBLIC_APP_URL) si lo hay. Sin
 * origen utilizable se devuelve solo la ruta, y la UI dice «la dirección de
 * su ERP». Nunca lanza.
 */
export function resolvePairingUrl(origin: string | null | undefined, publicOrigin: string | null | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const pick = (candidate: string | null | undefined): string | null => {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) return null;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (LOOPBACK_HOSTS.has(url.hostname)) return null;
      return url.origin;
    } catch {
      return null;
    }
  };
  const base = pick(origin) ?? pick(publicOrigin);
  return base ? `${base}${CUSTOMER_DISPLAY_ROUTE}` : CUSTOMER_DISPLAY_ROUTE;
}

/**
 * Antigüedad en minutos de la última señal de la tableta
 * (`pos_terminals.display_last_seen_at`, que escribe `/heartbeat` como
 * mucho cada 30 s): 0 = hace menos de un minuto. null sin valor o con una
 * fecha ilegible. Es una diferencia de instantes, no un día de calendario:
 * no depende de la zona horaria.
 */
export function minutesSinceRemoteSeen(lastSeenAt: string | null | undefined, now: number = Date.now()): number | null {
  if (typeof lastSeenAt !== 'string') return null;
  const at = Date.parse(lastSeenAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

/**
 * Con el latido remoto cada 60 s y la escritura como mucho cada 30 s, una
 * señal de hace menos de 3 minutos significa «la tableta está encendida y
 * emparejada» aunque el canal esté dormido; más vieja, solo «lo estuvo».
 */
export const REMOTE_SEEN_RECENT_MINUTES = 3;
