import { supabase } from '@/lib/supabase/config';

/**
 * Gestión de OTROS miembros de la organización (acceso v3, fase 5;
 * docs/design/AUTH-ACCESO-V2.md §13.5). Punto único para Organización ›
 * Miembros y Roles.
 *
 * Antes cada pantalla escribía `organization_members` desde el navegador y RLS
 * lo filtraba a 0 filas sin error: la pantalla decía «actualizado» y no cambiaba
 * nada. Ahora son RPC con las guardas en la base (migración
 * 20260929212000_miembros_gestion_por_rpc): admin o permiso de la acción, nunca
 * sobre uno mismo ni sobre el dueño, y el rol Super Admin solo lo toca otro
 * super admin. Si la base rechaza, se lanza con el mensaje de la base.
 */

export class ErrorGestionMiembro extends Error {
  constructor(
    message: string,
    readonly codigo: string | undefined,
  ) {
    super(message);
    this.name = 'ErrorGestionMiembro';
  }
}

async function llamar(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    // Los mensajes de la base vienen como «miembros: …»; se quita el prefijo técnico.
    throw new ErrorGestionMiembro(error.message.replace(/^miembros:\s*/, ''), error.code);
  }
}

export function cambiarRolMiembro(memberId: number | string, roleId: number): Promise<void> {
  return llamar('fn_miembro_cambiar_rol', { p_member_id: Number(memberId), p_role_id: roleId });
}

export function cambiarEstadoMiembro(memberId: number | string, activo: boolean): Promise<void> {
  return llamar('fn_miembro_cambiar_estado', { p_member_id: Number(memberId), p_activo: activo });
}

export function retirarMiembro(memberId: number | string): Promise<void> {
  return llamar('fn_miembro_retirar', { p_member_id: Number(memberId) });
}

/** Alcance por sucursal de un miembro: «todas» (sin filas) o una lista explícita. */
export type AlcanceSucursales = { todas: true } | { todas: false; sucursales: readonly (number | string)[] };

/**
 * Sucursales de un miembro en UNA transacción (`fn_miembro_asignar_sucursales`,
 * migración 20261006150400; auditoría 2026-10, P0-10). Antes era DELETE de
 * todas sus filas + INSERT desde el navegador: si el INSERT fallaba, el miembro
 * quedaba sin filas, es decir, con acceso a TODAS las sucursales.
 *
 * «Todas» solo se manda si se eligió así; una lista vacía no es «todas» y la
 * base la rechaza. Misma guarda que las demás RPC de miembros (users.edit,
 * nunca uno mismo ni el dueño).
 */
export function asignarSucursalesMiembro(memberId: number | string, alcance: AlcanceSucursales): Promise<void> {
  if (alcance.todas) {
    return llamar('fn_miembro_asignar_sucursales', { p_member_id: Number(memberId), p_branch_ids: null, p_todas: true });
  }
  const ids = [...new Set(alcance.sucursales.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) {
    return Promise.reject(new ErrorGestionMiembro('Elige al menos una sucursal o «Todas las sucursales».', 'SIN_SUCURSALES'));
  }
  return llamar('fn_miembro_asignar_sucursales', { p_member_id: Number(memberId), p_branch_ids: ids, p_todas: false });
}

/**
 * Cargo del miembro (Organización › Miembros › ⋯ › Editar cargo). RPC de la
 * migración PENDIENTE `20261006120000_organizacion_invitaciones_y_cargo`
 * (supabase/pendientes): hasta aplicarla, la base responde que la función no
 * existe y se lanza `codigo = 'NO_DISPONIBLE'` para que la pantalla lo diga.
 */
export async function cambiarCargoMiembro(memberId: number | string, jobPositionId: string | null): Promise<void> {
  const { error } = await supabase.rpc('fn_miembro_cambiar_cargo', {
    p_member_id: Number(memberId),
    p_job_position_id: jobPositionId,
  });
  if (!error) return;
  // PGRST202: la función no está en el esquema expuesto; 42883: no existe.
  if (error.code === 'PGRST202' || error.code === '42883') {
    throw new ErrorGestionMiembro('Esta acción todavía no está disponible.', 'NO_DISPONIBLE');
  }
  throw new ErrorGestionMiembro(error.message.replace(/^miembros:\s*/, ''), error.code);
}

/**
 * Quita UNA sede a un miembro. Nunca la última: sin filas en `member_branches`
 * el miembro pasaría a ver TODAS las sucursales (`alcanceSucursal.ts`), así
 * que se rechaza aquí y la pantalla ni la ofrece (`puedeQuitarSede`).
 */
export async function quitarSedeMiembro(memberId: number | string, branchId: number, sedesActuales: number): Promise<void> {
  if (sedesActuales <= 1) {
    throw new ErrorGestionMiembro('Es su única sede: quitarla le daría acceso a todas.', 'ULTIMA_SEDE');
  }
  const { data, error } = await supabase
    .from('member_branches')
    .delete()
    .eq('organization_member_id', Number(memberId))
    .eq('branch_id', branchId)
    .select('id');
  if (error) throw new ErrorGestionMiembro(error.message, error.code);
  // RLS filtra sin error: 0 filas borradas = no se pudo (antes se decía «listo»).
  if (!data || data.length === 0) {
    throw new ErrorGestionMiembro('No tienes permiso para cambiar las sedes de este miembro.', 'SIN_FILAS');
  }
}
