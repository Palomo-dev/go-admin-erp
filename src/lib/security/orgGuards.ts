/**
 * Guardas de ruta para las integraciones con credenciales de la plataforma
 * (Open Finance, PayFac, Factus): permiso resuelto en el servidor, pertenencia
 * de un recurso a la organización de la sesión y respuesta de error uniforme.
 *
 * Regla dura 5: la organización es SIEMPRE `ctx.organizationId` (sesión). Un id
 * de recurso que llega en la URL o en el body se comprueba contra ella antes de
 * pasárselo a un servicio que trabaje con service role o con la llave de la
 * plataforma; si no es de la organización, 404 (no se distingue «no existe» de
 * «es de otro», para no filtrar la existencia ajena).
 *
 * Regla dura 6: el permiso se resuelve con `hasOrgAdminOrPermission` (super
 * admin o rol 1/2, o `check_user_permission` en la base con el usuario y la
 * organización de la sesión). Nunca por el nombre del rol.
 */

import { hasOrgAdminOrPermission, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';

/** Permisos financieros que existen en `permissions` (verificado 2026-09-23). */
export const PERMISOS_FINANZAS = {
  VER: 'finance.view',
  CREAR: 'finance.create',
  APROBAR: 'finance.approve',
  ANULAR: 'finance.void',
} as const;

export type PermisoFinanzas = (typeof PERMISOS_FINANZAS)[keyof typeof PERMISOS_FINANZAS];

type SujetoPermiso = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/** 403 `PERMISSION_REQUIRED` si el usuario de la sesión no tiene `codigo` en su organización. */
export async function requireOrgPermission(ctx: SujetoPermiso, codigo: PermisoFinanzas, ruta?: string): Promise<void> {
  if (await hasOrgAdminOrPermission(ctx, codigo)) return;
  console.warn('[orgGuards] permiso faltante → 403', {
    ruta: ruta ?? null,
    permiso: codigo,
    organizationId: ctx.organizationId,
    userId: ctx.userId,
  });
  throw new OrgContextError(`Requiere el permiso ${codigo}`, 403, 'PERMISSION_REQUIRED');
}

/**
 * 404 `NOT_FOUND` si la fila `id` de `tabla` no es de la organización de la
 * sesión. Consulta con el cliente de la sesión (RLS) Y filtra por
 * `organization_id`: las dos cosas, para no depender de que la política de la
 * tabla esté bien. Un id mal formado (uuid inválido) también es 404.
 */
export async function assertRecordOfOrg(
  ctx: Pick<ServerOrgContext, 'organizationId' | 'supabase'>,
  tabla: string,
  id: string | number | null | undefined,
  mensaje = 'Recurso no encontrado',
): Promise<void> {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new OrgContextError(mensaje, 404, 'NOT_FOUND');
  }
  const { data, error } = await ctx.supabase
    .from(tabla)
    .select('id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error || !data) throw new OrgContextError(mensaje, 404, 'NOT_FOUND');
}

/**
 * Respuesta de error de un handler: `OrgContextError` con su estado; cualquier
 * otro error se registra (solo el mensaje, nunca el body) y sale como 500
 * genérico, sin filtrar mensajes internos del proveedor o de la base.
 */
export function routeErrorResponse(etiqueta: string, err: unknown): Response {
  if (err instanceof OrgContextError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.error(`[${etiqueta}] Error:`, err instanceof Error ? err.message : String(err));
  return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 501 fail-closed para un flujo que no puede asegurarse sin rediseño. Se
 * responde DESPUÉS de sesión, organización y permiso (así un 501 nunca le dice
 * nada a quien no está autorizado) y sin tocar al proveedor.
 */
export function flujoDeshabilitado(motivo: string): Response {
  return new Response(JSON.stringify({ error: motivo, code: 'NOT_IMPLEMENTED' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
}
