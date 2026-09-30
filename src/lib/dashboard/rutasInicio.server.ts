/**
 * Piezas comunes de las rutas GET del inicio con periodo (`/api/inicio/ventas`,
 * `/tienda-web`, `/modulos`): quién puede pedir cifras del panel completo,
 * periodo y sucursal validados, y la traducción de `ErrorInicio` a respuesta.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { veePanelCompleto } from './accesoPanel';
import { sucursalValida } from './bloqueHoy.server';
import { leerPeriodo, type PeriodoPedido } from './periodo';
import { ErrorInicio } from './errorInicio';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export function respuestaError(status: number, codigo: string, error: string): NextResponse {
  return NextResponse.json({ error, codigo }, { status, headers: SIN_CACHE });
}

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/**
 * Valida el pedido de una ruta del panel completo. Devuelve el periodo y la
 * sucursal, o la respuesta de error (403 sin panel, 400 periodo o sucursal
 * inválidos). La organización es SIEMPRE la del contexto.
 */
export async function pedidoPanel(
  ctx: Ctx,
  req: Request,
): Promise<{ pedido: PeriodoPedido; sucursal: number | null } | NextResponse> {
  if (!veePanelCompleto({ roleId: ctx.roleId, isSuperAdmin: ctx.isSuperAdmin })) {
    return respuestaError(403, 'sin_permiso', 'Sin permiso para ver el resumen del inicio');
  }
  const url = new URL(req.url);
  const pedido = leerPeriodo(url.searchParams);
  if (!pedido) return respuestaError(400, 'periodo_invalido', 'Periodo no válido');
  const crudo = url.searchParams.get('sucursal');
  if (crudo === null || crudo === '') return { pedido, sucursal: null };
  const n = Number(crudo);
  if (!Number.isInteger(n) || n <= 0 || !(await sucursalValida(ctx, n))) {
    return respuestaError(400, 'sucursal_invalida', 'Sucursal no válida');
  }
  return { pedido, sucursal: n };
}

/** `ErrorInicio` → respuesta; cualquier otro error se relanza (500 de `withOrg`). */
export function manejarError(etiqueta: string, ctx: Pick<ServerOrgContext, 'organizationId'>, err: unknown): NextResponse {
  if (err instanceof ErrorInicio) {
    if (err.status >= 500) console.error(`[inicio/${etiqueta}]`, { organizationId: ctx.organizationId, message: err.message });
    return respuestaError(err.status, err.codigo, err.status >= 500 ? 'No se pudieron leer las cifras' : err.message);
  }
  throw err;
}
