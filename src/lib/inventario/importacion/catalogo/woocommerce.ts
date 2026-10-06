/**
 * WooCommerce — Store API pública (sin clave), la que usa el propio carrito:
 *   GET /wp-json/wc/store/v1/products?per_page=100&page=N      (X-WP-Total, X-WP-TotalPages)
 *   GET /wp-json/wc/store/v1/products?type=variation&parent=1,2&per_page=100
 *   GET /wp-json/wc/store/v1/products/categories
 * Sin enlaces permanentes la misma API responde en `/?rest_route=/wc/store/v1/…`.
 *
 * Diferencias con el lector anterior de la Edge Function: usa la ruta con
 * versión (`/wc/store/products` sin versión está obsoleta), lee los atributos
 * por `has_variations`/`terms` (antes buscaba `variation`/`options`, que la
 * API no devuelve, y ninguna variante llegaba) y trae cada variación con su
 * SKU y precio. Las existencias exactas no son públicas: no se inventan.
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, Lector, PaginaCatalogo } from './tipos';
import { absoluta, conParametros, desdeUnidadesMenores, esObjeto, htmlAPlano, leerJson, lista, minimo, texto } from './util';

const POR_PAGINA = 100;
const PAGINAS_POR_LLAMADA = 3;
const MAX_PAGINAS = 200;
const MAX_PAGINAS_VARIACIONES = 10;

type Categorias = Record<string, [string, number]>;

function precios(p: Record<string, unknown>): { precio?: number; regular?: number } {
  const pr = esObjeto(p.prices) ? p.prices : {};
  const d = pr.currency_minor_unit;
  const rango = esObjeto(pr.price_range) ? pr.price_range : null;
  const precio = desdeUnidadesMenores(pr.price, d) ?? (rango ? desdeUnidadesMenores(rango.min_amount, d) : undefined);
  const regular = desdeUnidadesMenores(pr.regular_price, d);
  return { precio, regular };
}

/** La categoría más profunda del producto (la que no es padre de otra de sus categorías). */
export function categoriaMasProfunda(cats: unknown[], arbol: Categorias): string | undefined {
  const propias = cats.filter(esObjeto).map((c) => ({ id: String(c.id ?? ''), nombre: texto(c.name, 120) })).filter((c) => c.nombre);
  if (propias.length === 0) return undefined;
  const padres = new Set(propias.map((c) => String(arbol[c.id]?.[1] ?? '')));
  const hoja = propias.find((c) => !padres.has(c.id));
  return (hoja ?? propias[0]).nombre;
}

export function mapearProductoWoo(p: unknown, origen: string, variaciones: Map<string, Record<string, unknown>>, arbol: Categorias = {}): ProductoWeb | null {
  if (!esObjeto(p)) return null;
  const nombre = texto(p.name);
  if (!nombre) return null;
  const { precio, regular } = precios(p);
  const imagenes = lista(p.images)
    .filter(esObjeto)
    .map((im) => absoluta(im.src, origen))
    .filter((s): s is string => !!s);
  const descripcion = htmlAPlano(p.description) ?? htmlAPlano(p.short_description);

  // Slug del término → nombre visible, por atributo.
  const atributos = lista(p.attributes).filter(esObjeto);
  const terminos = new Map<string, Map<string, string>>();
  for (const a of atributos) {
    const etiqueta = texto(a.name, 80);
    if (!etiqueta) continue;
    const m = new Map<string, string>();
    for (const t of lista(a.terms).filter(esObjeto)) {
      const nombreT = texto(t.name, 100);
      if (nombreT) m.set(String(t.slug ?? nombreT).toLowerCase(), nombreT);
    }
    terminos.set(etiqueta.toLowerCase(), m);
  }

  const detalle: VarianteWeb[] = [];
  for (const v of lista(p.variations).filter(esObjeto)) {
    const opciones: Record<string, string> = {};
    for (const a of lista(v.attributes).filter(esObjeto)) {
      const etiqueta = texto(a.name, 80);
      const valor = texto(a.value, 100);
      // Valor vacío = «cualquiera» en WooCommerce: no es una opción concreta.
      if (!etiqueta || !valor) continue;
      opciones[etiqueta] = terminos.get(etiqueta.toLowerCase())?.get(valor.toLowerCase()) ?? valor;
    }
    const datos = variaciones.get(String(v.id));
    const pv = datos ? precios(datos) : {};
    detalle.push({
      opciones,
      origen_id: v.id !== undefined ? String(v.id) : undefined,
      sku: datos ? texto(datos.sku, 100) : undefined,
      price: pv.precio,
      compare_price: pv.regular && pv.precio && pv.regular > pv.precio ? pv.regular : undefined,
      disponible: datos && typeof datos.is_in_stock === 'boolean' ? datos.is_in_stock : undefined,
      imagen: datos ? absoluta(esObjeto(lista(datos.images)[0]) ? (lista(datos.images)[0] as Record<string, unknown>).src : undefined, origen) : undefined,
    });
  }
  const conVariantes = detalle.some((v) => Object.keys(v.opciones).length > 0);
  const precioFinal = conVariantes ? minimo(detalle.map((v) => v.price)) ?? precio : precio;
  const marca = esObjeto(lista(p.brands)[0]) ? texto((lista(p.brands)[0] as Record<string, unknown>).name, 100) : undefined;
  const tags = lista(p.tags)
    .filter(esObjeto)
    .map((t) => texto(t.name, 80))
    .filter((t): t is string => !!t)
    .slice(0, 20);
  return {
    name: nombre,
    description: descripcion,
    price: precioFinal,
    compare_price: !conVariantes && regular && precio && regular > precio ? regular : undefined,
    sku: texto(p.sku, 100),
    brand: marca,
    category: categoriaMasProfunda(lista(p.categories), arbol),
    tags: tags.length ? tags : undefined,
    images: imagenes,
    url: absoluta(p.permalink, origen),
    origen_id: p.id !== undefined ? `woo:${p.id}` : undefined,
    variantes_detalle: conVariantes ? detalle : undefined,
    disponible: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : undefined,
  };
}

