/**
 * Utilidades de SERVIDOR para las rutas de Meta Marketing y TikTok Marketing
 * (`/api/integrations/{meta,tiktok}/{setup,catalog-sync,product-sync,oauth/*}`).
 *
 * - `marketingConnectionInOrg(scope, connectionId, connector)`: la conexión
 *   existe, es de la organización `scope.organizationId` y es del conector
 *   esperado (`meta_marketing` / `tiktok_marketing`). Con el cliente de sesión
 *   (rutas) RLS también filtra; con el de servicio (callback OAuth, sin
 *   sesión) la organización ya salió de un `state` firmado. Si no, la ruta
 *   responde 404 `CONNECTION_NOT_FOUND`, sin revelar si existe en otra
 *   organización. Mismo contrato que `connectionBelongsToOrg` del channel
 *   manager, más el conector: un id de conexión de Meta no sirve en TikTok.
 * - `resolveOrgStoreDomain(db, organizationId)`: dominio público de la tienda
 *   (dominio primario activo o `<subdominio>.goadmin.io`). Lo calcula el
 *   servidor: el cliente ya no lo manda.
 * - `oauthInitiatorIsOrgAdmin(service, organizationId, userId)`: en el
 *   callback OAuth (sin sesión), el usuario que firmó el `state` sigue siendo
 *   miembro activo y admin de la organización (mismo criterio que
 *   `withOrg({ admin: true })`: `hasOrgAdminOrPermission`, nunca por nombre).
 *
 * Nunca importar desde código de cliente.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';

export type MarketingConnectorCode = 'meta_marketing' | 'tiktok_marketing' | 'google_ads';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `true` si `value` tiene forma de uuid (evita mandar basura a Postgres y un 22P02 como 500). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

interface ConnectionScope {
  supabase: SupabaseClient;
  organizationId: number;
  userId?: string | null;
}

/** `true` si `connectionId` es una conexión `connector` de la organización del ámbito. */
export async function marketingConnectionInOrg(
  scope: ConnectionScope,
  connectionId: unknown,
  connector: MarketingConnectorCode,
  route?: string
): Promise<boolean> {
  const reject = (motivo: string, error?: string | null) => {
    console.warn('[integrations/marketing] conexión rechazada', {
      route: route ?? null,
      motivo,
      connectionId: String(connectionId ?? '').slice(0, 64),
      organizationId: scope.organizationId,
      userId: scope.userId ?? null,
      error: error ?? null,
    });
    return false;
  };
  if (!isUuid(connectionId)) return reject('id_invalido');
  const { data, error } = await scope.supabase
    .from('integration_connections')
    .select('id, organization_id, integration_connectors!inner(code)')
    .eq('id', connectionId)
    .eq('organization_id', scope.organizationId)
    .maybeSingle();
  if (error || !data) return reject('inexistente_o_de_otra_organizacion', error?.message);
  const row = data as { organization_id?: number; integration_connectors?: { code?: string } | Array<{ code?: string }> | null };
  // Defensa en profundidad: aunque el filtro ya lo exige, un doble o una vista mal hecha no cuela otra organización.
  if (row.organization_id !== scope.organizationId) return reject('inexistente_o_de_otra_organizacion');
  const rel = row.integration_connectors;
  const code = Array.isArray(rel) ? rel[0]?.code : rel?.code;
  if (code !== connector) return reject('conector_distinto');
  return true;
}

/**
 * Moneda pedida en el body: `null` si no viene (la ruta usa la base de la
 * organización, `resolveOrgCurrency`), el código ISO 4217 si es válido, o
 * `false` si viene con otra forma (la ruta responde 400).
 */
export function requestedCurrency(value: unknown): string | null | false {
  if (value == null || value === '') return null;
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : false;
}

/** Dominio público de la tienda de la organización (primario activo o `<subdominio>.goadmin.io`). */
export async function resolveOrgStoreDomain(db: SupabaseClient, organizationId: number): Promise<string> {
  const { data: domainData } = await db
    .from('organization_domains')
    .select('host')
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .eq('is_active', true)
    .maybeSingle();
  const host = (domainData as { host?: string | null } | null)?.host;
  if (host) return host;
  const { data: orgData } = await db.from('organizations').select('subdomain').eq('id', organizationId).maybeSingle();
  return `${(orgData as { subdomain?: string | null } | null)?.subdomain || 'shop'}.goadmin.io`;
}

/**
 * ¿El usuario que firmó el `state` sigue siendo miembro ACTIVO y admin de la
 * organización? Para el callback OAuth, que no tiene sesión: el `state`
 * firmado prueba quién inició, esto prueba que todavía puede hacerlo.
 */
export async function oauthInitiatorIsOrgAdmin(service: SupabaseClient, organizationId: number, userId: string): Promise<boolean> {
  const { data, error } = await service
    .from('organization_members')
    .select('id, role_id, is_super_admin')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return false;
  const m = data as { role_id: number; is_super_admin: boolean | null };
  return hasOrgAdminOrPermission({
    userId,
    organizationId,
    roleId: m.role_id,
    isSuperAdmin: m.is_super_admin === true,
    supabase: service,
  });
}
