/**
 * Postura de rate limit de las rutas de la pantalla remota (PLAN §11).
 * SOLO servidor.
 *
 * Por qué existe este módulo (F3-B ronda 4 · 1): el razonamiento de seguridad
 * del canje —«el peor caso son N intentos por ventana en TODO el
 * despliegue»— solo es cierto si el contador es del despliegue. El rate
 * limiter del repo tiene dos niveles (`rateLimit.ts`):
 *  - Nivel 1, un `Map` por proceso. En serverless el techo real es
 *    `limit × instancias`, y el propio tráfico del atacante provoca más
 *    instancias: el limitador se afloja justo cuando hace falta. Peor aún,
 *    cada lambda frío arranca con el Map vacío y devuelve el presupuesto
 *    entero.
 *  - Nivel 2, `RateLimitStore` persistente y atómico (RPC `fn_rate_limit_hit`),
 *    que sí es del despliegue. Se activa con `RATE_LIMIT_STORE=db`.
 *
 * `.env.example` reparte `memory` (es el default sensato del repo: activar
 * `db` sin la migración aplicada apagaría `verify/*` e `invite/resend`). Para
 * el canje de la pantalla eso no vale, así que:
 *
 * **`RATE_LIMIT_STORE=db` es requisito de despliegue de la fase 3.** En
 * producción, `/api/pos/display/pair` responde 503
 * `RATE_LIMIT_STORE_REQUIRED` si el store no está activo, en vez de atender
 * con un contador por instancia que no sostiene el cálculo escrito en
 * `PAIR_GLOBAL_RATE_LIMIT`. Fuera de producción (local, pruebas) se sigue con
 * el Map y un aviso una vez por proceso: ahí no hay N instancias.
 *
 * La migración de `fn_rate_limit_hit` ya existe (`crm_v4_f0sec_rate_limit_buckets`);
 * el despliegue correcto es: migración aplicada → `RATE_LIMIT_STORE=db` →
 * desplegar.
 *
 * Esta exigencia es SOLO para el canje. Los cubos de coste (`/bootstrap`,
 * `/heartbeat`, fallos de autenticación) protegen el gasto, no un secreto
 * adivinable: en modo memoria quedan degradados pero útiles, y cortarlos
 * dejaría sin pantalla a quien despliegue sin la variable.
 */

import { NextResponse } from 'next/server';
import type { RateLimitStore } from '@/lib/security/rateLimit';
import { getRateLimitStore, RATE_LIMIT_STORE_ENV } from '@/lib/security/rateLimitStore';

export const RATE_LIMIT_STORE_REQUIRED_CODE = 'RATE_LIMIT_STORE_REQUIRED';

export type DisplayRateLimitStore =
  | { ok: true; store: RateLimitStore | null }
  | { ok: false; response: NextResponse };

let warnedDegraded = false;

/** Solo para pruebas: olvida el aviso de modo degradado. */
export function _resetDisplayRateLimitWarning(): void {
  warnedDegraded = false;
}

/**
 * Store persistente para una ruta que lo EXIGE (el canje). Devuelve el 503
 * que la ruta debe responder tal cual cuando falta en producción. Nunca lanza.
 */
export function requireDisplayRateLimitStore(route: string): DisplayRateLimitStore {
  let store: RateLimitStore | null = null;
  try {
    store = getRateLimitStore();
  } catch (err) {
    console.error(`[pos-display/${route}] no se pudo construir el store de rate limit:`, err instanceof Error ? err.message : err);
    store = null;
  }
  if (store) return { ok: true, store };
  if (process.env.NODE_ENV === 'production') {
    console.error(
      `[pos-display/${route}] ${RATE_LIMIT_STORE_ENV} no es "db": el límite del canje sería por instancia (limit × instancias) y no sostiene el análisis de PAIR_GLOBAL_RATE_LIMIT. Se rechaza el canje (fail-closed).`,
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'El emparejamiento no está disponible en este servidor', code: RATE_LIMIT_STORE_REQUIRED_CODE },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }
  if (!warnedDegraded) {
    warnedDegraded = true;
    console.warn(`[pos-display/${route}] ${RATE_LIMIT_STORE_ENV} no es "db": el límite del canje es solo de este proceso. En producción esto sería un 503.`);
  }
  return { ok: true, store: null };
}

/**
 * Store para los cubos de COSTE (`/bootstrap`). Nunca bloquea por faltar: en
 * modo memoria el cubo queda por instancia, que sigue acotando el gasto de
 * cada proceso. Nunca lanza.
 */
export function displayCostRateLimitStore(): RateLimitStore | null {
  try {
    return getRateLimitStore();
  } catch {
    return null;
  }
}
