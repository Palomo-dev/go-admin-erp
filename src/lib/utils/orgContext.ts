/**
 * Contexto de organización para el servidor (route handlers / server actions).
 *
 * - `getServerOrgContext(req?)`: sesión del usuario (cookies) + organización
 *   activa. Orden de resolución de la org:
 *     1. header `X-Organization-Id`
 *     2. cookie `goadmin_org_id` (o la legacy `org_id`)
 *        — si header y cookie vienen los dos y NO coinciden → 403
 *          `ORG_AMBIGUOUS` y se registra (F0-SEC r2): un cliente coherente
 *          nunca manda dos organizaciones distintas en la misma petición.
 *     3. `profiles.last_org_id`
 *     4. si el usuario tiene EXACTAMENTE una membresía activa, esa
 *     5. si no → 400 `ORG_AMBIGUOUS`
 *   En todos los casos se verifica que el usuario sea miembro activo de la org
 *   elegida (403 si no).
 * - `readOrgBody(ctx, request | body)`: regla dura 5 (b). Si el body o la
 *   query traen otra organización → registro + 403 `FOREIGN_ORGANIZATION`.
 *   Vive en `@/lib/security/organizationBody` (módulo hoja) y aquí se
 *   re-exporta; toda ruta de escritura debe llamarlo (guardarraíl 5).
 * - `getServerOrgContextFor(organizationId)`: misma comprobación de sesión y
 *   membresía activa, pero para una org que ya salió de un recurso del
 *   servidor (p. ej. la invitación de un código), no de la petición.
 * - `resolveOrgFromExternal(identifier, kind)`: para webhooks (sin sesión);
 *   usa el cliente service-role. Si el identificador pertenece a más de una
 *   organización → 409 `ORG_AMBIGUOUS` y registro (nunca «la primera»).
 * - `requireOrgAdmin(ctx)`: mismo criterio que `src/lib/utils/rbac.ts`
 *   (`organization_members.is_super_admin` o role_id 1|2; NUNCA por nombre).
 * - `requireOrgAdminOrPermission(ctx, code?)`: lo anterior o, si no, el
 *   permiso `admin.full_access` resuelto en la base con `check_user_permission`
 *   (rol + cargo, precedencia del cargo). Es lo que usa `withOrg({admin})`.
 * - `withOrg(handler)` / `withCron(handler)`: wrappers para route handlers.
 */

import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { isOrgAdminLike, ORG_ADMIN_PERMISSION_CODE } from './orgAdmin';
import { OrgContextError } from './orgContextError';

export { OrgContextError } from './orgContextError';
export {
  readOrgBody,
  claimedOrganizationIn,
  foreignOrganizationInBody,
  ORG_BODY_KEYS,
  FOREIGN_ORGANIZATION_CODE,
  type OrgBodyContext,
  type ReadOrgBodyOptions,
} from '@/lib/security/organizationBody';

export interface ServerOrgContext {
  userId: string;
  userEmail: string | null;
  organizationId: number;
  organizationName: string;
  roleId: number;
  roleName: string;
  isSuperAdmin: boolean;
  /** organization_members.id del usuario en la org activa (bigint) */
  memberId: number | null;
  supabase: SupabaseClient;
}

export const ORG_HEADER = 'x-organization-id';
export const ORG_COOKIE = 'goadmin_org_id';
/**
 * Cookie que escribe el cliente desde antes de que existiera `goadmin_org_id`
 * y que sigue leyendo `src/middleware.ts` para el gating de plan y módulos.
 * Ambas las escribe `guardarOrganizacionActiva` con el mismo id; se acepta
 * como respaldo para los navegadores que todavía no han ejecutado la versión
 * nueva del cliente. Como cualquier valor que venga del navegador, la
 * organización resultante se valida contra `organization_members` (403 si el
 * usuario no es miembro activo).
 */
export const ORG_COOKIE_LEGACY = 'org_id';

interface MembershipRow {
  id: number;
  organization_id: number;
  is_super_admin: boolean | null;
  role_id: number;
  organizations: { name: string } | { name: string }[] | null;
  roles: { name: string } | { name: string }[] | null;
}

const MEMBERSHIP_SELECT = `
  id,
  organization_id,
  is_super_admin,
  role_id,
  organizations(name),
  roles!inner(name)
`;

function firstName(rel: MembershipRow['organizations']): string {
  if (!rel) return '';
  return Array.isArray(rel) ? rel[0]?.name ?? '' : rel.name ?? '';
}

