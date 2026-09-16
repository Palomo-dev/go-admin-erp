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
 *   mismo valor, para poder envolver: `schema.safeParse(readOrgBody(ctx, raw,
 *   { request }))`. Con `{ request }` comprueba también la query string, antes
 *   del body; sin ella solo mira el body (deuda C de F0-SEC, cerrada).
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
  /**
   * Petición original. Solo la usa la sobrecarga síncrona: comprueba la query
   * string (`?organization_id=999`) ANTES del body ya parseado, con el mismo
   * código que la sobrecarga con `Request`. Sin ella, la sobrecarga síncrona
   * solo ve el body (deuda C de F0-SEC, cerrada 2026-09-16); por eso el
   * guardarraíl 5 exige `{ request }` en todo handler de `crm/**` y
   * `ai-assistant/**` que parsee el body por su cuenta.
   */
  request?: Pick<Request, 'url'>;
}

/** `FormData`, `URLSearchParams` o un doble de test con solo `get()`. */
interface ParamsLike {
  get(name: string): unknown;
  getAll?(name: string): unknown[];
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

export interface ClaimedOrganization {
  key: string;
  value: unknown;
}

/** `null`, `undefined`, `''` o solo espacios cuentan como «no declarada» para ESA clave. */
function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

/**
 * TODOS los pares clave/valor de organización con valor no vacío en un objeto,
 * `FormData` o `URLSearchParams`, en el orden de `ORG_BODY_KEYS`. Vacío si no
 * declara ninguna.
 *
 * Se evalúan todas las claves y no solo la primera: `{organization_id: 120,
 * organizationId: 999}` y `{organization_id: '', orgId: 999}` esquivaban el 403
 * porque la primera clave presente «ganaba» (tester F0-SEC C+D r2, fallo 3).
 */
export function claimedOrganizationsIn(source: unknown): ClaimedOrganization[] {
  if (source == null) return [];
  const found: ClaimedOrganization[] = [];
  if (isParamsLike(source)) {
    for (const key of ORG_BODY_KEYS) {
      // Todas las repeticiones de la clave (`?organization_id=120&organization_id=999`):
      // `get()` solo devuelve la primera (tester C+D r3, fallo bajo; QA r3 «B»).
      // Unión de `getAll()` y `get()` (un doble puede implementar solo uno): fail-closed.
      const values = new Set<unknown>([...(typeof source.getAll === 'function' ? source.getAll(key) : []), source.get(key)]);
      for (const value of values) if (!isBlank(value)) found.push({ key, value });
    }
    return found;
  }
  if (typeof source !== 'object' || Array.isArray(source)) return [];
  const obj = source as Record<string, unknown>;
  for (const key of ORG_BODY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && !isBlank(obj[key])) found.push({ key, value: obj[key] });
  }
  return found;
}

/**
 * Primer par clave/valor de organización con valor no vacío. `null` si no
 * declara ninguna. Azúcar sobre `claimedOrganizationsIn` (se conserva por los
 * tests que lo importan); la decisión de 403 mira todas las claves.
 */
export function claimedOrganizationIn(source: unknown): ClaimedOrganization | null {
  return claimedOrganizationsIn(source)[0] ?? null;
}

/** El valor ajeno tal cual si es escalar corto; recortado si es una cadena larga (nunca objetos enteros al log). */
function loggable(value: unknown): unknown {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).slice(0, 64);
}

/** Cualquier clave presente con una organización distinta ⇒ registro + 403 (se lanza en la primera ajena). */
function assertNotForeign<T>(ctx: OrgBodyContext, source: T, opts: ReadOrgBodyOptions | undefined, where: 'body' | 'query'): T {
  for (const claimed of claimedOrganizationsIn(source)) {
    const foreign = foreignOrganizationInBody(claimed.value, ctx.organizationId);
    if (foreign === null) continue;
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
  return source;
}

/**
 * Query string de la petición (DELETE y PATCH sin body suelen llevar los
 * filtros ahí): organización ajena ⇒ 403 `where: 'query'`. Es el MISMO código
 * para las dos sobrecargas (con `Request` y con `{ request }` en las opciones):
 * no hay una segunda lectura de la query en ninguna ruta. Una `url` que no
 * parsea (doble de test sin `url`) no se inspecciona.
 */
function assertQueryNotForeign(ctx: OrgBodyContext, req: Pick<Request, 'url'>, opts: ReadOrgBodyOptions | undefined): void {
  let url: URL | null = null;
  try {
    url = typeof req.url === 'string' ? new URL(req.url) : null;
  } catch {
    url = null;
  }
  if (url) assertNotForeign(ctx, url.searchParams, opts, 'query');
}

async function readFromRequest<T>(ctx: OrgBodyContext, req: Request, opts?: ReadOrgBodyOptions): Promise<T> {
  // 1. Query string.
  assertQueryNotForeign(ctx, req, opts);

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
 *   devuelve ese mismo valor, síncronamente. Con `{ request }` en las opciones
 *   comprueba además la query string de esa petición, ANTES del body (mismo
 *   orden que la sobrecarga con `Request`); sin ella, solo el body.
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
  // Sobrecarga síncrona: primero la query de la petición original (si la ruta
  // la pasa), después el body ya parseado. Deuda C de F0-SEC.
  if (opts?.request) assertQueryNotForeign(ctx, opts.request, opts);
  return assertNotForeign(ctx, source as T, opts, 'body');
}
