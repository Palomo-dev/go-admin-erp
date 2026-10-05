'use client';

/**
 * Cliente del navegador para facturas de compra y CxP: solo `fetch` a los
 * route handlers. No lee ni escribe tablas; la organización la pone el servidor
 * desde la sesión (el header `x-organization-id` solo desambigua pestañas).
 *
 * Los pagos van por el pago único (`@/lib/finanzas/pagos/clientePagos`).
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CuotaEntrada,
  EstadoCuentaProveedor,
  GuardarFacturaCompra,
  ProgramarPago,
  ResultadoConfirmar,
  ResultadoGuardar,
  ResultadoRecepcion,
  LotesRecepcionFactura,
} from './contrato';

export class ErrorPeticionCompra extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
    public readonly campos: string[] = [],
  ) {
    super(codigo);
  }
}

function cabeceras(json: boolean): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function pedir<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(init.body !== undefined),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; campos?: string[] };
    const codigo = c.codigo ?? (c.code === 'FOREIGN_ORGANIZATION' ? 'organizacion_no_permitida' : 'error_desconocido');
    throw new ErrorPeticionCompra(codigo, r.status, c.campos ?? []);
  }
  return cuerpo as T;
}

const resultado = <T>(p: Promise<{ resultado: T }>) => p.then((x) => x.resultado);

export const clienteCompras = {
  guardar: (datos: GuardarFacturaCompra) => resultado(pedir<{ resultado: ResultadoGuardar }>('/api/facturas-compra', { method: 'POST', body: datos })),
  confirmar: (id: string, opciones: { recepcionar: boolean; generar_ds: boolean; lotes?: LotesRecepcionFactura }) =>
    resultado(pedir<{ resultado: ResultadoConfirmar }>(`/api/facturas-compra/${id}/confirmar`, { method: 'POST', body: opciones })),
  recepcionar: (id: string, lotes?: LotesRecepcionFactura) =>
    resultado(pedir<{ resultado: ResultadoRecepcion }>(`/api/facturas-compra/${id}/recepcionar`, { method: 'POST', body: lotes && lotes.length > 0 ? { lotes } : {} })),
  anular: (id: string, motivo: string) => pedir<{ ok: true }>(`/api/facturas-compra/${id}/anular`, { method: 'POST', body: { motivo } }),
  eliminarBorrador: (id: string) => pedir<{ ok: true }>(`/api/facturas-compra/${id}`, { method: 'DELETE' }),
  siguienteNumero: () => pedir<{ numero: string }>('/api/facturas-compra/siguiente-numero').then((x) => x.numero),
  desdeOrden: (ordenUuid: string) =>
    resultado(
      pedir<{ resultado: { invoice_id: string; number_ext?: string; ya_existia: boolean } }>('/api/facturas-compra/desde-orden', {
        method: 'POST',
        body: { orden_uuid: ordenUuid },
      }),
    ),
  programarPago: (cuentaId: string, datos: ProgramarPago) =>
    resultado(pedir<{ resultado: { id: string } }>(`/api/cuentas-por-pagar/${cuentaId}/programaciones`, { method: 'POST', body: datos })),
  aprobarProgramacion: (id: string, comentario: string | null) =>
    resultado(
      pedir<{ resultado: { payment_id: string; recibo: string | null; aviso: 'unico_aprobador' | null } }>(
        `/api/programaciones-pago/${id}/aprobar`,
        { method: 'POST', body: { comentario } },
      ),
    ),
  rechazarProgramacion: (id: string, comentario: string) =>
    pedir<{ ok: true }>(`/api/programaciones-pago/${id}/rechazar`, { method: 'POST', body: { comentario } }),
  cancelarProgramacion: (id: string, comentario: string | null) =>
    pedir<{ ok: true }>(`/api/programaciones-pago/${id}/cancelar`, { method: 'POST', body: { comentario } }),
  crearPlanCuotas: (cuentaId: string, cuotas: CuotaEntrada[]) =>
    resultado(pedir<{ resultado: { cuotas: number } }>(`/api/cuentas-por-pagar/${cuentaId}/cuotas`, { method: 'POST', body: { cuotas } })),
  eliminarPlanCuotas: (cuentaId: string) =>
    resultado(pedir<{ resultado: { eliminadas: number } }>(`/api/cuentas-por-pagar/${cuentaId}/cuotas`, { method: 'DELETE' })),
  estadoCuentaProveedor: (proveedorId: number, desde?: string | null, hasta?: string | null) => {
    const q = new URLSearchParams();
    if (desde) q.set('desde', desde);
    if (hasta) q.set('hasta', hasta);
    const s = q.toString();
    return resultado(pedir<{ resultado: EstadoCuentaProveedor }>(`/api/proveedores/${proveedorId}/estado-cuenta${s ? `?${s}` : ''}`));
  },
  /** Expide (o devuelve, si ya existe idéntico) el certificado de retenciones del periodo: serie CR de la organización. */
  expedirCertificadoRetenciones: (proveedorId: number, datos: { desde: string; hasta: string; sucursalId: number | null }) =>
    pedir<{ certificado: { id: string; numero: string; reexpedido: boolean } }>(`/api/proveedores/${proveedorId}/certificado-retenciones`, {
      method: 'POST',
      body: datos,
    }).then((x) => x.certificado),
};
