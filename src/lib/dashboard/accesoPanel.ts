/**
 * Quién ve el panel completo del inicio (el que incluye finanzas) y quién ve
 * el panel de empleado.
 *
 * PASO 1 (2026-09-22): esta decisión vivía en
 * `src/lib/services/crm/stagePermissions.ts` —una lista creada para gobernar
 * quién puede saltarse el control de etapas de las OPORTUNIDADES del CRM— y el
 * inicio la importaba. Con eso, añadir un rol a esa lista para que pudiera
 * aprobar oportunidades le daba, sin que nadie lo supiera, acceso a la caja y
 * a la utilidad de la organización. La regla del inicio es ahora suya y vive
 * aquí; el CRM conserva la suya, intacta.
 *
 * PASO 2 (pendiente): sustituir esta lista por un permiso resuelto en el
 * servidor («ver finanzas de la organización»), que pueda venir del cargo
 * (`organization_members.job_position_id`) o del rol. No se hace hoy porque de
 * 138 miembros activos solo 20 tienen cargo asignado: aplicarlo ahora dejaría
 * a 118 personas sin criterio. El cargo se irá poblando al volverse
 * obligatorio en la invitación, junto con la sucursal.
 *
 * Regla 6 de CLAUDE.md: los permisos nunca se resuelven por el NOMBRE de un
 * rol. Esta lista es de identificadores, y el paso 2 la sustituye por un
 * permiso real.
 */

/** Roles que ven el panel completo: Super Admin (1), Admin de organización (2), Manager (5). */
export const ROLES_PANEL_COMPLETO: readonly number[] = [1, 2, 5];

export interface ContextoPanel {
  roleId: number;
  isSuperAdmin?: boolean;
}

/** ¿Esta persona ve el panel con datos financieros? */
export function veePanelCompleto(ctx: ContextoPanel | null | undefined): boolean {
  if (!ctx) return false;
  return ctx.isSuperAdmin === true || ROLES_PANEL_COMPLETO.includes(ctx.roleId);
}
