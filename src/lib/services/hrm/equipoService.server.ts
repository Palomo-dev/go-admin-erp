/**
 * Vista del jefe («Mi equipo», Figma 20.15) y pestañas del módulo (decisión 1).
 *
 * Todo lo decide la base con el actor de la sesión:
 * - `fn_hr_mi_equipo`: su equipo (directo e indirecto), pendientes que le toca
 *   aprobar, quién falta hoy, quién llegó tarde y quién está ausente;
 * - `fn_hr_equipo_persona`: la ficha corta de una persona del equipo;
 * - `fn_hr_pestanas`: si la persona ve las 9 pestañas de RR. HH. o las 6 del
 *   jefe, con sus contadores.
 * El jefe nunca recibe salario, banco ni salud: una incapacidad llega como
 * clase «incapacidad» sin tipo ni etiqueta y la pantalla dice «Ausencia justificada».
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esUuid } from './tipos';

export type ContextoEquipo = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

export interface PestanasHrm {
  vista: 'rrhh' | 'jefe' | 'ninguna';
  contadores: { empleados: number | null; equipo: number; novedades: number };
}

function cliente() {
  return getServiceClient();
}

export async function miEquipo(ctx: ContextoEquipo): Promise<Record<string, unknown>> {
  const { data, error } = await cliente().rpc('fn_hr_mi_equipo', { p_actor: ctx.userId, p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function personaDelEquipo(ctx: ContextoEquipo, vinculo: string): Promise<Record<string, unknown>> {
  if (!esUuid(vinculo)) throw new HrmError(400, 'vinculo_invalido');
  const { data, error } = await cliente().rpc('fn_hr_equipo_persona', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculo,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function pestanas(ctx: ContextoEquipo): Promise<PestanasHrm> {
  const { data, error } = await cliente().rpc('fn_hr_pestanas', { p_actor: ctx.userId, p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return data as PestanasHrm;
}
