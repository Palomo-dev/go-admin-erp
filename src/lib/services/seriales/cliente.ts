'use client';

/**
 * Cliente del navegador para seriales, garantías y trazabilidad (inventario
 * B4): solo `fetch` a los route handlers `/api/inventario/**`. No lee ni
 * escribe tablas; la organización la pone el servidor desde la sesión (el
 * header `x-organization-id` solo desambigua pestañas).
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CambiarEstadoReclamo,
  CambiarEstadoSeriales,
  CrearReclamo,
  EnviarRma,
  EvaluacionSerial,
  FiltrosGarantias,
  FiltrosSeriales,
  GarantiaDetalle,
  ListadoGarantias,
  ListadoSeriales,
  ResolverReclamo,
  ResultadoCambioEstado,
  ResultadoTrazabilidad,
  SerialDetalle,
  SerialReemplazo,
} from './contrato';

export class ErrorPeticionSeriales extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
    public readonly campos: string[] = [],
  ) {
    super(codigo);
  }

  /** 403 por permiso (la pantalla muestra «sin permiso», no «error»). */
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
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; campos?: string[] };
    const codigo = c.codigo ?? (c.code === 'FOREIGN_ORGANIZATION' ? 'organizacion_no_permitida' : r.status === 401 ? 'sin_sesion' : 'error_desconocido');
    throw new ErrorPeticionSeriales(codigo, r.status, c.campos ?? []);
  }
  return cuerpo as T;
}

/** Filtros → query string (`estados` repetido; vacíos fuera). */
export function aQuery(filtros: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue;
    if (Array.isArray(valor)) {
      for (const v of valor) if (v !== undefined && v !== null && v !== '') p.append(clave, String(v));
    } else {
      p.set(clave, String(valor));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

const resultado = <T>(p: Promise<{ resultado: T }>) => p.then((x) => x.resultado);

export const clienteSeriales = {
  listar: (filtros: FiltrosSeriales, signal?: AbortSignal) =>
    pedir<ListadoSeriales>(`/api/inventario/seriales${aQuery(filtros)}`, { signal }),
  detalle: (id: number) => pedir<SerialDetalle>(`/api/inventario/seriales/${id}`),
  cambiarEstado: (datos: CambiarEstadoSeriales) =>
    resultado(pedir<{ resultado: ResultadoCambioEstado }>('/api/inventario/seriales/estado', { method: 'POST', body: datos })),
};

export const clienteGarantias = {
  listar: (filtros: FiltrosGarantias, signal?: AbortSignal) =>
    pedir<ListadoGarantias>(`/api/inventario/garantias${aQuery(filtros)}`, { signal }),
  detalle: (id: string) => pedir<GarantiaDetalle>(`/api/inventario/garantias/${id}`),
  evaluarSerial: (consulta: { id?: number; codigo?: string }, signal?: AbortSignal) =>
    pedir<EvaluacionSerial>(`/api/inventario/garantias/serial${aQuery(consulta)}`, { signal }),
  crear: (datos: CrearReclamo) =>
    resultado(pedir<{ resultado: { id: string; codigo: string } }>('/api/inventario/garantias', { method: 'POST', body: datos })),
  cambiarEstado: (id: string, datos: CambiarEstadoReclamo) =>
    resultado(pedir<{ resultado: { id: string; estado: string } }>(`/api/inventario/garantias/${id}/estado`, { method: 'POST', body: datos })),
  enviarRma: (id: string, datos: EnviarRma) =>
    resultado(pedir<{ resultado: { id: string; estado: string; rma: string } }>(`/api/inventario/garantias/${id}/rma`, { method: 'POST', body: datos })),
  reemplazos: (id: string) => pedir<{ seriales: SerialReemplazo[] }>(`/api/inventario/garantias/${id}/reemplazos`).then((x) => x.seriales),
  resolver: (id: string, datos: ResolverReclamo) =>
    resultado(
      pedir<{ resultado: { id: string; estado: string; tipo: string; reemplazo: string | null } }>(`/api/inventario/garantias/${id}/resolver`, {
        method: 'POST',
        body: datos,
      }),
    ),
};

export const clienteTrazabilidad = {
  buscar: (consulta: { codigo: string; sucursal?: number; desde?: number; limite?: number }, signal?: AbortSignal) =>
    pedir<ResultadoTrazabilidad>(`/api/inventario/trazabilidad${aQuery(consulta)}`, { signal }),
};
