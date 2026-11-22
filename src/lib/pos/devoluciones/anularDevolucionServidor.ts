/**
 * «Anular devolución» en el servidor: el diagnóstico que elige el diálogo
 * (`fn_devolucion_anulacion_estado`) y la anulación en UNA transacción
 * (`fn_devolucion_anular`). Cliente de la sesión y organización de la sesión:
 * las dos funciones comprueban pertenencia, sucursal y el permiso pos.void.
 * Aquí no se decide nada de negocio (CLAUDE.md regla 7): solo se traducen
 * entradas y errores.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import {
  codigoErrorAnulacion,
  cuerpoAnulacion,
  estadoHttpAnulacion,
  normalizarDiagnostico,
  type CodigoErrorAnulacion,
  type DiagnosticoAnulacion,
  type ResultadoAnulacion,
} from './anularDevolucionLogica';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export class ErrorAnulacionDevolucion extends Error {
  readonly status: number;
  constructor(
    readonly codigo: CodigoErrorAnulacion,
    mensaje?: string,
  ) {
    super(mensaje ?? codigo);
    this.status = estadoHttpAnulacion(codigo);
  }
}

function idDevolucion(idTexto: string): number {
  const id = Number(idTexto);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorAnulacionDevolucion('devolucion_invalida', 'Identificador de devolución inválido');
  return id;
}

export async function diagnosticoAnulacion(ctx: Ctx, idTexto: string): Promise<DiagnosticoAnulacion> {
  const id = idDevolucion(idTexto);
  const { data, error } = await ctx.supabase.rpc('fn_devolucion_anulacion_estado', {
    p_organization_id: ctx.organizationId,
    p_return_id: id,
  });
  if (error) throw new ErrorAnulacionDevolucion(codigoErrorAnulacion(error), error.message);
  return normalizarDiagnostico(data);
}

export async function anularDevolucion(ctx: Ctx, idTexto: string, cuerpo: unknown): Promise<ResultadoAnulacion> {
  const id = idDevolucion(idTexto);
  const entrada = cuerpoAnulacion(cuerpo);
  if ('error' in entrada) throw new ErrorAnulacionDevolucion(entrada.error);
  const { data, error } = await ctx.supabase.rpc('fn_devolucion_anular', {
    p_organization_id: ctx.organizationId,
    p_return_id: id,
    p_motivo: entrada.motivo,
    p_fecha_espejo: entrada.fecha_espejo,
  });
  if (error) throw new ErrorAnulacionDevolucion(codigoErrorAnulacion(error), error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    return_id: Number(r.return_id) || id,
    ya_anulada: r.ya_anulada === true,
    numero: typeof r.numero === 'string' ? r.numero : undefined,
    fecha_espejo: r.fecha_espejo === 'original' ? 'original' : r.fecha_espejo === 'hoy' ? 'hoy' : undefined,
    contra_asientos: Array.isArray(r.contra_asientos) ? r.contra_asientos.map(Number) : [],
    asientos_pendientes: Number(r.asientos_pendientes) || 0,
    movimiento_caja: r.movimiento_caja == null ? null : Number(r.movimiento_caja),
    sesion_caja: r.sesion_caja == null ? null : Number(r.sesion_caja),
    unidades_retiradas: Number(r.unidades_retiradas) || 0,
  };
}
