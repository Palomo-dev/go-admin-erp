'use client';

/**
 * Cliente del navegador para facturas de venta: solo `fetch` a los route
 * handlers (`/api/facturas-venta/...`). La organización la resuelve el servidor
 * desde la sesión; el header `x-organization-id` evita la ambigüedad con varias
 * pestañas. Nada se escribe desde el navegador.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DatosFactura, DetalleFacturaVenta, ErrorFactura, FaltanteStock, ResultadoGuardarFactura } from './contratoFacturas';
import type { RespuestaListadoFacturas } from './listadoFacturas';
import type { ContextoNota, ResultadoNota, SolicitudNota } from './contratoNotaCredito';

/** Lo que el diálogo envía (los valores por defecto los pone el esquema del servidor). */
export type SolicitudNotaEntrada = Omit<SolicitudNota, 'reingresar' | 'liquidacion'> &
  Partial<Pick<SolicitudNota, 'reingresar' | 'liquidacion'>>;

export class ErrorPeticionFactura extends Error {
  constructor(
    public readonly codigo: ErrorFactura | string,
    public readonly estado: number,
    public readonly faltantes: FaltanteStock[] = [],
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
    const c = (cuerpo ?? {}) as { codigo?: string; faltantes?: FaltanteStock[] };
    throw new ErrorPeticionFactura(c.codigo ?? 'error_desconocido', r.status, c.faltantes ?? []);
  }
  return cuerpo as T;
}

export async function pedirDetalleFactura(id: string): Promise<DetalleFacturaVenta> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<DetalleFacturaVenta>(r);
}

export async function emitirFacturaVenta(id: string): Promise<{ id: string; numero: string; stock_descontado: boolean }> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(id)}/emitir`, { method: 'POST', credentials: 'same-origin', headers: cabeceras(true), body: '{}' });
  return (await leer<{ resultado: { id: string; numero: string; stock_descontado: boolean } }>(r)).resultado;
}

export async function anularFacturaVenta(id: string, motivo: string): Promise<{ productos_devueltos: number; comisiones_canceladas?: number; avisos?: string[] }> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(id)}/anular`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ motivo }),
  });
  return (await leer<{ resultado: { productos_devueltos: number; comisiones_canceladas?: number; avisos?: string[] } }>(r)).resultado;
}

/** Crea (`id` null) o edita un borrador; la base calcula totales y crea la venta ligada. */
export async function guardarFacturaVenta(id: string | null, datos: DatosFactura): Promise<ResultadoGuardarFactura> {
  const r = await fetch(id ? `/api/facturas-venta/${encodeURIComponent(id)}` : '/api/facturas-venta', {
    method: id ? 'PUT' : 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(datos),
  });
  return (await leer<{ resultado: ResultadoGuardarFactura }>(r)).resultado;
}

export async function pedirContextoNota(id: string): Promise<ContextoNota> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(id)}/nota-credito`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return (await leer<{ contexto: ContextoNota }>(r)).contexto;
}

export async function emitirNotaCreditoVenta(id: string, solicitud: SolicitudNotaEntrada): Promise<ResultadoNota> {
  const r = await fetch(`/api/facturas-venta/${encodeURIComponent(id)}/nota-credito`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(solicitud),
  });
  return (await leer<{ resultado: ResultadoNota }>(r)).resultado;
}

export async function pedirListadoFacturas(query: URLSearchParams): Promise<RespuestaListadoFacturas> {
  const r = await fetch(`/api/facturas-venta?${query.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<RespuestaListadoFacturas>(r);
}