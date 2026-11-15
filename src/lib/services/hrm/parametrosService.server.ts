/**
 * Parámetros legales por vigencia y festivos. ADR-001 §4 y §5.
 *
 * Ningún valor legal vive en el código: todo sale de `fn_hr_parametro*`, que
 * toma primero el valor de la organización y luego el de la plataforma, por la
 * fecha del hecho. Lo que está «por confirmar» no se usa para calcular: la base
 * responde 422 `parametro_por_confirmar`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esCodigoParametro, esFechaPlana } from './tipos';

export type ContextoParametros = Pick<ServerOrgContext, 'supabase' | 'organizationId'>;

export interface DetalleParametro {
  code: string;
  origen: 'organizacion' | 'plataforma' | 'fiscal_uvt';
  valor: number | null;
  valor_json: unknown;
  status: 'vigente' | 'transitorio' | 'litigio' | 'por_confirmar';
  verificacion: 'V' | 'S' | 'NC' | null;
  fuente: string | null;
  url: string | null;
  desde: string;
  hasta: string | null;
}

export interface TramoParametro {
  desde: string;
  hasta: string;
  valor: number | null;
  valor_json: unknown;
  origen: string;
  status: string | null;
  fuente: string | null;
}

function validar(code: string, ...fechas: string[]) {
  if (!esCodigoParametro(code)) throw new HrmError(400, 'parametro_invalido');
  for (const f of fechas) if (!esFechaPlana(f)) throw new HrmError(422, 'fecha_invalida');
}

/** Valor numérico confirmado del parámetro en la fecha. */
export async function parametro(ctx: ContextoParametros, code: string, fecha: string): Promise<number> {
  validar(code, fecha);
  const { data, error } = await ctx.supabase.rpc('fn_hr_parametro', { p_org: ctx.organizationId, p_code: code, p_fecha: fecha });
  if (error) throw errorDeRpc(error);
  return Number(data);
}

/** Detalle con origen, estado y fuente (no falla con lo que está por confirmar). */
export async function detalleParametro(ctx: ContextoParametros, code: string, fecha: string): Promise<DetalleParametro | null> {
  validar(code, fecha);
  const { data, error } = await ctx.supabase.rpc('fn_hr_parametro_detalle', { p_org: ctx.organizationId, p_code: code, p_fecha: fecha });
  if (error) throw errorDeRpc(error);
  return (data ?? null) as DetalleParametro | null;
}

/** Tramos del período en que cambia el valor (un período puede necesitar dos valores). */
export async function tramosParametro(ctx: ContextoParametros, code: string, desde: string, hasta: string): Promise<TramoParametro[]> {
  validar(code, desde, hasta);
  if (hasta < desde) throw new HrmError(422, 'periodo_invalido');
  const { data, error } = await ctx.supabase.rpc('fn_hr_parametro_tramos', {
    p_org: ctx.organizationId,
    p_code: code,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw errorDeRpc(error);
  return ((data ?? []) as TramoParametro[]).map((t) => ({ ...t, valor: t.valor === null ? null : Number(t.valor) }));
}

export interface Festivo {
  fecha: string;
  nombre: string;
  origen: 'plataforma' | 'organizacion';
}

export async function festivos(ctx: ContextoParametros, desde: string, hasta: string, sedeId?: number | null): Promise<Festivo[]> {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta) || hasta < desde) throw new HrmError(422, 'periodo_invalido');
  const { data, error } = await ctx.supabase.rpc('fn_hr_festivos', {
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_branch: sedeId ?? null,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? []) as Festivo[];
}