function parseOrgId(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lee la org solicitada del header o la cookie. `req` es opcional: sin él se
 * usa `headers()`/`cookies()` de next/headers.
 *
 * F0-SEC r2: si el header y la cookie traen organizaciones DISTINTAS no se
 * elige una (antes ganaba el header en silencio): es una petición incoherente
 * —dos pestañas con organizaciones distintas, un cliente mal cableado o un
 * intento de colar una organización por el header— y se responde 403
 * `ORG_AMBIGUOUS` dejando rastro. La cookie legacy `org_id` solo se compara
 * cuando no existe `goadmin_org_id` (las dos las escribe el mismo cliente con
 * el mismo valor).
 */
async function getRequestedOrgId(req?: Request, userId?: string): Promise<number | null> {
  let headerValue: string | null = null;
  if (req) {
    headerValue = req.headers.get(ORG_HEADER);
  } else {
    try {
      const h = await headers();
      headerValue = h.get(ORG_HEADER);
    } catch {
      headerValue = null;
    }
  }
  const fromHeader = parseOrgId(headerValue);

  let fromCookie: number | null = null;
  try {
    const cookieStore = await cookies();
    fromCookie =
      parseOrgId(cookieStore.get(ORG_COOKIE)?.value) ??
      parseOrgId(cookieStore.get(ORG_COOKIE_LEGACY)?.value);
  } catch {
    fromCookie = null;
  }

  if (fromHeader && fromCookie && fromHeader !== fromCookie) {
    console.warn('[orgContext] header y cookie declaran organizaciones distintas', {
      header: fromHeader,
      cookie: fromCookie,
      userId: userId ?? null,
      path: safePath(req),
    });
    throw new OrgContextError(
      'La organización del header y la de la cookie no coinciden',
      403,
      'ORG_AMBIGUOUS'
    );
  }

  return fromHeader ?? fromCookie;
}

function safePath(req?: Request): string | null {
  if (!req) return null;
  try {
    return new URL(req.url).pathname;
  } catch {
    return null;
  }
}

function buildContext(
  user: { id: string; email?: string | null },
  m: MembershipRow,
  supabase: SupabaseClient
): ServerOrgContext {
  return {
    userId: user.id,
    userEmail: user.email ?? null,
    organizationId: m.organization_id,
    organizationName: firstName(m.organizations),
    roleId: m.role_id,
    roleName: firstName(m.roles),
    isSuperAdmin: m.is_super_admin ?? false,
    memberId: m.id ?? null,
    supabase,
  };
}

type SessionUser = { id: string; email?: string | null };

/** Usuario de la sesión (cookies) o 401. */
async function requireSessionUser(supabase: SupabaseClient): Promise<SessionUser> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  }
  return user;
}

/** Membresía ACTIVA del usuario en una organización concreta, o 403. */
async function contextForOrg(
  supabase: SupabaseClient,
  user: SessionUser,
  organizationId: number
): Promise<ServerOrgContext> {
  const { data, error } = await supabase
    .from('organization_members')
    .select(MEMBERSHIP_SELECT)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) {
    throw new OrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN');
  }
  return buildContext(user, data as unknown as MembershipRow, supabase);
}

/**
 * Contexto para una organización que NO viene de la petición sino de un
 * recurso ya resuelto en el servidor (p. ej. la fila de `invitations` que
 * identifica un código de invitación).
 *
 * Es el mismo criterio que `getServerOrgContext` —sesión + membresía activa,
 * 401/403— pero sin pasar por header, cookie ni `last_org_id`: ahí la org es
 * un dato del recurso, no una preferencia del usuario, así que dejarla a la
 * resolución por defecto daría 403 (o `ORG_AMBIGUOUS`) a un admin legítimo
 * cuya org activa fuese otra.
 */
export async function getServerOrgContextFor(organizationId: number): Promise<ServerOrgContext> {
  const supabase = await getServerUserClient();
  const user = await requireSessionUser(supabase);
  return contextForOrg(supabase, user, organizationId);
}

