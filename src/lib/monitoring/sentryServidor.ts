/**
 * Reporte a Sentry desde el servidor (route handlers y middleware) SIN SDK.
 *
 * El servidor del ERP no carga Sentry: `@sentry/nextjs` se quitó porque sus plugins de webpack
 * dejaban sin memoria el build de Vercel (ver `sentry.server.config.ts`). Aquí se manda el evento
 * con `fetch` al endpoint de envelopes del proyecto, que funciona igual en Node y en el runtime
 * Edge del middleware, sin dependencias nuevas.
 *
 * - DSN: `SENTRY_DSN` o, si falta, `NEXT_PUBLIC_SENTRY_DSN` (el mismo proyecto del cliente). Sin
 *   DSN no hace nada.
 * - Nunca lanza ni tarda más de `TIMEOUT_MS`: un fallo de Sentry no puede tumbar la respuesta.
 * - Quien llama decide qué manda: solo etiquetas y datos de contexto, nunca datos de productos,
 *   cookies ni secretos. El mensaje de error pasa por `limpiarMensaje` (quita lo entre comillas,
 *   donde Postgres repite los valores que recibió).
 */

const TIMEOUT_MS = 2000;

export type NivelSentry = 'error' | 'warning' | 'info';

export interface EventoServidor {
  /** Mensaje (para un evento sin excepción) o, con `error`, se usa como respaldo. */
  mensaje?: string;
  error?: unknown;
  nivel?: NivelSentry;
  /** Etiquetas para buscar y agrupar (`area`, `organization_id`, `bloque`, `codigo`…). */
  tags: Record<string, string | number | null | undefined>;
  /** Contexto extra sin datos personales ni de productos. */
  extra?: Record<string, string | number | boolean | null | undefined>;
}

interface Dsn {
  clave: string;
  url: string;
  original: string;
}

/** `https://<clave>@<host>/<proyecto>` → endpoint de envelopes. null si no es un DSN válido. */
export function leerDsn(valor: string | undefined | null): Dsn | null {
  if (!valor) return null;
  try {
    const u = new URL(valor);
    const proyecto = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!u.username || !/^\d+$/.test(proyecto.split('/').pop() ?? '')) return null;
    const partes = proyecto.split('/');
    const id = partes.pop()!;
    const prefijo = partes.length ? `/${partes.join('/')}` : '';
    return { clave: u.username, url: `${u.protocol}//${u.host}${prefijo}/api/${id}/envelope/`, original: valor };
  } catch {
    return null;
  }
}

/** Quita lo entre comillas (valores que repite Postgres) y acorta: sin datos de productos. */
export function limpiarMensaje(texto: string): string {
  return texto
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, '(…)=(…)')
    .slice(0, 300);
}

function idEvento(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** Arma el envelope (cabecera, cabecera del ítem, evento) que espera Sentry. */
export function armarEnvelope(dsn: Dsn, ev: EventoServidor, ahora = new Date()): { id: string; cuerpo: string; evento: Record<string, unknown> } {
  const id = idEvento();
  const tags = Object.fromEntries(
    Object.entries(ev.tags).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]),
  );
  const extra = Object.fromEntries(Object.entries(ev.extra ?? {}).filter(([, v]) => v !== undefined));
  const evento: Record<string, unknown> = {
    event_id: id,
    timestamp: ahora.getTime() / 1000,
    platform: 'javascript',
    level: ev.nivel ?? (ev.error ? 'error' : 'warning'),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    server_name: 'goadmin-erp',
    tags,
    extra,
  };
  if (ev.error !== undefined) {
    const err = ev.error instanceof Error ? ev.error : null;
    evento.exception = {
      values: [
        {
          type: err?.name || 'Error',
          value: limpiarMensaje(err?.message || ev.mensaje || String(ev.error)),
        },
      ],
    };
  } else {
    evento.message = { formatted: limpiarMensaje(ev.mensaje ?? 'evento') };
  }
  const cuerpo = [
    JSON.stringify({ event_id: id, sent_at: ahora.toISOString(), dsn: dsn.original }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(evento),
  ].join('\n');
  return { id, cuerpo, evento };
}

/**
 * Manda el evento. Devuelve el id si Sentry lo recibió, null si no hay DSN o falló. Nunca lanza.
 * `fetchImpl` y `dsnCrudo` existen para los tests.
 */
export async function reportarSentryServidor(
  ev: EventoServidor,
  opciones: { fetchImpl?: typeof fetch; dsnCrudo?: string | null } = {},
): Promise<string | null> {
  try {
    const dsn = leerDsn(opciones.dsnCrudo !== undefined ? opciones.dsnCrudo : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
    if (!dsn) return null;
    const { id, cuerpo } = armarEnvelope(dsn, ev);
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
    try {
      const res = await (opciones.fetchImpl ?? fetch)(`${dsn.url}?sentry_key=${encodeURIComponent(dsn.clave)}&sentry_version=7`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: cuerpo,
        signal: control.signal,
        cache: 'no-store',
      });
      return res.ok ? id : null;
    } finally {
      clearTimeout(reloj);
    }
  } catch (e) {
    console.error('[sentry-servidor] No se pudo reportar:', e instanceof Error ? e.message : e);
    return null;
  }
}
