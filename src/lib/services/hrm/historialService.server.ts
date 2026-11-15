/**
 * Historial con fecha de efecto del vínculo laboral. ADR-001 §3.
 *
 * Va con la sesión del usuario (`ctx.supabase`, con RLS): `fn_hr_registrar_cambio`
 * y `fn_hr_valor_vigente` toman el actor de `auth.uid()` y resuelven el permiso
 * en la base. El contexto de la petición (IP, agente, ruta) viaja para el
 * registro de accesos cuando el campo es de salario.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esCampoHistorial, esFechaPlana, esUuid, type CampoHistorial, type ContextoPeticion } from './tipos';

export type ContextoSesion = Pick<ServerOrgContext, 'supabase'>;

export interface CambioRegistrado {
  id: string;
  status: 'pendiente' | 'aprobado';
  approval_instance_id: string | null;
}

export async function registrarCambio(
  ctx: ContextoSesion,
  args: { vinculoId: string; campo: CampoHistorial; efectivoDesde: string; valor: unknown; motivo: string },
  peticion: ContextoPeticion
): Promise<CambioRegistrado> {
  if (!esUuid(args.vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esCampoHistorial(args.campo)) throw new HrmError(400, 'campo_invalido');
  if (!esFechaPlana(args.efectivoDesde)) throw new HrmError(422, 'fecha_invalida');
  if (typeof args.motivo !== 'string' || args.motivo.trim().length < 3) throw new HrmError(422, 'motivo_obligatorio');
  const { data, error } = await ctx.supabase.rpc('fn_hr_registrar_cambio', {
    p_employment: args.vinculoId,
    p_campo: args.campo,
    p_efectivo: args.efectivoDesde,
    p_valor: args.valor ?? null,
    p_motivo: args.motivo.trim(),
    p_contexto: { ip: peticion.ip, user_agent: peticion.userAgent, ruta: peticion.ruta },
  });
  if (error) throw errorDeRpc(error);
  return data as CambioRegistrado;
}

export async function valorVigente(ctx: ContextoSesion, vinculoId: string, campo: CampoHistorial, fecha: string): Promise<unknown> {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esCampoHistorial(campo)) throw new HrmError(400, 'campo_invalido');
  if (!esFechaPlana(fecha)) throw new HrmError(422, 'fecha_invalida');
  const { data, error } = await ctx.supabase.rpc('fn_hr_valor_vigente', {
    p_employment: vinculoId,
    p_campo: campo,
    p_fecha: fecha,
  });
  if (error) throw errorDeRpc(error);
  return data ?? null;
}

export interface TramoValor {
  desde: string;
  hasta: string;
  valor: unknown;
}

export async function tramosDeValor(
  ctx: ContextoSesion,
  vinculoId: string,
  campo: CampoHistorial,
  desde: string,
  hasta: string
): Promise<TramoValor[]> {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esCampoHistorial(campo)) throw new HrmError(400, 'campo_invalido');
  if (!esFechaPlana(desde) || !esFechaPlana(hasta) || hasta < desde) throw new HrmError(422, 'periodo_invalido');
  const { data, error } = await ctx.supabase.rpc('fn_hr_valor_tramos', {
    p_employment: vinculoId,
    p_campo: campo,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? []) as TramoValor[];
}
