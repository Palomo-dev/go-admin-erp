/**
 * Cliente Supabase PROPIO de la pantalla remota (Fase 3, parte B). Solo
 * navegador. Ver docs/pos-doble-pantalla/F3-B-decisiones-transporte-remoto.md.
 *
 * POR QUÉ NO EL CLIENTE COMPARTIDO (`@/lib/supabase/config`)
 * - Aquel lleva la sesión del usuario (cookies, refresco automático, caché
 *   offline) y llama `realtime.setAuth()` por su cuenta en cada evento de
 *   auth: pisaría el JWT de la pantalla con el de una sesión (o con la clave
 *   anon) sin avisar. La tableta NO tiene sesión de usuario y no debe tenerla:
 *   su única credencial es el JWT de 5 min que emiten `/bootstrap` y cada
 *   `/heartbeat` (F3-A, ronda 3 · 2), con `role: anon` y el claim
 *   `pos_terminal_id` que leen las políticas `pos_display_pantalla_*`.
 * - Se construye con la opción `accessToken` de supabase-js: el cliente no
 *   crea `auth` (acceder a `client.auth` lanza) y Realtime pide el token a
 *   ese callback en cada join y en cada `setAuth()` sin argumento (lo llama
 *   supabase-js al confirmar el join). Así el token vigente es SIEMPRE el
 *   último que entregó el servidor.
 *
 * ORDEN OBLIGATORIO: `setToken(jwt)` (que hace `realtime.setAuth(jwt)`) va
 * ANTES de abrir el canal. Sin eso, el join sale con la clave anon como
 * `access_token`, la política del canal privado lo rechaza y supabase-js
 * reintenta con el mismo token. `useRemoteDisplay` lo espera antes de
 * construir el `SupabaseBroadcastReceiver`.
 *
 * Cada latido renueva el JWT: `setToken` de nuevo → `setAuth` empuja
 * `access_token` al canal ya unido, y las políticas se reevalúan con él.
 * Ante un 401 la pantalla cierra el receptor y llama `dispose()`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClientLike } from './supabaseBroadcastTransport';

export interface RemoteDisplayClientOptions {
  url?: string;
  anonKey?: string;
}

export interface RemoteDisplayClient {
  /** Para `SupabaseBroadcastReceiver`. */
  readonly client: SupabaseClientLike;
  /**
   * JWT vigente: el último que Realtime ACEPTÓ y que aún no ha vencido.
   * null antes del primero, si `setAuth` lo rechazó o si ya pasó su `exp`.
   */
  readonly token: string | null;
  /** Aplica un JWT nuevo al socket y a los canales unidos. Nunca lanza: un rechazo (JWT vencido) se registra y el token NO se conserva. */
  setToken(jwt: string): Promise<void>;
  /** Cierra todos los canales y el socket. Idempotente. */
  dispose(): Promise<void>;
}

/**
 * Segundos que faltan para el `exp` del JWT, o null si no se puede leer
 * (no es un JWT, payload ilegible, sin `exp`). No valida la firma: eso lo
 * hace el servidor de Realtime. Solo sirve para no volver a ofrecer un
 * token que ya sabemos muerto.
 */
export function jwtSecondsToExpiry(jwt: string, nowMs: number = Date.now()): number | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    // base64url → base64 con relleno; `atob` es global en el navegador y en Node ≥ 16.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json: unknown = JSON.parse(atob(base64));
    if (typeof json !== 'object' || json === null) return null;
    const exp = (json as { exp?: unknown }).exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    return exp - Math.floor(nowMs / 1000);
  } catch {
    return null;
  }
}

/** ¿Hay URL y clave anon para construir el cliente? En el navegador salen de `NEXT_PUBLIC_*`. */
export function resolveRemoteDisplayEnv(options: RemoteDisplayClientOptions = {}): { url: string; anonKey: string } | null {
  const url = options.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = options.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Construye el cliente sin sesión. Devuelve null si faltan las variables de
 * entorno públicas (la pantalla lo muestra como «no disponible», no como un
 * error de emparejamiento).
 */
export function createRemoteDisplayClient(options: RemoteDisplayClientOptions = {}): RemoteDisplayClient | null {
  const env = resolveRemoteDisplayEnv(options);
  if (!env) return null;

  let token: string | null = null;
  let disposed = false;

  /**
   * Olvida el JWT en los DOS sitios donde realtime-js lo guarda: el nuestro
   * y su `accessTokenValue`. Sin lo segundo no basta devolver null desde
   * `accessToken`: `setAuth()` sin argumento cae en `accessTokenValue`
   * (RealtimeClient.js, `token || (await this.accessToken()) ||
   * this.accessTokenValue`) y volvería a intentar con el vencido.
   */
  const forgetToken = (): void => {
    token = null;
    try {
      supabase.realtime.accessTokenValue = null;
    } catch {
      // versión de supabase-js sin ese campo: el callback ya devuelve null
    }
  };

  /**
   * Lo que realtime-js consulta en cada join y en cada `setAuth()` sin
   * argumento —que su latido de socket llama cada 30 s SIN esperar la
   * promesa—. Devolver un JWT ya vencido ahí significa un rechazo sin
   * capturar cada 30 s (en desarrollo, el overlay de Next: contra PLAN
   * §5.5) y un join que la política del canal privado rechaza. Así que en
   * cuanto pasa su `exp` se deja de ofrecer: sin token, realtime cae en la
   * clave anon y espera; el siguiente latido HTTP (60 s, o el forzado al
   * volver la pestaña) trae uno fresco.
   */
  const liveToken = (): string | null => {
    if (token === null) return null;
    const left = jwtSecondsToExpiry(token);
    if (left !== null && left <= 0) {
      forgetToken();
      return null;
    }
    return token;
  };

  const supabase: SupabaseClient = createClient(env.url, env.anonKey, {
    // Sin `auth`: el único token es el JWT de la pantalla, y lo entrega este callback.
    accessToken: async () => liveToken(),
    realtime: { params: { eventsPerSecond: 20 } },
    global: { headers: { 'x-client-info': 'go-admin-pos-display' } },
  });

  return {
    client: supabase as unknown as SupabaseClientLike,
    get token() {
      return liveToken();
    },
    async setToken(jwt: string) {
      if (disposed || typeof jwt !== 'string' || jwt.length === 0) return;
      // El token se da por vigente SOLO si Realtime lo acepta (ronda 2 · 3).
      // Antes se asignaba primero y un rechazo dejaba el JWT muerto pegado
      // como «vigente», que era justo lo que realtime-js volvía a ofrecer.
      try {
        await supabase.realtime.setAuth(jwt);
        token = jwt;
      } catch (err) {
        forgetToken();
        console.warn('[pos-display/remoto] Realtime rechazó el JWT de la pantalla; se descarta', err);
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      forgetToken();
      try {
        await supabase.removeAllChannels();
      } catch {
        // ya no hay canales
      }
      try {
        supabase.realtime.disconnect();
      } catch {
        // el socket ya estaba cerrado
      }
    },
  };
}
