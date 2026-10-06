/**
 * Acceso por cargo — ÚNICA regla, compartida por el menú y el middleware.
 *
 * Antes había dos implementaciones que no coincidían (auditoría del módulo
 * Sitio web, 2026-10-06):
 *
 *  - El menú (`jobPositionModuleAccessService.getUserAccess`) tomaba el cargo de
 *    `organization_members.job_position_id` y, si faltaba, de
 *    `employments.position_id`; respetaba `is_super_admin`; y un cargo SIN filas
 *    en `job_position_module_access` no restringía nada.
 *  - El middleware solo miraba `organization_members.job_position_id`, ignoraba
 *    `is_super_admin` y, con un cargo sin filas, rebotaba a `/app/inicio`
 *    (`job_position_no_access`).
 *
 * Resultado: un miembro con un cargo sin configurar veía «Sitio web» en el menú y
 * el middleware lo sacaba; uno con el cargo en `employments` lo tenía oculto en el
 * menú y entraba por URL. Aquí vive la regla una sola vez. Funciones puras, sin
 * cliente de Supabase: se importan desde el Edge (middleware) y desde Node.
 */

/** Lo mínimo del miembro que hace falta para resolver su cargo. */
export interface MiembroCargo {
  id: number | string;
  is_super_admin: boolean | null;
  job_position_id: string | null;
}

/** Una fila de `job_position_module_access`. */
export interface FilaAccesoModulo {
  module_code: string;
  can_view: boolean;
  can_access: boolean;
}

/**
 * Cargo efectivo de un miembro. `null` = sin restricción por cargo (no hay
 * miembro, es super admin o no tiene cargo).
 *
 * @param buscarCargoEmpleo Respaldo cuando `organization_members` no trae el
 *   cargo: `employments.position_id` del empleo activo. Quien llama decide cómo
 *   consultarlo (supabase-js en Node, REST en el Edge).
 */
export async function resolverCargoMiembro(
  miembro: MiembroCargo | null | undefined,
  buscarCargoEmpleo: (memberId: number | string) => Promise<string | null>
): Promise<string | null> {
  if (!miembro || miembro.is_super_admin) return null;
  if (miembro.job_position_id) return miembro.job_position_id;
  return buscarCargoEmpleo(miembro.id);
}

/**
 * Módulos que el cargo deja VER en el menú. `null` = el cargo no tiene ninguna
 * fila: no restringe.
 */
export function modulosVisiblesCargo(filas: readonly FilaAccesoModulo[]): string[] | null {
  if (filas.length === 0) return null;
  return filas.filter((f) => f.can_view).map((f) => f.module_code);
}

/**
 * ¿El cargo deja ENTRAR al módulo? Un cargo sin ninguna fila no restringe
 * (misma regla que el menú). Con filas, hace falta la del módulo con
 * `can_access`.
 */
export function cargoPuedeEntrarAModulo(filas: readonly Pick<FilaAccesoModulo, 'module_code' | 'can_access'>[], moduleCode: string): boolean {
  if (filas.length === 0) return true;
  return filas.some((f) => f.module_code === moduleCode && f.can_access);
}
