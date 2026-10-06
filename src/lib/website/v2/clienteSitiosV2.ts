'use client';

/**
 * Cliente del navegador de los sitios V2: solo `fetch` a `/api/website/v2/sites/**`. La
 * organización la resuelve el servidor desde la sesión (la cabecera es la organización activa,
 * que el servidor valida contra la membresía). Nunca se envía `organization_id` en el body.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type {
  BorradorSitio,
  CodigoErrorSitio,
  CuerpoErrorSitio,
  ResultadoCreacion,
  ResultadoGuardado,
  ResultadoPublicacion,
  RevisionResumen,
  SitioResumen,
} from './tipos';

export class ErrorApiSitio extends Error {
  constructor(
    public readonly codigo: CodigoErrorSitio | 'sin_sesion' | 'red',
    public readonly estado: number,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApiSitio';
  }

  get esConflicto(): boolean {
    return this.codigo === 'conflicto_version';
  }
}

const BASE = '/api/website/v2/sites';

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return {
    'Content-Type': 'application/json',
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function pedir<T>(ruta: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: init?.method ?? 'GET',
      headers: cabeceras(),
      credentials: 'same-origin',
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ErrorApiSitio('red', 0, 'Revisa tu conexión. Tus cambios siguen en el editor.');
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = null;
  }
  if (!respuesta.ok) {
    const error = (cuerpo as CuerpoErrorSitio | null)?.error;
    if (error && typeof error === 'object') {
      throw new ErrorApiSitio(error.code, respuesta.status, error.message, error.details);
    }
    const codigo = respuesta.status === 401 ? 'sin_sesion' : respuesta.status === 403 ? 'sin_permiso' : 'error_interno';
    const mensaje = (cuerpo as { error?: string } | null)?.error;
    throw new ErrorApiSitio(codigo, respuesta.status, typeof mensaje === 'string' ? mensaje : 'No se pudo completar la operación.');
  }
  return cuerpo as T;
}

export const clienteSitiosV2 = {
  listar: async () => (await pedir<{ sitios: SitioResumen[] }>('')).sitios,
  crear: (branchId: number | null) => pedir<ResultadoCreacion>('', { method: 'POST', body: { branchId } }),
  borrador: (sitioId: string) => pedir<BorradorSitio>(`/${sitioId}/draft`),
  guardar: (sitioId: string, documento: DocumentoSitio, version: number) =>
    pedir<ResultadoGuardado>(`/${sitioId}/draft`, { method: 'PUT', body: { documento, version } }),
  publicar: (sitioId: string, version: number, nota: string | null) =>
    pedir<ResultadoPublicacion>(`/${sitioId}/publications`, { method: 'POST', body: { version, nota } }),
  revisiones: async (sitioId: string) => (await pedir<{ revisiones: RevisionResumen[] }>(`/${sitioId}/revisions`)).revisiones,
  restaurar: (sitioId: string, revisionId: string, version: number) =>
    pedir<ResultadoGuardado>(`/${sitioId}/restorations`, { method: 'POST', body: { revisionId, version } }),
  adopcion: async (sitioId: string, adoptado: boolean) =>
    (await pedir<{ sitio: SitioResumen }>(`/${sitioId}/adoption`, { method: 'POST', body: { adoptado } })).sitio,
  /** Token del enlace privado de la vista previa del borrador (caduca en 24 h). */
  vistaPrevia: (sitioId: string, paginaId: string | null) =>
    pedir<{ token: string; caducaEn: string }>(`/${sitioId}/vista-previa`, { method: 'POST', body: { paginaId } }),
  llevarMenu: (sitioId: string, menuId: string, version: number) =>
    pedir<ResultadoGuardado & { menuId: string; copiado: boolean }>(`/${sitioId}/menus`, {
      method: 'POST',
      body: { menuId, version },
    }),
};
