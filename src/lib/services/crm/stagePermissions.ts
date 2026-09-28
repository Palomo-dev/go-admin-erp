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

/**
 * Solo para textos y mensajes. **Nunca** para decidir: ver `isStageManager`.
 */
export const STAGE_MANAGER_ROLE_NAMES: readonly string[] = ['Super Admin', 'Admin de organización', 'Manager'];

/**
 * El permiso se resuelve por **identificador de rol**, nunca por su nombre
 * (regla dura 6 de CLAUDE.md). El nombre es un texto editable y ni siquiera
 * identifica: hoy los roles son globales (`roles`: 1 Super Admin, 2 Admin de
 * organización, 3 Cliente, 4 Empleado, 5 Manager; verificado por MCP el
 * 2026-09-23), pero en cuanto exista un rol nuevo llamado «Manager» con otro
 * id, comparar por nombre le regalaría el permiso de jefatura comercial.
 *
 * `roleId` e `isSuperAdmin` salen de `getServerOrgContext`, que los lee de
 * `organization_members` del usuario de la sesión; ninguno viene del cliente.
 *
 * PENDIENTE (requiere cambio de datos, no se aplica desde aquí): el catálogo
 * `permissions` no tiene ningún código para etapas ni pipelines — solo
 * `crm.customers.*`, `crm.contacts.*`, `crm.leads.*` y `crm.jobs.*`
 * (verificado por MCP). Mientras no existan `crm.stages.manage` y
 * `crm.stages.override_gate` en `permissions` + `role_permissions`, la lista
 * de ids es el criterio de servidor que ya comparten seis módulos
 * (`commissionTransitions`, `f10RouteHelpers`, `f12RouteSupport`,
 * `sellerDashboardModel`, y las rutas de `stages` y de gate). El SQL propuesto
 * está en el informe de esta ronda.
 */
function isStageManager(ctx: StageRoleContext): boolean {
  return ctx.isSuperAdmin === true || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId);
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