export async function getServerOrgContext(req?: Request): Promise<ServerOrgContext> {
  const supabase = await getServerUserClient();

  const user = await requireSessionUser(supabase);

  const membershipQuery = () =>
    supabase
      .from('organization_members')
      .select(MEMBERSHIP_SELECT)
      .eq('user_id', user.id)
      .eq('is_active', true);

  // 1-2. Header / cookie
  const requested = await getRequestedOrgId(req, user.id);
  if (requested) {
    return contextForOrg(supabase, user, requested);
  }

  // 3. profiles.last_org_id (consulta directa por organization_id, sin limit)
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_org_id')
    .eq('id', user.id)
    .maybeSingle();
  const lastOrgId = parseOrgId((profile as { last_org_id?: number | string | null } | null)?.last_org_id?.toString());
  if (lastOrgId) {
    const { data } = await membershipQuery().eq('organization_id', lastOrgId).maybeSingle();
    if (data) return buildContext(user, data as unknown as MembershipRow, supabase);
  }

  // 4. Única membresía activa
  const { data: rows, error: memberError } = await membershipQuery().order('created_at', { ascending: true }).limit(2);
  if (memberError || !rows || rows.length === 0) {
    throw new OrgContextError('El usuario no pertenece a ninguna organización', 403, 'NO_MEMBERSHIP');
  }
  if (rows.length === 1) {
    return buildContext(user, rows[0] as unknown as MembershipRow, supabase);
  }

  // 5. Ambiguo
  throw new OrgContextError(
    'Indica la organización activa (header X-Organization-Id o cookie goadmin_org_id)',
    400,
    'ORG_AMBIGUOUS'
  );
}

// ─── Admin ───────────────────────────────────────────────────────────────────

/**
 * Criterio de admin del repo (ver `src/lib/utils/rbac.ts` y `branchService.ts`):
 * `organization_members.is_super_admin` o role_id 1 / 2. Nunca por el nombre
 * del rol (regla dura 6).
 *
 * La regla vive en `orgAdmin.ts` (módulo hoja, sin dependencias) para que un
 * módulo ligero pueda usarla sin arrastrar este archivo entero —y con él
 * `webhookSignatures` → `svix`, que es ESM puro y rompe Jest. Aquí solo se
 * re-exporta: sigue habiendo UNA definición.
 */
export { ORG_ADMIN_ROLE_IDS, ORG_ADMIN_PERMISSION_CODE } from './orgAdmin';

export function isOrgAdminContext(ctx: ServerOrgContext): boolean {
  return isOrgAdminLike(ctx);
}

/** Lanza OrgContextError(403) si el usuario no es admin de la org activa (síncrono: super admin o rol 1/2). */
export function requireOrgAdmin(ctx: ServerOrgContext): void {
  if (!isOrgAdminContext(ctx)) {
    throw new OrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
  }
}

type PermissionSubject = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/**
 * ¿Tiene `code` (por defecto `admin.full_access`) en la organización activa?
 * Primero el criterio síncrono (super admin o rol 1/2, sin consulta); si no,
 * `check_user_permission(user, org, code)` —rol + cargo, con precedencia del
 * cargo— con el usuario y la organización DE LA SESIÓN, nunca del cliente.
 * Un error de la RPC cuenta como "no" (fail-closed) y se registra.
 */
export async function hasOrgAdminOrPermission(ctx: PermissionSubject, code: string = ORG_ADMIN_PERMISSION_CODE): Promise<boolean> {
  if (isOrgAdminLike(ctx)) return true;
  if (!code || !ctx.userId || !ctx.organizationId) return false;
  const { data, error } = await ctx.supabase.rpc('check_user_permission', {
    p_user_id: ctx.userId,
    p_organization_id: ctx.organizationId,
    p_permission_code: code,
  });
  if (error) {
    console.warn('[orgContext] check_user_permission falló; se deniega', { code, organizationId: ctx.organizationId, message: error.message });
    return false;
  }
  return data === true;
}

/** Como `requireOrgAdmin`, pero los cargos/roles con el permiso también pasan. */
export async function requireOrgAdminOrPermission(ctx: PermissionSubject, code: string = ORG_ADMIN_PERMISSION_CODE): Promise<void> {
  if (!(await hasOrgAdminOrPermission(ctx, code))) {
    throw new OrgContextError('Requiere rol de administrador de la organización', 403, 'ADMIN_REQUIRED');
  }
}

// ─── Webhooks: resolver org desde identificador persistido ──────────────────

export type ExternalIdentifierKind =
  | 'phone'
  | 'call_sid'
  | 'domain'
  | 'message_id'
  | 'channel_id'
  | 'account_sid'
  | 'bridge_id'
  | 'voice_agent_call_id';

const EXTERNAL_TABLE_MAP: Record<ExternalIdentifierKind, { table: string; column: string }> = {
  phone: { table: 'phone_numbers', column: 'e164' },
  call_sid: { table: 'calls', column: 'provider_call_sid' },
  domain: { table: 'email_domains', column: 'domain' },
  message_id: { table: 'email_messages', column: 'provider_message_id' },
  channel_id: { table: 'channels', column: 'id' },
  account_sid: { table: 'comm_settings', column: 'twilio_subaccount_sid' },
  bridge_id: { table: 'mobile_call_bridges', column: 'id' },
  voice_agent_call_id: { table: 'voice_agent_calls', column: 'id' },
};

