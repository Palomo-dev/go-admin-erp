/**
 * Utilidades de SERVIDOR para las rutas del channel manager
 * (`/api/integrations/booking/*` y `/api/integrations/expedia/*`).
 *
 * - `connectionBelongsToOrg(ctx, connectionId)`: la conexión existe y es de la
 *   organización de la sesión (`integration_connections.organization_id`).
 *   Se consulta con el cliente de sesión, así que RLS también filtra. Si no,
 *   la ruta responde 404 (no se revela si existe en otra organización).
 * - `channelManagerClientsFor(ctx)`: los clientes que reciben los servicios.
 *   El service-role se crea de forma perezosa y solo lo usan las consultas a
 *   `integration_credentials`; llamar a esto después de la comprobación de
 *   pertenencia.
 *
 * Nunca importar desde código de cliente (usa `getServiceClient`).
 */

import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ChannelManagerClients } from './channelManagerClients';

type OrgScope = Pick<ServerOrgContext, 'supabase' | 'organizationId' | 'userId'>;

/** `true` si `connectionId` es una conexión de la organización de la sesión. */
export async function connectionBelongsToOrg(ctx: OrgScope, connectionId: unknown): Promise<boolean> {
  if (typeof connectionId !== 'string' || connectionId.trim() === '') return false;
  const { data, error } = await ctx.supabase
    .from('integration_connections')
    .select('id')
    .eq('id', connectionId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) {
    console.warn('[channelManager] conexión inexistente o de otra organización', {
      connectionId: String(connectionId).slice(0, 64),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      error: error?.message ?? null,
    });
    return false;
  }
  return true;
}

/** Clientes para los servicios: sesión para el dominio, service-role solo para credenciales. */
export function channelManagerClientsFor(ctx: Pick<ServerOrgContext, 'supabase'>): ChannelManagerClients {
  return {
    db: ctx.supabase,
    secrets: () => getServiceClient(),
  };
}

/** Cuerpo JSON uniforme para una conexión que no es de la organización. */
export const CONNECTION_NOT_FOUND = { error: 'Conexión no encontrada', code: 'CONNECTION_NOT_FOUND' } as const;
