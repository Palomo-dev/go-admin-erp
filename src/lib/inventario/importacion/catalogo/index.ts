/**
 * Conectores de catálogo por plataforma. El orden de `ORDEN_SONDEO` es el que
 * se prueba cuando el HTML no delata la plataforma: primero los endpoints más
 * baratos y comunes; la lectura genérica (sitemap + JSON-LD) siempre al final.
 */

import { conectorGenerico } from './generica';
import { conectorMagento } from './magento';
import { conectorPrestashop } from './prestashop';
import { conectorShopify } from './shopify';
import { conectorVtex } from './vtex';
import { conectorWooCommerce } from './woocommerce';
import type { Conector, Plataforma, PlataformaDetectada } from './tipos';

export const CONECTORES: Record<Plataforma, Conector> = {
  shopify: conectorShopify,
  woocommerce: conectorWooCommerce,
  vtex: conectorVtex,
  magento: conectorMagento,
  prestashop: conectorPrestashop,
  generica: conectorGenerico,
};

export const ORDEN_SONDEO: Plataforma[] = ['shopify', 'woocommerce', 'vtex', 'magento'];

/**
 * Conectores con API pública a probar: los que sugiere el HTML primero, luego
 * el resto. Ni la genérica (va al final aparte) ni PrestaShop (solo con clave).
 */
export function ordenDeSondeo(detectadas: PlataformaDetectada[]): Plataforma[] {
  const conApi = detectadas.filter((p): p is Plataforma => (ORDEN_SONDEO as string[]).includes(p));
  // Si el HTML delata una plataforma SIN API pública (Wix, Tiendanube,
  // PrestaShop sin clave…), no se martilla la tienda con sondeos de otras: va
  // directo al sitemap.
  if (detectadas.length > 0 && conApi.length === 0) return [];
  return Array.from(new Set([...conApi, ...ORDEN_SONDEO]));
}

export { detectarPlataforma } from './deteccion';
export { fusionarCatalogo, resolverSkusRepetidos, resumenCatalogo, claveCategoria, type ResumenCatalogo } from './deduplicacion';
export { leerPaginasProducto, productoDesdeHtml } from './generica';
export * from './tipos';