/**
 * Resuelve la organización a partir de un identificador persistido
 * (número, CallSid, dominio, etc.). Usa el cliente service-role.
 * Nunca hace fallback a "primera org activa".
 */
export async function resolveOrgFromExternal(
  identifier: string,
  identifierType: ExternalIdentifierKind
): Promise<{ organizationId: number; serviceClient: SupabaseClient }> {
  const serviceClient = getServiceClient();
  const { table, column } = EXTERNAL_TABLE_MAP[identifierType];

  if (!identifier) {
    throw new OrgContextError(`Identificador vacío para ${identifierType}`, 404, 'ORG_UNRESOLVED');
  }

  // F0-SEC r2: `phone_numbers.e164` y `email_domains.domain` son únicos POR
  // organización, no globalmente. Con `.limit(1).maybeSingle()` la organización
  // resuelta era arbitraria si dos registraban el mismo valor. Se piden 2 filas:
  // si vuelven 2 → 409 `ORG_AMBIGUOUS` y registro. La unicidad global (índice)
  // la decide la fase dueña de cada tabla (F3 teléfonos, F7 dominios).
  const { data, error } = await serviceClient
    .from(table)
    .select('organization_id')
    .eq(column, identifier)
    .limit(2);

  const rows = (data as Array<{ organization_id?: number }> | null) ?? [];
  const distinct = Array.from(new Set(rows.map((r) => r.organization_id).filter((id): id is number => typeof id === 'number' && id > 0)));
  if (error || distinct.length === 0) {
    throw new OrgContextError(
      `No se pudo resolver la organización desde ${identifierType}`,
      404,
      'ORG_UNRESOLVED'
    );
  }
  if (distinct.length > 1) {
    console.warn('[orgContext] identificador externo resuelve a varias organizaciones', {
      identifierType,
      identifier: String(identifier).slice(0, 64),
      organizations: distinct,
    });
    throw new OrgContextError(
      `El identificador ${identifierType} pertenece a más de una organización`,
      409,
      'ORG_AMBIGUOUS'
    );
  }

  return { organizationId: distinct[0], serviceClient };
}

// ─── Wrappers para route handlers ───────────────────────────────────────────

export function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: message ?? code, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Debe aceptar el `RouteContext` que Next genera para los handlers (`params`
// puede traer string | string[] | undefined en segmentos catch-all): si el tipo
// es más estrecho, el chequeo de tipos de `next build` (.next/types) falla.
// El segundo argumento del handler exportado debe ser OBLIGATORIO y sin `undefined`:
// Next infiere `SecondArg` con `[any, infer T]` y un parámetro opcional lo convierte
// en `T | undefined`, que no satisface `RouteContext`.
type RouteParams = { params: Promise<Record<string, string | string[] | undefined>> };

export type OrgRouteHandler = (
  ctx: ServerOrgContext,
  req: Request,
  routeParams?: RouteParams
) => Promise<Response>;

/**
 * Envuelve un handler exigiendo sesión + org activa. Convierte
 * `OrgContextError` en 401/403/400 JSON. `opts.admin` exige admin
 * (`requireOrgAdminOrPermission`: super admin, rol 1/2 o el permiso
 * `admin.full_access` por rol/cargo).
 */
export function withOrg(handler: OrgRouteHandler, opts?: { admin?: boolean }) {
  return async (req: Request, routeParams: RouteParams): Promise<Response> => {
    try {
      const ctx = await getServerOrgContext(req);
      if (opts?.admin) await requireOrgAdminOrPermission(ctx);
      return await handler(ctx, req, routeParams);
    } catch (err) {
      if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code, err.message);
      throw err;
    }
  };
}

export type CronRouteHandler = (req: Request, routeParams?: RouteParams) => Promise<Response>;

/**
 * Envuelve un handler exigiendo `Authorization: Bearer ${CRON_SECRET}`
 * (fail-closed: sin CRON_SECRET => 401).
 */
export function withCron(handler: CronRouteHandler) {
  return async (req: Request, routeParams: RouteParams): Promise<Response> => {
    try {
      verifyCronSecret(req);
    } catch (err) {
      if (err instanceof WebhookError) return jsonError(err.statusCode, err.code);
      throw err;
    }
    return handler(req, routeParams);
  };
}
