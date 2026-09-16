/**
 * Regla dura 5 (CLAUDE.md): la organización sale de la sesión, nunca del body.
 * Si el body (o la query) trae OTRA organización → 403 y se registra.
 *
 * Este módulo es el PUNTO ÚNICO de esa decisión (F0-SEC r2, sub-parte C):
 *
 * - `readOrgBody(ctx, request)` — lee el JSON / multipart / form-urlencoded de
 *   la petición y la query string, compara `organization_id | organizationId |
 *   orgId | org_id` con `ctx.organizationId` y, si difieren, registra un
 *   `console.warn` estructurado y lanza `OrgContextError(403,
 *   'FOREIGN_ORGANIZATION')`, que `withOrg` / `withWhatsAppRoute` / los
 *   `catch (error instanceof OrgContextError)` de las rutas ya convierten en
 *   respuesta. Devuelve el body parseado (`{}` si no hay body).
 * - `readOrgBody(ctx, bodyYaParseado)` — misma decisión sobre un objeto,
 *   `FormData` o `URLSearchParams` que la ruta ya leyó (por ejemplo dentro de
 *   un `try/catch` propio que convierte el JSON inválido en 400). Devuelve el
 *   mismo valor, para poder envolver: `schema.safeParse(readOrgBody(ctx, raw))`.
 * - `foreignOrganizationInBody(claimed, sessionOrg)` — el predicado puro
 *   original (nació en `voiceLibrary.ts`, F13 r2 lo movió aquí). Se conserva
 *   con su firma porque F12/F13 (`rejectForeignOrganization`) y Voces lo usan;
 *   `readOrgBody` delega en él. Nadie debería reimplementarlo.
 *
 * Es un módulo hoja (solo importa `OrgContextError` de otro módulo hoja) para
 * que las rutas y sus tests lo usen aunque `@/lib/utils/orgContext` esté
 * doblado con `jest.mock`; `orgContext.ts` lo re-exporta.
 *
 * Qué NO hace: nunca usa el valor del body para nada. La organización efectiva
 * es siempre la de la sesión. Ausente, vacío o igual a la de la sesión no es
 * un ataque (`null`): un cliente que manda la misma organización en el body
 * sigue funcionando.
 */

import { OrgContextError } from '@/lib/utils/orgContextError';

/** Claves con las que un cliente podría intentar declarar la organización. */
export const ORG_BODY_KEYS = ['organization_id', 'organizationId', 'orgId', 'org_id'] as const;

export const FOREIGN_ORGANIZATION_CODE = 'FOREIGN_ORGANIZATION';
export const FOREIGN_ORGANIZATION_MESSAGE = 'Organización no permitida';

/**
 * Devuelve el valor ajeno cuando `claimed` declara OTRA organización que la
 * de la sesión; `null` si está ausente, vacío o coincide.
 */
export function foreignOrganizationInBody(claimed: unknown, sessionOrg: number): unknown | null {
  if (claimed == null || String(claimed).trim() === '') return null;
  return Number(claimed) === sessionOrg ? null : claimed;
}

export interface OrgBodyContext {
  organizationId: number;
  userId?: string | null;
}

export interface ReadOrgBodyOptions {
  /** Etiqueta para el registro (ruta o servicio). */
  route?: string;
}

/** `FormData`, `URLSearchParams` o un doble de test con solo `get()`. */
interface ParamsLike {
  get(name: string): unknown;
  has?(name: string): boolean;
}

function isParamsLike(value: unknown): value is ParamsLike {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ParamsLike>;
  return typeof v.get === 'function';
}

/**
 * `Request` real o un doble de test con `json()`/`text()` (varias suites
 * construyen `{ json: async () => body } as never`). Un body ya parseado nunca
 * trae métodos `json`/`text`.
 */
function isRequestLike(value: unknown): value is Request {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Request>;
  return typeof v.json === 'function' || typeof v.text === 'function';
}

/**
 * Primer par clave/valor de organización presente en un objeto, `FormData` o
 * `URLSearchParams`. `null` si no declara ninguna.
 */
