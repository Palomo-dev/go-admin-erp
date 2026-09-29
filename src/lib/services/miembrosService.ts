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
