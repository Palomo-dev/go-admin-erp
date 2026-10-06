'use client';

/**
 * Cliente del navegador de `/api/sitio-web/paginas/**`: solo `fetch`. La organización la
 * resuelve el servidor desde la sesión (la cabecera es la organización activa, que el servidor
 * valida contra la membresía); nunca viaja en el body.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CodigoErrorPagina,
  RespuestaCategoriasMenu,
  RespuestaMenusSitio,
  RespuestaEscrituraPaginas,
  RespuestaPaginas,
  RespuestaPlantillaCompleta,
} from './tiposPaginas';


export class ErrorApiPaginas extends Error {
  constructor(
    public readonly estado: number,
    /** Código de la API V2 (`conflicto_version`, `sin_permiso`…). */
    public readonly codigo: string,
    mensaje: string,
    /** Código de la operación de página (`slug_repetido`…), si lo hay. */
    public readonly codigoPagina?: CodigoErrorPagina,
  ) {
    super(mensaje);
    this.name = 'ErrorApiPaginas';
  }

  get esConflicto(): boolean {
    return this.estado === 409;
  }

  get esSinPermiso(): boolean {
    return this.estado === 401 || this.estado === 403;
  }
}

export const RUTA_API_PAGINAS = '/api/sitio-web/paginas';

/** `principal` o el id de la sucursal, como lo espera la API. */
export function parametroSitio(branchId: number | null): string {
  return branchId === null ? 'principal' : String(branchId);
}

async function pedir<T>(ruta: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const org = getOrganizationId();
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ErrorApiPaginas(0, 'red', 'Revisa tu conexión e inténtalo de nuevo.');
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) {
    const error = (cuerpo as { error?: { code?: string; message?: string; details?: { codigo?: CodigoErrorPagina } } | string } | null)?.error;
    if (error && typeof error === 'object') {
      throw new ErrorApiPaginas(respuesta.status, error.code ?? 'error_interno', error.message ?? '', error.details?.codigo);
    }
    throw new ErrorApiPaginas(respuesta.status, respuesta.status === 403 ? 'sin_permiso' : 'error_interno', typeof error === 'string' ? error : '');
  }
  return cuerpo as T;
}

export interface ContextoEscritura {
  branchId: number | null;
  version: number | null;
}

const cuerpoBase = (c: ContextoEscritura) => ({ sitio: c.branchId, version: c.version });

export const apiPaginas = {
  listar: (branchId: number | null) => pedir<RespuestaPaginas>(`${RUTA_API_PAGINAS}?sitio=${parametroSitio(branchId)}`),
  crear: (c: ContextoEscritura, datos: { plantilla: string; titulo: string; slug: string; enMenu: boolean }) =>
    pedir<RespuestaEscrituraPaginas>(RUTA_API_PAGINAS, { method: 'POST', body: { ...cuerpoBase(c), ...datos } }),
  restaurarBase: (c: ContextoEscritura) =>
    pedir<RespuestaEscrituraPaginas>(`${RUTA_API_PAGINAS}/base`, { method: 'POST', body: cuerpoBase(c) }),
  /** «Usar esta plantilla › Plantilla completa» (el borrador anterior queda en el historial). */
  plantillaCompleta: (c: ContextoEscritura, plantilla: string) =>
    pedir<RespuestaPlantillaCompleta>(`${RUTA_API_PAGINAS}/plantilla`, { method: 'POST', body: { ...cuerpoBase(c), plantilla } }),
  modificar: (c: ContextoEscritura, paginaId: string, accion: Record<string, unknown>) =>
    pedir<RespuestaEscrituraPaginas>(`${RUTA_API_PAGINAS}/${encodeURIComponent(paginaId)}`, {
      method: 'PATCH',
      body: { ...cuerpoBase(c), ...accion },
    }),
  eliminar: (c: ContextoEscritura, paginaId: string) =>
    pedir<RespuestaEscrituraPaginas>(`${RUTA_API_PAGINAS}/${encodeURIComponent(paginaId)}`, { method: 'DELETE', body: cuerpoBase(c) }),
  menus: (branchId: number | null) => pedir<RespuestaMenusSitio>(`${RUTA_API_PAGINAS}/menu?sitio=${parametroSitio(branchId)}`),
  categorias: (branchId: number | null) =>
    pedir<RespuestaCategoriasMenu>(`${RUTA_API_PAGINAS}/menu/categorias?sitio=${parametroSitio(branchId)}`),
};
