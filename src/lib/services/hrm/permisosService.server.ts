/**
 * Qué puede hacer en RR. HH. el usuario de la sesión. ADR-001 §6.
 *
 * Lo resuelve `fn_hr_mis_permisos` en la base (rol + cargo con precedencia del
 * cargo, `check_user_permission`). La UI lo usa para mostrar u ocultar; quien
 * decide de verdad es la RLS o la RPC de cada operación.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { errorDeRpc, type GrupoDatos } from './tipos';

export interface PermisosGrupo {
  ver: boolean;
  ver_equipo: boolean;
  editar: boolean;
}

export interface PermisosHrm {
  empleados: { ver: boolean; ver_equipo: boolean; crear: boolean; editar: boolean };
  grupos: Record<GrupoDatos, PermisosGrupo>;
  exportar: boolean;
  asistencia: { ver: boolean; gestionar: boolean };
  ausencias: { ver: boolean; aprobar: boolean };
  nomina: { ver: boolean; procesar: boolean };
  aprobaciones: boolean;
  parametros: boolean;
  registro_accesos: boolean;
}

export async function misPermisos(ctx: Pick<ServerOrgContext, 'supabase' | 'organizationId'>): Promise<PermisosHrm> {
  const { data, error } = await ctx.supabase.rpc('fn_hr_mis_permisos', { p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return data as PermisosHrm;
}
