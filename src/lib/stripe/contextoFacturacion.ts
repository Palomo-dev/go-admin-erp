/**
 * Puerta de las rutas de facturación del SaaS (Stripe): sesión verificada,
 * membresía ACTIVA en la organización y permiso de facturación resuelto en el
 * servidor. GO-sec, auditoría 2026-09-24.
 *
 * Por qué no basta el middleware: `/api/stripe/` está excluido de él (el
 * webhook de Stripe llega sin cookie), así que cada ruta se defiende sola. Y
 * las de `/api/subscriptions/` pasaban el middleware pero luego tomaban la
 * organización del body sin comprobar pertenencia (portal de facturación y
 * métodos de pago de cualquier organización).
 *
 * La organización llega en el body porque el cliente factura una organización
 * concreta (el asistente de alta crea una organización nueva y paga por ella
 * sin que sea todavía la activa). Por eso NO se usa como dato de confianza: se
 * resuelve con `getServerOrgContextFor`, que exige sesión (401) y membresía
 * activa del usuario de la sesión en ESA organización (403). Es el mismo
 * criterio que `create-checkout-session`.
 *
 * Permiso (regla dura 6): admin de la organización (super admin, rol 1/2 o
 * `admin.full_access`) o el permiso `billing_management`, resuelto con
 * `hasOrgAdminOrPermission` (que consulta `check_user_permission` en la base con
 * el usuario y la organización de la sesión). Nunca por el nombre del rol.
 */

import {
  getServerOrgContextFor,
  hasOrgAdminOrPermission,
  OrgContextError,
  type ServerOrgContext,
} from '@/lib/utils/orgContext';

/** Permiso de facturación que existe en `permissions` (verificado 2026-09-24). */
export const PERMISO_FACTURACION = 'billing_management';

/** Id de organización positivo o 400 `ORG_ID_INVALIDO`. */
export function idDeOrganizacion(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number.parseInt(String(valor ?? ''), 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new OrgContextError('organizationId inválido', 400, 'ORG_ID_INVALIDO');
  }
  return n;
}

/**
 * Sesión + membresía activa en `organizationId` + admin o `billing_management`.
 * 400 si el id no es válido, 401 sin sesión, 403 sin membresía o sin permiso.
 */
export async function contextoDeFacturacion(organizationId: unknown, ruta: string): Promise<ServerOrgContext> {
  const orgId = idDeOrganizacion(organizationId);
  const ctx = await getServerOrgContextFor(orgId);
  await exigirPermisoDeFacturacion(ctx, ruta);
  return ctx;
}

/** 403 `BILLING_PERMISSION_REQUIRED` si el usuario de `ctx` no es admin ni tiene `billing_management`. */
export async function exigirPermisoDeFacturacion(ctx: ServerOrgContext, ruta: string): Promise<void> {
  if (!(await hasOrgAdminOrPermission(ctx, PERMISO_FACTURACION))) {
    console.warn('[facturacion] permiso de facturación faltante → 403', {
      ruta,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    throw new OrgContextError('Requiere permiso de facturación de la organización', 403, 'BILLING_PERMISSION_REQUIRED');
  }
}
