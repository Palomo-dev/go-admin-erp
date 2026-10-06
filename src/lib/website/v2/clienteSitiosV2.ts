'use client';

/**
 * Cliente del navegador de los sitios V2: solo `fetch` a `/api/website/v2/sites/**`. La
 * organización la resuelve el servidor desde la sesión (la cabecera es la organización activa,
 * que el servidor valida contra la membresía). Nunca se envía `organization_id` en el body.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { LoteLegacy, RespuestaGuardadoLegacy } from '@/lib/website/editorLegacy';
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
import type { EstadoPlantillaSede, ResultadoPlantillaSede } from './plantillaSede';
import type {
  InstantaneaBorrador,
  MotivoInstantanea,
  ProgramacionPublicacion,
  RevisionConDocumento,
} from './tiposEditor';

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
  return pedirUrl<T>(`${BASE}${ruta}`, init);
}

async function pedirUrl<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
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
  /**
   * «Guardar y publicar» de los sitios sin borrador V2: un solo lote al servidor, que exige
   * `website.sites.edit` y `website.sites.publish` (ver src/lib/website/editorLegacy.ts).
   */
  guardarLegacy: (lote: LoteLegacy) =>
    pedirUrl<RespuestaGuardadoLegacy>('/api/sitio-web/editor/guardar', { method: 'POST', body: lote }),
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
  /** Una versión publicada con su documento (base de «Combinar» y «Ver esta versión»). */
  revision: async (sitioId: string, revisionId: string) =>
    (await pedir<{ revision: RevisionConDocumento }>(`/${sitioId}/revisions/${revisionId}`)).revision,
  programaciones: async (sitioId: string) =>
    (await pedir<{ programaciones: ProgramacionPublicacion[] }>(`/${sitioId}/programaciones`)).programaciones,
  programar: async (sitioId: string, version: number, ejecutarEn: string, nota: string | null) =>
    (
      await pedir<{ programacion: ProgramacionPublicacion }>(`/${sitioId}/programaciones`, {
        method: 'POST',
        body: { version, ejecutarEn, nota },
      })
    ).programacion,
  cancelarProgramacion: (sitioId: string, id: string) =>
    pedir<{ ok: true }>(`/${sitioId}/programaciones?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  instantaneas: async (sitioId: string) =>
    (await pedir<{ instantaneas: InstantaneaBorrador[] }>(`/${sitioId}/instantaneas`)).instantaneas,
  crearInstantanea: (sitioId: string, documento: DocumentoSitio, version: number, motivo: MotivoInstantanea) =>
    pedir<{ instantanea: InstantaneaBorrador }>(`/${sitioId}/instantaneas`, {
      method: 'POST',
      body: { accion: 'crear', documento, version, motivo },
    }),
  restaurarInstantanea: (sitioId: string, instantaneaId: string, version: number) =>
    pedir<ResultadoGuardado>(`/${sitioId}/instantaneas`, { method: 'POST', body: { accion: 'restaurar', instantaneaId, version } }),
  llevarMenu: (sitioId: string, menuId: string, version: number) =>
    pedir<ResultadoGuardado & { menuId: string; copiado: boolean }>(`/${sitioId}/menus`, {
      method: 'POST',
      body: { menuId, version },
    }),
  /** Plantilla del sitio de una sede según su tipo de negocio (estado para el diálogo). */
  plantillaSede: (branchId: number) => pedirUrl<EstadoPlantillaSede>(`/api/sitio-web/sedes/${branchId}/plantilla`),
  /**
   * `auto`: tras crear la sucursal o cambiarle el tipo (nunca pisa contenido propio).
   * `confirmado`: «Aplicar plantilla de <tipo>» sobre la versión `version` del borrador.
   */
  aplicarPlantillaSede: (branchId: number, modo: 'auto' | 'confirmado', version?: number) =>
    pedirUrl<ResultadoPlantillaSede>(`/api/sitio-web/sedes/${branchId}/plantilla`, {
      method: 'POST',
      body: modo === 'confirmado' ? { modo, version } : { modo },
    }),
  /** Despublicar o volver a mostrar el sitio en la web (Configuración › Zona de peligro). */
  visibilidad: (sitioId: string, publicado: boolean) =>
    pedir<{ publicado: boolean; publicadoEn: string | null }>(`/${sitioId}/visibilidad`, { method: 'POST', body: { publicado } }),
};
