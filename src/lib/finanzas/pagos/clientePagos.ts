'use client';

/**
 * Cliente del navegador para el pago único: solo `fetch` a los route handlers
 * (`/api/pagos`, `/api/pagos/[id]/anular`, `/api/pagos/contexto`). No lee ni
 * escribe tablas: la organización la resuelve el servidor desde la sesión; el
 * header `x-organization-id` solo evita la ambigüedad con varias pestañas.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ContextoPago, DireccionPago, DocumentoPago, ErrorPago, ResultadoPago, SolicitudPago } from './contrato';

export type { ContextoPago };

export class ErrorPeticionPago extends Error {
  constructor(
    public readonly codigo: ErrorPago | string,
    public readonly estado: number,
    public readonly detalle: unknown = null,
  ) {
    super(codigo);
  }
}

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function leer<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; detalle?: unknown };
    const codigo = c.codigo ?? (c.code === 'FOREIGN_ORGANIZATION' ? 'organizacion_no_permitida' : 'error_desconocido');
    throw new ErrorPeticionPago(codigo, r.status, c.detalle ?? null);
  }
  return cuerpo as T;
}

export async function pedirContextoPago(entrada: {
  direccion?: DireccionPago;
  documento?: DocumentoPago;
  id?: string;
  cliente?: string;
}): Promise<ContextoPago> {
  const q = new URLSearchParams({ direccion: entrada.direccion ?? 'cobro' });
  if (entrada.documento && entrada.id) {
    q.set('documento', entrada.documento);
    q.set('id', entrada.id);
  }
  if (entrada.cliente) q.set('cliente', entrada.cliente);
  const r = await fetch(`/api/pagos/contexto?${q.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<ContextoPago>(r);
}

export async function enviarPago(solicitud: SolicitudPago): Promise<ResultadoPago> {
  const r = await fetch('/api/pagos', {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(solicitud),
  });
  return (await leer<{ resultado: ResultadoPago }>(r)).resultado;
}

export async function enviarAnulacionPago(
  paymentId: string,
  motivo: string,
  origen?: SolicitudPago['origen'],
): Promise<{ saldo_nuevo: number | null }> {
  const r = await fetch(`/api/pagos/${encodeURIComponent(paymentId)}/anular`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(origen ? { motivo, origen } : { motivo }),
  });
  return (await leer<{ resultado: { saldo_nuevo: number | null } }>(r)).resultado;
}
