/**
 * PrestaShop — Webservice (`/api/…`), que SIEMPRE exige una clave creada por
 * el dueño de la tienda (Parámetros avanzados › Webservice, permiso GET sobre
 * products, combinations, categories, product_options y product_option_values).
 * Sin clave, la tienda se lee por el sitemap + JSON-LD (`generica`).
 *
 * La clave llega en cada petición del asistente, se manda a la tienda en la
 * cabecera `Authorization` (no en la URL, para que no quede en registros) y no
 * se guarda en ningún lado.
 *
 * Ojo: `price` del webservice es el precio SIN impuestos; las combinaciones
 * guardan el impacto sobre ese precio. Se avisa en la vista previa.
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, Lector, OpcionesPeticion, PaginaCatalogo } from './tipos';
import { conParametros, esObjeto, htmlAPlano, leerJson, lista, minimo, numeroApi, texto } from './util';

const POR_PAGINA = 100;
const PAGINAS_POR_LLAMADA = 2;
const MAX_PAGINAS = 200;

type Modo = 'api' | 'dispatcher';

function url(origen: string, modo: Modo, recurso: string, params: Record<string, string | number>): string {
  const base = modo === 'dispatcher' ? `${origen}/webservice/dispatcher.php?url=${recurso}` : `${origen}/api/${recurso}`;
  return conParametros(base, { output_format: 'JSON', ...params });
}

function autorizacion(clave: string): OpcionesPeticion {
  const b64 = typeof btoa === 'function' ? btoa(`${clave}:`) : Buffer.from(`${clave}:`).toString('base64');
  return { headers: { Authorization: `Basic ${b64}` } };
}

/** Campo multi-idioma: «texto» o `[{ id, value }]` → el primer valor no vacío. */
export function valorIdioma(v: unknown, max = 200): string | undefined {
  if (typeof v === 'string' || typeof v === 'number') return texto(v, max);
  for (const x of lista(v)) {
    const t = esObjeto(x) ? texto(x.value, max) : undefined;
    if (t) return t;
  }
  return undefined;
}

async function coleccion(lector: Lector, direccion: string, clave: string, nombre: string): Promise<Record<string, unknown>[] | undefined> {
  const r = await leerJson(lector, direccion, autorizacion(clave));
  if (!r) return undefined;
  // Una colección vacía llega como `[]`.
  if (Array.isArray(r.datos)) return [];
  return esObjeto(r.datos) ? lista(r.datos[nombre]).filter(esObjeto) : undefined;
}

interface Diccionarios {
  categorias: Record<string, string>;
  /** id de valor → [opción, valor] */
  valores: Record<string, [string, string]>;
}

async function diccionarios(lector: Lector, origen: string, modo: Modo, clave: string): Promise<Diccionarios> {
  const [cats, opciones, valores] = await Promise.all([
    coleccion(lector, url(origen, modo, 'categories', { display: '[id,name]' }), clave, 'categories'),
    coleccion(lector, url(origen, modo, 'product_options', { display: '[id,public_name,name]' }), clave, 'product_options'),
    coleccion(lector, url(origen, modo, 'product_option_values', { display: '[id,id_attribute_group,name]' }), clave, 'product_option_values'),
  ]);
  const categorias: Record<string, string> = {};
  for (const c of cats ?? []) {
    const n = valorIdioma(c.name, 120);
    if (n) categorias[String(c.id)] = n;
  }
  const grupos: Record<string, string> = {};
  for (const o of opciones ?? []) {
    const n = valorIdioma(o.public_name, 80) ?? valorIdioma(o.name, 80);
    if (n) grupos[String(o.id)] = n;
  }
  const dic: Diccionarios['valores'] = {};
  for (const v of valores ?? []) {
    const n = valorIdioma(v.name, 100);
    const g = grupos[String(v.id_attribute_group)];
    if (n && g) dic[String(v.id)] = [g, n];
  }
  return { categorias, valores: dic };
}

function asociaciones(p: Record<string, unknown>, nombre: string): string[] {
  const a = esObjeto(p.associations) ? p.associations : {};
  return lista(a[nombre])
    .filter(esObjeto)
    .map((x) => String(x.id ?? ''))
    .filter(Boolean);
}

const imagenPublica = (origen: string, id: string, enlace?: string) => `${origen}/${id}-large_default/${enlace || 'producto'}.jpg`;

