/**
 * Importación del CATÁLOGO COMPLETO de una tienda en línea por su API pública.
 *
 * Todo lo de esta carpeta es puro (sin red, sin base): recibe un `Lector`
 * (la función que hace las peticiones HTTP) y devuelve `ProductoWeb`, el mismo
 * formato que ya consume el asistente de importación (`../web.ts`). Así los
 * productos de cualquier plataforma terminan en la misma RPC transaccional
 * (`fn_importar_productos_lote`) que un archivo o el scraping con IA.
 *
 * El `Lector` real (con guarda SSRF, timeout, reintentos y pausas) vive en
 * `src/lib/services/catalogoWebService.ts`; las pruebas le pasan uno falso con
 * respuestas de ejemplo.
 */

import type { ProductoWeb } from '../web';

export const PLATAFORMAS = ['shopify', 'woocommerce', 'vtex', 'magento', 'prestashop', 'generica'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

/**
 * Plataformas que se reconocen por el HTML pero no exponen un catálogo JSON
 * público estable: se leen por el sitemap + JSON-LD (`generica`).
 */
export const PLATAFORMAS_SOLO_SITEMAP = ['tiendanube', 'jumpseller', 'wix', 'squarespace', 'bigcommerce'] as const;
export type PlataformaSitemap = (typeof PLATAFORMAS_SOLO_SITEMAP)[number];

/** Lo que se reconoce en el HTML (puede ser una plataforma sin catálogo público). */
export type PlataformaDetectada = Plataforma | PlataformaSitemap;

export interface RespuestaHttp {
  status: number;
  /** Cabeceras en minúsculas. */
  headers: Record<string, string>;
  texto: string;
  /** URL final tras las redirecciones. */
  url: string;
}

export interface OpcionesPeticion {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

/** Hace UNA petición. `null` = error de red, timeout o URL no permitida. */
export type Lector = (url: string, opciones?: OpcionesPeticion) => Promise<RespuestaHttp | null>;

/** Cursor opaco que cada conector entiende (viaja al cliente y vuelve). */
export type CursorCatalogo = Record<string, unknown>;

export interface SondeoCatalogo {
  plataforma: Plataforma;
  /** Origen efectivo (tras redirecciones: `tienda.myshopify.com` → dominio propio). */
  origen: string;
  /** Total de productos si la plataforma lo informa. */
  total?: number;
  /** Categorías / colecciones públicas. */
  categorias?: number;
  /** URLs de producto (solo `generica`: se leen por partes con `leerPaginasProducto`). */
  urlsProducto?: string[];
  /** Cursor de la primera página. */
  cursor: CursorCatalogo;
  /** Avisos para mostrar (códigos de `productosImportar.catalogo.avisos`). */
  avisos: string[];
}

export interface DeteccionCatalogo {
  /** Conector con el que se leerá el catálogo. */
  plataforma: Plataforma;
  /** Lo que delató el HTML (puede ser Wix, Tiendanube… que van por sitemap). */
  detectada: PlataformaDetectada | null;
  origen: string;
  /** ¿Hay catálogo legible sin IA? Si no, queda el análisis con IA de una página. */
  disponible: boolean;
  total?: number;
  categorias?: number;
  urlsProducto?: string[];
  cursor: CursorCatalogo;
  avisos: string[];
  /** La tienda es PrestaShop y su webservice necesita clave para leer el catálogo completo. */
  requiereClave?: boolean;
}

export interface PaginaCatalogo {
  productos: ProductoWeb[];
  /** `null` = fin del catálogo. */
  siguiente: CursorCatalogo | null;
  /** Productos leídos hasta ahora según la plataforma (para la barra de progreso). */
  leidos?: number;
  total?: number;
  avisos: string[];
}

export interface Conector {
  plataforma: Plataforma;
  sondear(lector: Lector, origen: string, clave?: string): Promise<SondeoCatalogo | null>;
  pagina(lector: Lector, origen: string, cursor: CursorCatalogo, clave?: string): Promise<PaginaCatalogo>;
}

/** Tope de productos de un catálogo en una importación (el asistente valida en el navegador). */
export const MAX_PRODUCTOS_CATALOGO = 20000;
/** Tope de URLs de producto que se toman de un sitemap. */
export const MAX_URLS_SITEMAP = 20000;
/** Páginas de producto por llamada en la lectura genérica. */
export const MAX_URLS_POR_LLAMADA = 12;
