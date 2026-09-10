/**
 * Permisos de escritura sobre etapas del pipeline (FASE-09 §7).
 *
 * Módulo puro (sin `next/headers` ni Supabase) para que las rutas y los tests lo
 * usen igual. Recibe solo los campos de rol de `ServerOrgContext`.
 *
 * ── F9-36 · quién puede saltarse un gate ────────────────────────────────────
 * La ronda 2 exigía `requireOrgAdmin` (roles 1 y 2). En la BD, hoy
 * (verificado por MCP el 2026-09-09) eso deja fuera a **35 miembros activos**
 * con rol `Empleado` (4) o `Manager` (5) — incluido el único perfil comercial
 * que tiene sentido que pueda saltarse un gate con justificación. Saltarse un
 * gate no es un cambio de configuración de la organización: es una excepción
 * comercial **auditada** (queda en `metadata.gate_overrides[]` con autor, etapa
 * origen/destino, criterios que faltaban y motivo).
 *
 * Criterio: `Super Admin` (1), `Admin de organización` (2) y `Manager` (5), o
 * `organization_members.is_super_admin`. `Empleado` (4) y `Cliente` (3) NO:
 * para ellos el gate sigue siendo bloqueante y deben pedirlo a su responsable.
 *
 * ── F9-41 · quién puede tocar `stages` ──────────────────────────────────────
 * Desde que `stages.is_won` decide cierres y comisiones, marcar una etapa como
 * ganadora tiene consecuencias contables. La escritura pasa por
 * `/api/crm/stages/**` con este mismo criterio (jefatura, no cualquier miembro),
 * y en la BD hay un trigger que rechaza el cambio de `is_won`/`is_lost` hecho
 * por quien no cumpla — la interfaz no es la única barrera.
 */

/** Campos de rol que necesita la política (subconjunto de ServerOrgContext). */
export interface StageRoleContext {
  roleId: number;
  roleName: string;
  isSuperAdmin?: boolean;
}

export const STAGE_MANAGER_ROLE_IDS: readonly number[] = [1, 2, 5];
export const STAGE_MANAGER_ROLE_NAMES: readonly string[] = ['Super Admin', 'Admin de organización', 'Manager'];

function isStageManager(ctx: StageRoleContext): boolean {
  return (
    ctx.isSuperAdmin === true ||
    STAGE_MANAGER_ROLE_NAMES.includes(ctx.roleName) ||
    STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId)
  );
}

/** ¿Puede saltarse el gate de etapa (`override`)? (F9-36) */
export function canOverrideStageGate(ctx: StageRoleContext): boolean {
  return isStageManager(ctx);
}

/** ¿Puede crear/editar/borrar/reordenar etapas? (F9-41) */
export function canManageStages(ctx: StageRoleContext): boolean {
  return isStageManager(ctx);
}

/** Mensaje 403 uniforme para ambas comprobaciones. */
export const STAGE_MANAGER_REQUIRED =
  'Requiere rol de administrador de la organización o jefatura comercial (Manager)';
