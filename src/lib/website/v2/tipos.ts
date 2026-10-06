/**
 * Contratos de la API administrativa de sitios V2 (`/api/website/v2/sites/**`), compartidos por
 * el servicio del servidor, los route handlers y el cliente del editor. Sin dependencias.
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

/** Códigos de error homogéneos (FASE-03: `error.code/message/details`). */
export type CodigoErrorSitio =
  | 'sitio_no_encontrado'
  | 'revision_no_encontrada'
  | 'sucursal_no_encontrada'
  | 'sin_permiso'
  | 'conflicto_version'
  | 'documento_invalido'
  | 'importacion_invalida'
  | 'sin_revision_publicada'
  | 'menu_no_encontrado'
  | 'peticion_invalida'
  /** La función aún no está disponible (su migración no se ha aplicado). */
  | 'no_disponible'
  | 'error_interno';

export const ESTADO_HTTP_ERROR: Record<CodigoErrorSitio, number> = {
  sitio_no_encontrado: 404,
  revision_no_encontrada: 404,
  sucursal_no_encontrada: 404,
  menu_no_encontrado: 404,
  sin_permiso: 403,
  conflicto_version: 409,
  documento_invalido: 422,
  importacion_invalida: 422,
  sin_revision_publicada: 422,
  peticion_invalida: 400,
  no_disponible: 503,
  error_interno: 500,
};

export interface CuerpoErrorSitio {
  error: { code: CodigoErrorSitio; message: string; details?: unknown };
}

export interface SitioResumen {
  id: string;
  branchId: number | null;
  v2Adoptado: boolean;
  v2AdoptadoEn: string | null;
  revisionPublicadaId: string | null;
  versionBorrador: number | null;
  borradorActualizadoEn: string | null;
  /** `true` si el borrador tiene cambios que la revisión publicada no tiene. */
  cambiosSinPublicar: boolean;
}

export interface BasePrincipal {
  documento: DocumentoSitio;
  /** De dónde sale lo que hereda la sede: la revisión publicada del principal o su estado legacy. */
  origen: 'revision' | 'legacy';
  /** El principal tiene un borrador con cambios que la sede aún no hereda (Figma 05-24). */
  principalConCambiosSinPublicar: boolean;
}

export interface BorradorSitio {
  sitio: SitioResumen;
  documento: DocumentoSitio;
  version: number;
  actualizadoEn: string;
  revisionBaseId: string | null;
  /** Solo en sitios de sede: base contra la que se resuelve la herencia (D6). */
  basePrincipal: BasePrincipal | null;
  /** Errores de contrato del documento guardado (un borrador escrito por otro cliente). */
  erroresContrato: { ruta: string; codigo: string }[];
}

export interface RevisionResumen {
  id: string;
  numero: number;
  nota: string | null;
  publicadaEn: string;
  publicadaPor: string | null;
  autor: string | null;
  versionBorrador: number;
  enLinea: boolean;
}

export interface ResultadoGuardado {
  version: number;
  actualizadoEn: string;
}

export interface ResultadoPublicacion {
  revisionId: string;
  numero: number;
  publicadaEn: string;
  idempotente: boolean;
  /** Solo al publicar el principal: sedes cuyo borrador recibió las secciones que heredaban. */
  sedesActualizadas?: number;
  /** Solo si se pidió `activar` al publicar (ver activarAlPublicar.ts). */
  activacion?: 'activada' | 'fallo' | 'no_aplica';
  errorActivacion?: string;
}

export interface ResultadoCreacion {
  sitio: SitioResumen;
  creado: boolean;
  avisos: string[];
}
