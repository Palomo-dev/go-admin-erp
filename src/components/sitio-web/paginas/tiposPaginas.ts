/**
 * Contratos de `/api/sitio-web/paginas/**` (Páginas y Menú y navegación), compartidos por los
 * route handlers, el servicio del servidor y los hooks del navegador. Sin dependencias de
 * ejecución.
 */
import type { ResumenPlantillaCompleta } from '@/lib/website/v2/plantillaCompleta';
import type { ContadoresPaginas, FilaPagina } from './vistaPaginas';
import type { Giro } from './plantillasPagina';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';

export interface PermisosSitio {
  /** `website.sites.edit`, resuelto en el servidor con `fn_website_tiene_permiso`. */
  editar: boolean;
  /** `website.sites.publish`. */
  publicar: boolean;
}

/** Sucursal que sale en la web (`branches.is_web_published`), con su sitio V2 si ya lo tiene. */
export interface SedeWeb {
  branchId: number;
  nombre: string;
  sitioId: string | null;
}

export interface SitioPaginas {
  id: string;
  branchId: number | null;
  version: number;
  v2Adoptado: boolean;
  revisionPublicadaId: string | null;
}

export interface RespuestaPaginas {
  /**
   * `v2`: se lee del borrador. `legacy`: el sitio aún no tiene borrador V2 y la lista es una
   * importación en memoria del sitio actual (solo lectura); la primera edición crea el borrador
   * sin cambiar lo que ve el público.
   */
  modo: 'v2' | 'legacy';
  sitio: SitioPaginas | null;
  paginas: FilaPagina[];
  contadores: ContadoresPaginas;
  permisos: PermisosSitio;
  giro: Giro;
  /** Títulos del juego base del giro («Inicio, Menú, Ofertas, Contacto y legales»). */
  paginasBase: string[];
  sedes: SedeWeb[];
}

/** Resultado de una escritura: nueva versión del borrador y la página afectada. */
export interface RespuestaEscrituraPaginas {
  sitioId: string;
  version: number;
  actualizadoEn: string;
  paginaId?: string;
  creadas?: number;
}

/** POST `/api/sitio-web/paginas/plantilla` («Usar esta plantilla › Plantilla completa»). */
export interface RespuestaPlantillaCompleta extends RespuestaEscrituraPaginas {
  /** Copia del borrador anterior en el historial («Deshacer»). */
  instantaneaId: string;
  resumen: ResumenPlantillaCompleta;
}

/** GET de Menú y navegación (`/api/sitio-web/paginas/menu`). */
export interface RespuestaMenusSitio {
  /**
   * `v2`: el sitio tiene borrador (el documento lo lee `useSitioV2`).
   * `legacy`: sitio principal sin borrador; `documento` es su importación (solo lectura hasta
   * el primer guardado, que crea el borrador).
   * `heredado`: sede sin sitio propio; `documento` es el del principal («Personalizar en esta sede»).
   */
  modo: 'v2' | 'legacy' | 'heredado';
  permisos: PermisosSitio;
  giro: Giro;
  sedes: SedeWeb[];
  documento: DocumentoSitio | null;
}

/** Categoría del Inventario para el menú (D/04-09), leída en el servidor. */
export interface CategoriaInventarioMenu {
  id: number;
  padreId: number | null;
  nombre: string;
  slug: string;
  imagenUrl: string | null;
  activa: boolean;
  /** `null` = de toda la organización; un id = solo de esa sede. */
  branchId: number | null;
  /** Productos con `status = 'active'` en la categoría. */
  productos: number;
  /** Primeros productos (para la vista previa del megamenú). */
  muestra: string[];
}

export interface RespuestaCategoriasMenu {
  categorias: CategoriaInventarioMenu[];
}

/** Códigos de error de las operaciones de página (van en `error.details.codigo`). */
export type CodigoErrorPagina =
  | 'titulo_vacio'
  | 'slug_vacio'
  | 'slug_repetido'
  | 'slug_de_sede'
  | 'slug_invalido'
  | 'limite_paginas'
  | 'pagina_no_existe'
  | 'no_se_elimina_inicio'
  | 'limite_items'
  | 'limite_menus'
  | 'plantilla_no_existe';
