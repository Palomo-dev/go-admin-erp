/**
 * Punto de entrada común del módulo Sitio web: componentes de `../ui`
 * (Figma A/07, B/02, D/02), el marco de página con sus cinco estados, las
 * rutas y la URL pública. Las áreas importan de aquí o de `../ui`; no hay
 * una segunda copia de nada.
 */
export * from '../ui';
export {
  MarcoSitioWeb,
  EstadoAjustes,
  EstadoPagina,
  CODIGO_MODULO_SITIO_WEB,
  type MarcoSitioWebProps,
  type EstadoAjustesProps,
  type EstadoPaginaProps,
  type EstadoVistaSitio,
} from '../MarcoSitioWeb';
export {
  RAIZ_SITIO_WEB,
  RUTA_DOMINIOS_SITIO_WEB,
  RUTA_ANALITICA_SITIO_WEB,
  DOMINIO_SITIOS,
  rutaEditorSitio,
  hostSitio,
  type DominioDelSitio,
} from '../rutasSitioWeb';
export { useUrlSitio, type UrlSitio } from '../useUrlSitio';
export {
  ROLES_COLOR_MARCA,
  referenciaMarca,
  rolDeReferencia,
  esReferenciaMarca,
  resolverColorMarca,
  type RolColorMarca,
  type ColoresMarca,
} from '@/lib/website/v2/colorMarca';
export {
  ROLES_FUENTE_TEMA,
  referenciaFuenteTema,
  rolFuenteDeReferencia,
  resolverFuenteTema,
  sigueAlTema,
  type RolFuenteTema,
  type FuentesTema,
} from '@/lib/website/v2/fuenteTema';
