/**
 * Contexto de organización para el servidor (route handlers / server actions).
 *
 * - `getServerOrgContext(req?)`: sesión del usuario (cookies) + organización
 *   activa. Orden de resolución de la org:
 *     1. header `X-Organization-Id`
 *     2. cookie `goadmin_org_id`
 *     3. `profiles.last_org_id`
 *     4. si el usuario tiene EXACTAMENTE una membresía activa, esa
 *     5. si no → 400 `ORG_AMBIGUOUS`
 *   En todos los casos se verifica que el usuario sea miembro activo de la org
 *   elegida (403 si no).
 * - `resolveOrgFromExternal(identifier, kind)`: para webhooks (sin sesión);
 *   usa el cliente service-role y `.maybeSingle()`.
 * - `requireOrgAdmin(ctx)`: mismo criterio que `src/lib/utils/rbac.ts`
 *   (`isOrgAdmin`: roleName 'Super Admin' | 'Admin de organización' o role_id 1|2,
 *   además de `organization_members.is_super_admin`).
 * - `withOrg(handler)` / `withCron(handler)`: wrappers para route handlers.
 */

import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';
import { isOrgAdminLike } from './orgAdmin';

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

export class OrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? (statusCode === 401 ? 'UNAUTHENTICATED' : statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST');
    this.name = 'OrgContextError';
  }
}

export const ORG_HEADER = 'x-organization-id';
export const ORG_COOKIE = 'goadmin_org_id';

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
 */
async function getRequestedOrgId(req?: Request): Promise<number | null> {
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
  if (fromHeader) return fromHeader;

  try {
    const cookieStore = await cookies();
    return parseOrgId(cookieStore.get(ORG_COOKIE)?.value);
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

export async function getServerOrgContext(req?: Request): Promise<ServerOrgContext> {
  const supabase = await getServerUserClient();

  const { data: { user }, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !user) {
    throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  }

  const membershipQuery = () =>
    supabase
      .from('organization_members')
      .select(MEMBERSHIP_SELECT)
      .eq('user_id', user.id)
      .eq('is_active', true);

  // 1-2. Header / cookie
  const requested = await getRequestedOrgId(req);
  if (requested) {
    const { data, error } = await membershipQuery().eq('organization_id', requested).maybeSingle();
    if (error || !data) {
      throw new OrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN');
    }
    return buildContext(user, data as unknown as MembershipRow, supabase);
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
 * Criterio de admin del repo (ver `src/lib/utils/rbac.ts` y `branchService.ts:111-119`):
 * `organization_members.is_super_admin`, o rol 'Super Admin' / 'Admin de organización'
 * (role_id 1 / 2).
 *
 * La regla vive en `orgAdmin.ts` (módulo hoja, sin dependencias) para que un
 * módulo ligero pueda usarla sin arrastrar este archivo entero —y con él
 * `webhookSignatures` → `svix`, que es ESM puro y rompe Jest. Aquí solo se
 * re-exporta: sigue habiendo UNA definición.
 */
export { ORG_ADMIN_ROLE_IDS, ORG_ADMIN_ROLE_NAMES } from './orgAdmin';

export function isOrgAdminContext(ctx: ServerOrgContext): boolean {
  return isOrgAdminLike(ctx);
}

/** Lanza OrgContextError(403) si el usuario no es admin de la org activa. */
export function requireOrgAdmin(ctx: ServerOrgContext): void {
  if (!isOrgAdminContext(ctx)) {
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

  const { data, error } = await serviceClient
    .from(table)
    .select('organization_id')
    .eq(column, identifier)
    .limit(1)
    .maybeSingle();

  const organizationId = (data as { organization_id?: number } | null)?.organization_id;
  if (error || !organizationId) {
    throw new OrgContextError(
      `No se pudo resolver la organización desde ${identifierType}`,
      404,
      'ORG_UNRESOLVED'
    );
  }

  return { organizationId, serviceClient };
}

// ─── Wrappers para route handlers ───────────────────────────────────────────

export function jsonError(status: number, code: string, message?: string): Response {
  return new Response(JSON.stringify({ error: message ?? code, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type RouteParams = { params: Promise<Record<string, string>> } | undefined;

export type OrgRouteHandler = (
  ctx: ServerOrgContext,
  req: Request,
  routeParams?: RouteParams
) => Promise<Response>;

/**
 * Envuelve un handler exigiendo sesión + org activa. Convierte
 * `OrgContextError` en 401/403/400 JSON. `opts.admin` exige rol admin.
 */
export function withOrg(handler: OrgRouteHandler, opts?: { admin?: boolean }) {
  return async (req: Request, routeParams?: RouteParams): Promise<Response> => {
    try {
      const ctx = await getServerOrgContext(req);
      if (opts?.admin) requireOrgAdmin(ctx);
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
  return async (req: Request, routeParams?: RouteParams): Promise<Response> => {
    try {
      verifyCronSecret(req);
    } catch (err) {
      if (err instanceof WebhookError) return jsonError(err.statusCode, err.code);
      throw err;
    }
    return handler(req, routeParams);
  };
}
