'use client';

/**
 * Cliente del navegador para traslados y distribución (inventario B3): solo
 * `fetch` a `/api/inventario/transferencias/**` y `/api/inventario/distribucion/**`.
 * No lee ni escribe tablas (guardarraíl 33) y no manda la organización en el
 * cuerpo: el servidor la toma de la sesión; el header `x-organization-id` solo
 * desambigua pestañas con organizaciones distintas.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CrearDistribucion,
  DespacharTraslado,
  DetalleErrorTraslado,
  DetalleTraslado,
  ErrorTraslado,
  FiltrosTraslados,
  GuardarTraslado,
  LineaRecibir,
  ListadoTraslados,
  OrdenDistribuible,
  ProductoTrasladable,
  ResultadoDistribucion,
  ResultadoOperacion,
} from './contrato';

export class ErrorPeticionTraslado extends Error {
  constructor(
    public readonly codigo: ErrorTraslado | string,
    public readonly estado: number,
    public readonly detalle: DetalleErrorTraslado | null = null,
  ) {
    super(codigo);
  }

  get sinPermiso(): boolean {
    return this.estado === 403;
  }

  get noEncontrado(): boolean {
    return this.estado === 404;
  }
}

function cabeceras(json: boolean): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function pedir<T>(url: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(init.body !== undefined),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; detalle?: DetalleErrorTraslado | null };
    const codigo =
      c.codigo ?? (c.code === 'FOREIGN_ORGANIZATION' ? 'organizacion_no_permitida' : r.status === 401 ? 'sin_sesion' : 'error_desconocido');
    throw new ErrorPeticionTraslado(codigo, r.status, c.detalle ?? null);
  }
  return cuerpo as T;
}

/** Filtros → query string (`estados` e `ids` repetidos; vacíos fuera). */
export function aQuery(filtros: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) valor.forEach((v) => p.append(clave, String(v)));
    else p.set(clave, String(valor));
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

const BASE = '/api/inventario/transferencias';

export const clienteTraslados = {
  listar: (filtros: FiltrosTraslados, signal?: AbortSignal) => pedir<ListadoTraslados>(`${BASE}${aQuery(filtros)}`, { signal }),
  detalle: (id: number, signal?: AbortSignal) => pedir<DetalleTraslado>(`${BASE}/${id}`, { signal }),
  crear: (datos: GuardarTraslado) => pedir<ResultadoOperacion>(BASE, { method: 'POST', body: datos }),
  editar: (id: number, datos: GuardarTraslado) => pedir<ResultadoOperacion>(`${BASE}/${id}`, { method: 'PUT', body: datos }),
  despachar: (id: number, datos: DespacharTraslado = {}) =>
    pedir<ResultadoOperacion>(`${BASE}/${id}/despachar`, { method: 'POST', body: datos }),
  recibir: (id: number, lineas: LineaRecibir[], clave: string) =>
    pedir<ResultadoOperacion>(`${BASE}/${id}/recibir`, { method: 'POST', body: { lineas, clave } }),
  cancelar: (id: number, motivo?: string | null) =>
    pedir<ResultadoOperacion>(`${BASE}/${id}/cancelar`, { method: 'POST', body: { motivo: motivo ?? null } }),
  devolver: (id: number, motivo: string | null, clave: string) =>
    pedir<ResultadoOperacion>(`${BASE}/${id}/devolver`, { method: 'POST', body: { motivo, clave } }),
  productos: (params: { origen: number; q?: string; ids?: number[]; limite?: number }, signal?: AbortSignal) =>
    pedir<ProductoTrasladable[]>(`${BASE}/productos${aQuery(params)}`, { signal }),
};

export const clienteDistribucion = {
  ordenes: (origen: number, signal?: AbortSignal) =>
    pedir<OrdenDistribuible[]>(`/api/inventario/distribucion/ordenes${aQuery({ origen })}`, { signal }),
  crear: (datos: CrearDistribucion) => pedir<ResultadoDistribucion>('/api/inventario/distribucion', { method: 'POST', body: datos }),
};
