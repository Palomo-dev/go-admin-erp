/**
 * Quién opera los módulos de una organización, y sobre cuál (F-76).
 *
 * `/api/modules` y `/api/modules/pages` los usan dos actores distintos, y cada
 * uno entra por su propia puerta:
 *
 *  - **miembro**: la organización es la de la sesión (`getServerOrgContext`).
 *    Si el body o la query nombran otra, 403 `FOREIGN_ORGANIZATION` con su
 *    registro, en el punto único `readOrgBody`. Las escrituras exigen
 *    `admin.full_access` resuelto en el servidor
 *    (`requireOrgAdminOrPermission`), nunca por el nombre del rol ni por un
 *    valor que venga del cliente.
 *  - **plataforma**: administrador activo de GO Admin (`fn_is_platform_admin`,
 *    sobre la sesión: ni service role ni un id que mande el cliente), que opera
 *    legítimamente sobre organizaciones cliente de las que no es miembro —es el
 *    camino que abre `/api/super-admin-access`—. Solo entra si la petición
 *    NOMBRA una organización, todas las claves que la nombran coinciden y la
 *    organización existe. Cada acceso queda registrado.
 *
 * El cliente `service_role` se entrega SOLO al final, con la organización ya
 * validada. El primer arreglo de F-76 lo quitó del todo y pasó a leer con el
 * cliente de la sesión: `get_current_plan` empieza por `fn_assert_acceso_org`,
 * que rechaza a quien no es miembro activo ni dueño, así que para el
 * administrador de plataforma el plan llegaba `null` y solo quedaban los
 * módulos del núcleo (regresión del 2026-09-28).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getServerOrgContext,
  requireOrgAdminOrPermission,
  OrgContextError,
  type ServerOrgContext,
} from '@/lib/utils/orgContext';
import { isPlatformAdmin, requireSessionUser } from '@/lib/security/platformAdmin';
import {
  claimedOrganizationsIn,
  readOrgBody,
  FOREIGN_ORGANIZATION_CODE,
  FOREIGN_ORGANIZATION_MESSAGE,
} from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';

export type ViaModulos = 'miembro' | 'plataforma';

export interface ObjetivoModulos<T> {
  via: ViaModulos;
  /** Organización sobre la que se opera, ya validada. */
  organizationId: number;
  /** Usuario de la sesión que opera. */
  userId: string;
  /** Cliente de servicio: se entrega con la organización ya validada. */
  service: SupabaseClient;
  /** Body parseado (`{}` en un GET o sin body). */
  body: T;
}

export interface OpcionesObjetivoModulos {
  /** Etiqueta para los registros. */
  route: string;
  /** Escritura: al miembro se le exige ser administrador de su organización. */
  escritura: boolean;
}

const AMBIGUA = Symbol('organizacion-ambigua');

/** Body una sola vez: `{}` sin body o en GET/HEAD; 400 `INVALID_JSON` si está mal formado. */
async function leerCuerpo<T>(request: Request): Promise<T> {
  const metodo = (request.method || 'GET').toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD') return {} as T;
  const texto = await request.text();
  if (!texto.trim()) return {} as T;
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new OrgContextError('Body inválido (se espera JSON)', 400, 'INVALID_JSON');
  }
}

/**
 * La organización que nombra la petición (query y body, todas las claves y
 * repeticiones). `null` si no nombra ninguna; `AMBIGUA` si alguna no es un
 * entero positivo o no coinciden entre sí. Fail-closed: ante la duda, ambigua.
 */
function organizacionNombrada(fuentes: unknown[]): number | null | typeof AMBIGUA {
  const valores = fuentes.flatMap((f) => claimedOrganizationsIn(f)).map((c) => c.value);
  if (valores.length === 0) return null;
  const ids = valores.map((v) => {
    const texto = String(v).trim();
    return /^\d+$/.test(texto) ? Number(texto) : NaN;
  });
  if (ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) return AMBIGUA;
  return ids.every((n) => n === ids[0]) ? ids[0] : AMBIGUA;
}

/** 404 si la organización destino no existe (el administrador de plataforma no opera sobre huecos). */
async function asegurarQueExiste(service: SupabaseClient, organizationId: number): Promise<void> {
  const { data, error } = await service.from('organizations').select('id').eq('id', organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgContextError('La organización no existe', 404, 'ORG_NOT_FOUND');
}

export async function resolverObjetivoModulos<T = Record<string, unknown>>(
  request: Request,
  opciones: OpcionesObjetivoModulos
): Promise<ObjetivoModulos<T>> {
  const body = await leerCuerpo<T>(request);
  const query = new URL(request.url).searchParams;
  const nombrada = organizacionNombrada([query, body]);

  let ctx: ServerOrgContext | null = null;
  let errorMiembro: OrgContextError | null = null;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (!(err instanceof OrgContextError)) throw err;
    // Sin sesión no hay nada más que intentar: tampoco puede ser de plataforma.
    if (err.statusCode === 401) throw err;
    errorMiembro = err;
  }

  // 1. Miembro operando sobre SU organización (la petición no nombra otra).
  if (ctx && (nombrada === null || nombrada === ctx.organizationId)) {
    if (opciones.escritura) await requireOrgAdminOrPermission(ctx);
    return { via: 'miembro', organizationId: ctx.organizationId, userId: ctx.userId, service: getServiceClient(), body };
  }

  // 2. Nombra otra organización (o varias): solo la plataforma puede.
  if (nombrada !== null) {
    const sesion = await requireSessionUser();
    if (await isPlatformAdmin(sesion.supabase)) {
      if (nombrada === AMBIGUA) {
        throw new OrgContextError('La petición nombra organizaciones distintas', 400, 'ORG_AMBIGUOUS');
      }
      const service = getServiceClient();
      await asegurarQueExiste(service, nombrada);
      console.info(`[${opciones.route}] acceso de plataforma a una organización cliente`, {
        adminUserId: sesion.userId,
        organizationId: nombrada,
        metodo: request.method,
        escritura: opciones.escritura,
      });
      return { via: 'plataforma', organizationId: nombrada, userId: sesion.userId, service, body };
    }
  }

  // 3. Ni miembro de la organización nombrada ni plataforma. Con contexto de
  //    miembro, `readOrgBody` registra la organización ajena y lanza el 403
  //    `FOREIGN_ORGANIZATION` (primero la query, después el body).
  if (ctx) readOrgBody(ctx, body, { route: opciones.route, request });
  throw errorMiembro ?? new OrgContextError(FOREIGN_ORGANIZATION_MESSAGE, 403, FOREIGN_ORGANIZATION_CODE);
}

/** 4xx de `OrgContextError` como JSON; el resto se relanza. */
export function respuestaDeErrorOrg(err: unknown): Response {
  if (err instanceof OrgContextError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw err;
}