export function mapearProductoPrestashop(p: unknown, origen: string, combinaciones: Record<string, unknown>[], dic: Diccionarios): ProductoWeb | null {
  if (!esObjeto(p)) return null;
  const nombre = valorIdioma(p.name);
  if (!nombre || String(p.active ?? '1') === '0') return null;
  const base = numeroApi(p.price);
  const enlace = valorIdioma(p.link_rewrite, 120);
  const imagenes = asociaciones(p, 'images').map((id) => imagenPublica(origen, id, enlace));
  const detalle: VarianteWeb[] = combinaciones.map((c) => {
    const opciones: Record<string, string> = {};
    for (const id of asociaciones(c, 'product_option_values')) {
      const par = dic.valores[id];
      if (par) opciones[par[0]] = par[1];
    }
    const impacto = Number(c.price) || 0;
    const precio = base !== undefined ? Math.max(0, base + impacto) : undefined;
    const cantidad = Number(c.quantity);
    const img = asociaciones(c, 'images')[0];
    return {
      opciones,
      origen_id: String(c.id ?? ''),
      sku: texto(c.reference, 100),
      barcode: texto(c.ean13, 60),
      price: precio && precio > 0 ? precio : undefined,
      existencias: Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : undefined,
      imagen: img ? imagenPublica(origen, img, enlace) : undefined,
    };
  });
  const conVariantes = detalle.some((v) => Object.keys(v.opciones).length > 0);
  const cantidad = Number(p.quantity);
  return {
    name: nombre,
    description: htmlAPlano(valorIdioma(p.description, 20000)) ?? htmlAPlano(valorIdioma(p.description_short, 5000)),
    price: conVariantes ? minimo(detalle.map((v) => v.price)) ?? base : base,
    sku: texto(p.reference, 100),
    barcode: conVariantes ? undefined : texto(p.ean13, 60),
    brand: texto(p.manufacturer_name, 100),
    category: dic.categorias[String(p.id_category_default ?? '')],
    images: imagenes,
    url: enlace && p.id !== undefined ? `${origen}/index.php?id_product=${p.id}&controller=product` : undefined,
    origen_id: p.id !== undefined ? `prestashop:${p.id}` : undefined,
    variantes_detalle: conVariantes ? detalle : undefined,
    existencias: !conVariantes && Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : undefined,
  };
}

export const conectorPrestashop: Conector = {
  plataforma: 'prestashop',

  async sondear(lector, origen, clave) {
    if (!clave) return null;
    for (const modo of ['api', 'dispatcher'] as const) {
      const ids = await coleccion(lector, url(origen, modo, 'products', { display: '[id]' }), clave, 'products');
      if (!ids) continue;
      const dic = await diccionarios(lector, origen, modo, clave);
      return {
        plataforma: 'prestashop',
        origen,
        total: ids.length,
        categorias: Object.keys(dic.categorias).length,
        cursor: { modo, pagina: 1 },
        avisos: ['prestashopSinImpuestos'],
      };
    }
    return null;
  },

  async pagina(lector, origen, cursor, clave): Promise<PaginaCatalogo> {
    if (!clave) throw new Error('CLAVE_REQUERIDA');
    const modo: Modo = cursor.modo === 'dispatcher' ? 'dispatcher' : 'api';
    const dic = await diccionarios(lector, origen, modo, clave);
    let pagina = Math.max(1, Number(cursor.pagina) || 1);
    const productos: ProductoWeb[] = [];
    let fin = false;
    for (let k = 0; k < PAGINAS_POR_LLAMADA && pagina <= MAX_PAGINAS; k++, pagina++) {
      const lote = await coleccion(lector, url(origen, modo, 'products', { display: 'full', limit: `${(pagina - 1) * POR_PAGINA},${POR_PAGINA}` }), clave, 'products');
      if (!lote) throw new Error(pagina === 1 ? 'CATALOGO_NO_DISPONIBLE' : 'PAGINA_FALLIDA');
      const conCombinaciones = lote.filter((p) => asociaciones(p, 'combinations').length > 0).map((p) => String(p.id));
      const porProducto = new Map<string, Record<string, unknown>[]>();
      for (let i = 0; i < conCombinaciones.length; i += 50) {
        const combos = await coleccion(
          lector,
          url(origen, modo, 'combinations', { display: 'full', 'filter[id_product]': `[${conCombinaciones.slice(i, i + 50).join('|')}]` }),
          clave,
          'combinations',
        );
        for (const c of combos ?? []) {
          const id = String(c.id_product ?? '');
          porProducto.set(id, [...(porProducto.get(id) ?? []), c]);
        }
      }
      for (const crudo of lote) {
        const p = mapearProductoPrestashop(crudo, origen, porProducto.get(String(crudo.id)) ?? [], dic);
        if (p) productos.push(p);
      }
      if (lote.length < POR_PAGINA) {
        fin = true;
        pagina++;
        break;
      }
    }
    const leidos = (Math.max(1, Number(cursor.pagina) || 1) - 1) * POR_PAGINA + productos.length;
    return { productos, siguiente: fin || pagina > MAX_PAGINAS ? null : { modo, pagina }, leidos, avisos: !fin && pagina > MAX_PAGINAS ? ['catalogoTruncado'] : [] };
  },
};