/** Base de la API: `/wp-json/wc/store/v1` o `/?rest_route=/wc/store/v1`. */
function base(origen: string, modo: unknown): string {
  return modo === 'rest_route' ? `${origen}/?rest_route=/wc/store/v1` : `${origen}/wp-json/wc/store/v1`;
}

async function leerCategorias(lector: Lector, raiz: string): Promise<Categorias> {
  const arbol: Categorias = {};
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = await leerJson(lector, conParametros(`${raiz}/products/categories`, { per_page: 100, page: pagina }));
    const lote = r && Array.isArray(r.datos) ? r.datos.filter(esObjeto) : [];
    for (const c of lote) {
      const nombre = texto(c.name, 120);
      if (nombre && c.id !== undefined) arbol[String(c.id)] = [nombre, Number(c.parent) || 0];
    }
    if (lote.length < 100) break;
  }
  return arbol;
}

async function leerVariaciones(lector: Lector, raiz: string, padres: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  // De a 20 padres por consulta para no alargar la URL.
  for (let i = 0; i < padres.length; i += 20) {
    const grupo = padres.slice(i, i + 20).join(',');
    for (let pagina = 1; pagina <= MAX_PAGINAS_VARIACIONES; pagina++) {
      const r = await leerJson(lector, conParametros(`${raiz}/products`, { type: 'variation', parent: grupo, per_page: POR_PAGINA, page: pagina }));
      const lote = r && Array.isArray(r.datos) ? r.datos.filter(esObjeto) : [];
      for (const v of lote) out.set(String(v.id), v);
      if (lote.length < POR_PAGINA) break;
    }
  }
  return out;
}

export const conectorWooCommerce: Conector = {
  plataforma: 'woocommerce',

  async sondear(lector, origen) {
    for (const modo of ['wp_json', 'rest_route'] as const) {
      const raiz = base(origen, modo);
      const r = await leerJson(lector, conParametros(`${raiz}/products`, { per_page: 1 }));
      if (!r || !Array.isArray(r.datos)) continue;
      const total = Number(r.respuesta.headers['x-wp-total']);
      const arbol = await leerCategorias(lector, raiz);
      return {
        plataforma: 'woocommerce',
        origen,
        total: Number.isFinite(total) && total >= 0 ? total : undefined,
        categorias: Object.keys(arbol).length,
        cursor: { modo, pagina: 1 },
        avisos: ['wooSinExistencias'],
      };
    }
    return null;
  },

  async pagina(lector, origen, cursor): Promise<PaginaCatalogo> {
    const raiz = base(origen, cursor.modo);
    const arbol = await leerCategorias(lector, raiz);
    const productos: ProductoWeb[] = [];
    let pagina = Math.max(1, Number(cursor.pagina) || 1);
    let totalPaginas = Number(cursor.totalPaginas) || 0;
    let total: number | undefined = Number(cursor.total) || undefined;
    let fin = false;
    for (let k = 0; k < PAGINAS_POR_LLAMADA && pagina <= MAX_PAGINAS; k++, pagina++) {
      const direccion = conParametros(`${raiz}/products`, { per_page: POR_PAGINA, page: pagina });
      const r = await leerJson(lector, direccion);
      if (!r || !Array.isArray(r.datos)) {
        if (pagina === 1) throw new Error('CATALOGO_NO_DISPONIBLE');
        // WooCommerce responde 400 a una página que no existe: ese sí es el final.
        const estado = await lector(direccion);
        if (estado && estado.status === 400) {
          fin = true;
          break;
        }
        throw new Error('PAGINA_FALLIDA');
      }
      totalPaginas = Number(r.respuesta.headers['x-wp-totalpages']) || totalPaginas;
      total = Number(r.respuesta.headers['x-wp-total']) || total;
      const lote = r.datos.filter(esObjeto);
      const variables = lote.filter((p) => lista(p.variations).length > 0).map((p) => String(p.id));
      const variaciones = variables.length ? await leerVariaciones(lector, raiz, variables) : new Map();
      for (const crudo of lote) {
        const p = mapearProductoWoo(crudo, origen, variaciones, arbol);
        if (p) productos.push(p);
      }
      if (lote.length < POR_PAGINA || (totalPaginas && pagina >= totalPaginas)) {
        fin = true;
        pagina++;
        break;
      }
    }
    const leidos = (Math.max(1, Number(cursor.pagina) || 1) - 1) * POR_PAGINA + productos.length;
    const avisos = !fin && pagina > MAX_PAGINAS ? ['catalogoTruncado'] : [];
    return {
      productos,
      siguiente: fin || pagina > MAX_PAGINAS ? null : { modo: cursor.modo, pagina, totalPaginas, total },
      leidos,
      total,
      avisos,
    };
  },
};
