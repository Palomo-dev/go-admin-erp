/**
 * Configuración › Recursos humanos › Registro de accesos (diseño 10.RH.3).
 * Decisiones del dueño del 2026-11-15: pestaña propia de RR. HH.; los valores
 * se ocultan hasta «Mostrar valores» y ese clic también se registra; la IP se
 * muestra parcialmente oculta; los intentos sin permiso también se registran.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { AccionRegistro, DetalleRegistro, ListaRegistro, ValoresRegistro } from '@/lib/hrm/configuracion/tipos';
import { HrmError, errorDeRpc, esGrupoDatos, esUuid, type ContextoPeticion } from '../tipos';
import type { CtxConfig } from './comun.server';

const ACCIONES = new Set<AccionRegistro>(['ver', 'editar', 'exportar', 'sin_permiso']);
export const POR_PAGINA = 8;

export interface FiltrosRegistro {
  desde?: string | null;
  hasta?: string | null;
  busca?: string | null;
  persona?: string | null;
  grupo?: string | null;
  accion?: string | null;
  pagina?: number;
}

export async function listarRegistro(ctx: CtxConfig, f: FiltrosRegistro): Promise<ListaRegistro> {
  const instante = (v: string | null | undefined) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  const grupo = f.grupo && (esGrupoDatos(f.grupo) || f.grupo === 'basico') ? f.grupo : null;
  const accion = f.accion && ACCIONES.has(f.accion as AccionRegistro) ? f.accion : null;
  const pagina = Number.isInteger(f.pagina) && (f.pagina as number) > 0 ? (f.pagina as number) : 1;
  const { data, error } = await ctx.supabase.rpc('fn_hr_registro_accesos', {
    p_org: ctx.organizationId,
    p_desde: instante(f.desde),
    p_hasta: instante(f.hasta),
    p_busca: typeof f.busca === 'string' ? f.busca.slice(0, 80) : null,
    p_person: f.persona && esUuid(f.persona) ? f.persona : null,
    p_grupo: grupo,
    p_accion: accion,
    p_limite: POR_PAGINA,
    p_desplazamiento: (pagina - 1) * POR_PAGINA,
  });
  if (error) throw errorDeRpc(error);
  return data as ListaRegistro;
}

export async function detalleRegistro(ctx: CtxConfig, id: number): Promise<DetalleRegistro> {
  if (!Number.isInteger(id) || id <= 0) throw new HrmError(400, 'registro_invalido');
  const { data, error } = await ctx.supabase.rpc('fn_hr_registro_acceso_detalle', { p_org: ctx.organizationId, p_id: id });
  if (error) throw errorDeRpc(error);
  return data as DetalleRegistro;
}

/** «Mostrar valores»: la base exige ver el registro Y el grupo del empleado, y lo registra. */
export async function mostrarValores(ctx: CtxConfig, id: number, peticion: ContextoPeticion): Promise<ValoresRegistro> {
  if (!Number.isInteger(id) || id <= 0) throw new HrmError(400, 'registro_invalido');
  const { data, error } = await getServiceClient().rpc('fn_hr_registro_mostrar_valores', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_id: id,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) throw errorDeRpc(error);
  return data as ValoresRegistro;
}

/**
 * Registra un intento sin permiso que la base rechazó con 42501 (la excepción
 * deshace lo que la propia RPC hubiera escrito). Nunca falla hacia afuera.
 */
export async function registrarIntento(
  ctx: Pick<CtxConfig, 'userId' | 'organizationId'>,
  args: { personaId?: string | null; vinculoId?: string | null; grupo: string; detalle?: Record<string, unknown> },
  peticion: ContextoPeticion
): Promise<void> {
  try {
    await getServiceClient().rpc('fn_hr_registrar_intento', {
      p_actor: ctx.userId,
      p_org: ctx.organizationId,
      p_person: args.personaId && esUuid(args.personaId) ? args.personaId : null,
      p_employment: args.vinculoId && esUuid(args.vinculoId) ? args.vinculoId : null,
      p_grupo: args.grupo,
      p_ip: peticion.ip,
      p_ua: peticion.userAgent,
      p_ruta: peticion.ruta,
      p_detalle: args.detalle ?? {},
    });
  } catch {
    // El registro del intento nunca tumba la respuesta 403.
  }
}
