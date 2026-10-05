/**
 * Expedición del certificado de retenciones de un proveedor (serie CR por
 * organización, Figma 09 · 1491:126182). Servicio de servidor: una sola RPC
 * transaccional, `fn_certificado_retenciones_expedir`, que toma la foto de
 * `fn_certificado_retenciones_proveedor` (el mismo cálculo del documento),
 * numera con candado por organización y año y guarda el certificado. Si ya
 * hay uno idéntico del mismo periodo, lo devuelve sin gastar número.
 *
 * Siempre con el cliente de la SESIÓN: la RPC vuelve a comprobar pertenencia
 * y `finance.view` con `auth.uid()`, y `p_organization_id` es la de la sesión,
 * nunca la del body (regla dura 5).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export interface SolicitudCertificado {
  proveedorId: number;
  desde: string;
  hasta: string;
  sucursalId: number | null;
}

export interface CertificadoExpedido {
  id: string;
  numero: string;
  /** true si ya existía uno idéntico del periodo y se devolvió el mismo número. */
  reexpedido: boolean;
}

/** Error de la RPC → respuesta HTTP: sin permiso 403, proveedor o sucursal ajenos 404, periodo 400. */
export function errorDeExpedicion(error: { code?: string; message?: string }): OrgContextError {
  switch (error.code) {
    case '42501':
      return new OrgContextError('Requiere el permiso finance.view', 403, 'sin_permiso');
    case 'P0002':
      return new OrgContextError('No encontrado', 404, 'no_encontrado');
    case '22023':
      return new OrgContextError('Periodo inválido', 400, 'periodo_invalido');
    default:
      return new OrgContextError('No se pudo expedir el certificado', 500, 'error_desconocido');
  }
}

export async function expedirCertificadoRetenciones(ctx: Ctx, solicitud: SolicitudCertificado): Promise<CertificadoExpedido> {
  const { data, error } = await ctx.supabase.rpc('fn_certificado_retenciones_expedir', {
    p_organization_id: ctx.organizationId,
    p_supplier_id: solicitud.proveedorId,
    p_desde: solicitud.desde,
    p_hasta: solicitud.hasta,
    p_branch_id: solicitud.sucursalId,
  });
  if (error) {
    const e = errorDeExpedicion(error as { code?: string; message?: string });
    if (e.statusCode >= 500) console.error('[compras] fn_certificado_retenciones_expedir', { organizationId: ctx.organizationId, message: error.message });
    throw e;
  }
  const r = (data ?? {}) as { id?: unknown; numero?: unknown; reexpedido?: unknown };
  if (typeof r.id !== 'string' || typeof r.numero !== 'string') {
    throw new OrgContextError('No se pudo expedir el certificado', 500, 'error_desconocido');
  }
  return { id: r.id, numero: r.numero, reexpedido: r.reexpedido === true };
}
