'use client';

/**
 * Cliente del navegador para notas crédito y débito: solo `fetch` a los route
 * handlers. La organización la resuelve el servidor desde la sesión; el header
 * `x-organization-id` evita la ambigüedad con varias pestañas.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DetalleFacturaVenta } from '@/lib/finanzas/ventas/contratoFacturas';
import type { ResultadoAnularNota } from '@/lib/finanzas/ventas/contratoNotaCredito';
import type {
  ContextoNotaDebito,
  DetalleNotaExtra,
  RespuestaListadoNotas,
  ResultadoNotaDebito,
  SolicitudNotaDebito,
  TipoNota,
} from './contratoNotas';

export class ErrorPeticionNota extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
    public readonly mensaje: string | null = null,
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
    const c = (cuerpo ?? {}) as { codigo?: string; error?: string };
    throw new ErrorPeticionNota(c.codigo ?? (r.status === 403 ? 'sin_permiso' : 'error_desconocido'), r.status, c.error ?? null);
  }
  return cuerpo as T;
}

export async function pedirListadoNotas(params: URLSearchParams): Promise<RespuestaListadoNotas> {
  const r = await fetch(`/api/notas?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<RespuestaListadoNotas>(r);
}

export interface DetalleNotaCliente {
  base: DetalleFacturaVenta;
  extra: DetalleNotaExtra;
}

export async function pedirDetalleNota(tipo: TipoNota, id: string): Promise<DetalleNotaCliente> {
  const base = tipo === 'debito' ? '/api/notas-debito' : '/api/notas-credito';
  const r = await fetch(`${base}/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<DetalleNotaCliente>(r);
}

export async function anularNota(tipo: TipoNota, id: string, motivo: string): Promise<ResultadoAnularNota | { id: string; yaAnulada: boolean }> {
  const base = tipo === 'debito' ? '/api/notas-debito' : '/api/notas-credito';
  const r = await fetch(`${base}/${encodeURIComponent(id)}/anular`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ motivo }),
  });
  return (await leer<{ resultado: ResultadoAnularNota | { id: string; yaAnulada: boolean } }>(r)).resultado;
}

export async function pedirContextoNotaDebito(facturaId: string): Promise<ContextoNotaDebito> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(facturaId)}/nota-debito`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(),
  });
  return (await leer<{ contexto: ContextoNotaDebito }>(r)).contexto;
}

export async function emitirNotaDebito(facturaId: string, solicitud: SolicitudNotaDebito): Promise<ResultadoNotaDebito> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(facturaId)}/nota-debito`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(solicitud),
  });
  return (await leer<{ resultado: ResultadoNotaDebito }>(r)).resultado;
}

/**
 * Envía (o reenvía) la nota crédito a la DIAN por la cola única
 * (`POST /api/factus/credit-note`, la misma ruta que usaba el detalle anterior).
 */
export async function enviarNotaCreditoDian(id: string, motivo: string): Promise<void> {
  const r = await fetch('/api/factus/credit-note', {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ invoiceId: id, reason: motivo.slice(0, 250) }),
  });
  await leer<unknown>(r);
}

/** Reintenta un envío rechazado o fallido (`POST /api/factus/jobs`, la ruta del detalle anterior). */
export async function reintentarEnvioDian(jobId: string): Promise<void> {
  const r = await fetch('/api/factus/jobs', {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ jobId, action: 'retry' }),
  });
  await leer<unknown>(r);
}
