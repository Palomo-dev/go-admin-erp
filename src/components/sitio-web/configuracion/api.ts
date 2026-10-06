'use client';

/**
 * Cliente del navegador de `/api/sitio-web/configuracion/**` y
 * `/api/sitio-web/carta/**`: solo `fetch`. La organización la resuelve el
 * servidor desde la sesión (la cabecera es la organización activa, que el
 * servidor valida contra la membresía); nunca viaja en el body.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export type FalloApi = 'error' | 'sin_permiso' | 'no_encontrada' | 'pendiente' | 'red';

export class ErrorApiConfiguracion extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle: unknown = null,
  ) {
    super(mensaje);
    this.name = 'ErrorApiConfiguracion';
  }

  get fallo(): FalloApi {
    if (this.estado === 0) return 'red';
    if (this.estado === 401 || this.estado === 403) return 'sin_permiso';
    if (this.estado === 404) return 'no_encontrada';
    if (this.codigo === 'pendiente_migracion') return 'pendiente';
    return 'error';
  }
}

export function falloDe(error: unknown): FalloApi {
  return error instanceof ErrorApiConfiguracion ? error.fallo : 'error';
}

export async function pedirApi<T>(ruta: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }): Promise<T> {
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
    throw new ErrorApiConfiguracion(0, 'red', 'Revisa tu conexión e inténtalo de nuevo.');
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: unknown; codigo?: string; code?: string; detalle?: unknown } | null;
  if (!respuesta.ok) {
    const mensaje = typeof cuerpo?.error === 'string' ? cuerpo.error : '';
    throw new ErrorApiConfiguracion(respuesta.status, cuerpo?.codigo ?? cuerpo?.code ?? 'error_interno', mensaje, cuerpo?.detalle ?? null);
  }
  return cuerpo as T;
}

export const RUTA_API_CONFIGURACION = '/api/sitio-web/configuracion';
export const RUTA_API_CARTA = '/api/sitio-web/carta';