export function claimedOrganizationIn(source: unknown): { key: string; value: unknown } | null {
  if (source == null) return null;
  if (isParamsLike(source)) {
    for (const key of ORG_BODY_KEYS) {
      const present = typeof source.has === 'function' ? source.has(key) : source.get(key) != null;
      if (present) return { key, value: source.get(key) };
    }
    return null;
  }
  if (typeof source !== 'object' || Array.isArray(source)) return null;
  const obj = source as Record<string, unknown>;
  for (const key of ORG_BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return { key, value: obj[key] };
  }
  return null;
}

/** El valor ajeno tal cual si es escalar corto; recortado si es una cadena larga (nunca objetos enteros al log). */
function loggable(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).slice(0, 64);
}

function assertNotForeign<T>(ctx: OrgBodyContext, source: T, opts: ReadOrgBodyOptions | undefined, where: 'body' | 'query'): T {
  const claimed = claimedOrganizationIn(source);
  if (!claimed) return source;
  const foreign = foreignOrganizationInBody(claimed.value, ctx.organizationId);
  if (foreign === null) return source;
  console.warn(`[orgBody] ${claimed.key} ajeno en la petición (${where}) → 403`, {
    route: opts?.route ?? null,
    where,
    key: claimed.key,
    session: ctx.organizationId,
    body: loggable(foreign),
    userId: ctx.userId ?? null,
  });
  throw new OrgContextError(FOREIGN_ORGANIZATION_MESSAGE, 403, FOREIGN_ORGANIZATION_CODE);
}

async function readFromRequest<T>(ctx: OrgBodyContext, req: Request, opts?: ReadOrgBodyOptions): Promise<T> {
  // 1. Query string (DELETE y PATCH sin body suelen llevar los filtros ahí).
  let url: URL | null = null;
  try {
    url = typeof req.url === 'string' ? new URL(req.url) : null;
  } catch {
    url = null;
  }
  if (url) assertNotForeign(ctx, url.searchParams, opts, 'query');

  // 2. Body. Si la ruta ya lo consumió, debe pasar el objeto parseado a la
  //    sobrecarga síncrona; aquí no hay nada que leer.
  const method = (req.method || 'POST').toUpperCase();
  if (req.bodyUsed || method === 'GET' || method === 'HEAD') return {} as T;

  const contentType = (typeof req.headers?.get === 'function' ? req.headers.get('content-type') || '' : '').toLowerCase();
  let parsed: unknown;
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    try {
      parsed = await req.formData();
    } catch {
      throw new OrgContextError('Body inválido (formulario mal formado)', 400, 'INVALID_BODY');
    }
  } else if (typeof req.text === 'function') {
    const text = await req.text();
    if (text.trim() === '') {
      parsed = {};
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new OrgContextError('Body inválido (se espera JSON)', 400, 'INVALID_JSON');
      }
    }
  } else {
    // Doble de test sin `text()`: solo `json()`.
    try {
      parsed = await req.json();
    } catch {
      throw new OrgContextError('Body inválido (se espera JSON)', 400, 'INVALID_JSON');
    }
  }
  return assertNotForeign(ctx, parsed as T, opts, 'body');
}

/**
 * Punto único de la regla dura 5 (b). Ver la cabecera del módulo.
 *
 * - Con una `Request`: devuelve `Promise<T>` con el body parseado (`{}` si no
 *   hay body; 400 `INVALID_JSON` si es JSON mal formado; la query también se
 *   comprueba).
 * - Con un valor ya parseado (objeto, `FormData`, `URLSearchParams`, `null`):
 *   devuelve ese mismo valor, síncronamente.
 *
 * En ambos casos, organización ajena → `console.warn` + `OrgContextError(403,
 * 'FOREIGN_ORGANIZATION')`.
 */
// `any` a propósito: sustituye a `await request.json()`, que también devuelve
// `any`, para que las ~110 rutas migradas conserven su tipado (y sus casts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readOrgBody<T = any>(ctx: OrgBodyContext, request: Request, opts?: ReadOrgBodyOptions): Promise<T>;
export function readOrgBody<T>(ctx: OrgBodyContext, body: T, opts?: ReadOrgBodyOptions): T;
export function readOrgBody<T>(ctx: OrgBodyContext, source: Request | T, opts?: ReadOrgBodyOptions): Promise<T> | T {
  if (isRequestLike(source)) return readFromRequest<T>(ctx, source, opts);
  return assertNotForeign(ctx, source as T, opts, 'body');
}
