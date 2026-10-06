/**
 * VTEX — API pública del catálogo (sin clave):
 *   GET /api/catalog_system/pub/products/search?_from=0&_to=49[&fq=C:/1/10/]
 *       responde 200/206 con la cabecera `resources: 0-49/1234` (total)
 *   GET /api/catalog_system/pub/category/tree/3
 *
 * VTEX no deja pasar de `_from` 2 500 en una misma consulta: si el catálogo es
 * más grande se recorre por departamento y, si uno solo supera el tope, por
 * sus subcategorías. Un producto puede salir en dos consultas: la fusión del
 * asistente lo deduplica por su `productId`.
 *
 * Cada SKU (`items[]`) es una variante con su precio (`commertialOffer.Price`),
 * su precio de lista (`ListPrice`), su EAN, su RefId y sus existencias
 * publicadas (`AvailableQuantity`).
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, Lector, PaginaCatalogo } from './tipos';
import { absoluta, conParametros, esObjeto, htmlAPlano, leerJson, lista, minimo, numeroApi, texto } from './util';

const PASO = 50;
const TOPE_VTEX = 2500;
const PAGINAS_POR_LLAMADA = 8;

interface Cola {
  fq: string;
  ruta: number[];
}

export function totalDeRecursos(cabecera: string | undefined): number | undefined {
  const m = (cabecera ?? '').match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : undefined;
}

function refId(item: Record<string, unknown>): string | undefined {
  for (const r of lista(item.referenceId).filter(esObjeto)) {
    if (String(r.Key ?? '').toLowerCase() === 'refid') return texto(r.Value, 100);
  }
  return undefined;
}

function ofertaDe(item: Record<string, unknown>): Record<string, unknown> {
  const vendedores = lista(item.sellers).filter(esObjeto);
  const v = vendedores.find((s) => s.sellerDefault === true) ?? vendedores[0];
  return v && esObjeto(v.commertialOffer) ? v.commertialOffer : {};
}

export function mapearProductoVtex(p: unknown, origen: string): ProductoWeb | null {
  if (!esObjeto(p)) return null;
  const nombre = texto(p.productName);
  if (!nombre) return null;
  const items = lista(p.items).filter(esObjeto);
  const detalle: VarianteWeb[] = items.map((it) => {
    const oferta = ofertaDe(it);
    const precio = numeroApi(oferta.Price);
    const lista_ = numeroApi(oferta.ListPrice) ?? numeroApi(oferta.PriceWithoutDiscount);
    const opciones: Record<string, string> = {};
    for (const n of lista(it.variations)) {
      const nombreOpcion = texto(n, 80);
      const valor = nombreOpcion ? texto(lista(it[nombreOpcion])[0], 100) : undefined;
      if (nombreOpcion && valor) opciones[nombreOpcion] = valor;
    }
    const cantidad = Number(oferta.AvailableQuantity);
    return {
      opciones,
      origen_id: it.itemId !== undefined ? String(it.itemId) : undefined,
      sku: refId(it),
      barcode: texto(it.ean, 60),
      price: precio,
      compare_price: lista_ && precio && lista_ > precio ? lista_ : undefined,
      disponible: typeof oferta.IsAvailable === 'boolean' ? oferta.IsAvailable : cantidad > 0,
      existencias: Number.isFinite(cantidad) && cantidad >= 0 ? cantidad : undefined,
      imagen: absoluta(esObjeto(lista(it.images)[0]) ? (lista(it.images)[0] as Record<string, unknown>).imageUrl : undefined, origen),
    };
  });
  const conVariantes = items.length > 1 && detalle.some((v) => Object.keys(v.opciones).length > 0);
  const unico = detalle[0];
  const precio = minimo(detalle.map((v) => v.price));
  const masBarata = detalle.find((v) => v.price === precio);
  const imagenes = Array.from(
    new Set(
      items.flatMap((it) =>
        lista(it.images)
          .filter(esObjeto)
          .map((im) => absoluta(im.imageUrl, origen))
          .filter((s): s is string => !!s),
      ),
    ),
  );
  // `categories` va de la más específica a la más general: «/Dept/Cat/Sub/».
  const ruta = texto(lista(p.categories)[0], 300);
  const categoria = ruta ? ruta.split('/').map((s) => s.trim()).filter(Boolean).pop() : undefined;
  return {
    name: nombre,
    description: htmlAPlano(p.description) ?? htmlAPlano(p.metaTagDescription),
    price: precio,
    compare_price: masBarata?.compare_price,
    sku: conVariantes ? undefined : unico?.sku ?? texto(p.productReference, 100),
    barcode: conVariantes ? undefined : unico?.barcode,
    brand: texto(p.brand, 100),
    category: categoria,
    images: imagenes,
    url: absoluta(p.link, origen),
    origen_id: p.productId !== undefined ? `vtex:${p.productId}` : undefined,
    variantes_detalle: conVariantes ? detalle : undefined,
    disponible: detalle.some((v) => v.disponible !== false),
    existencias: conVariantes ? undefined : unico?.existencias,
  };
}

interface NodoCategoria {
  id: number;
  hijos: NodoCategoria[];
}

function nodos(v: unknown): NodoCategoria[] {
  return lista(v)
    .filter(esObjeto)
    .map((n) => ({ id: Number(n.id), hijos: nodos(n.children) }))
    .filter((n) => Number.isInteger(n.id) && n.id > 0);
}

async function arbol(lector: Lector, origen: string): Promise<NodoCategoria[]> {
  const r = await leerJson(lector, `${origen}/api/catalog_system/pub/category/tree/3`);
  return r ? nodos(r.datos) : [];
}

function contar(n: NodoCategoria[]): number {
  return n.reduce((s, x) => s + 1 + contar(x.hijos), 0);
}

function buscar(raiz: NodoCategoria[], ruta: number[]): NodoCategoria | undefined {
  let nivel = raiz;
  let nodo: NodoCategoria | undefined;
  for (const id of ruta) {
    nodo = nivel.find((n) => n.id === id);
    if (!nodo) return undefined;
    nivel = nodo.hijos;
  }
  return nodo;
}

const colaDe = (ruta: number[]): Cola => ({ fq: `C:/${ruta.join('/')}/`, ruta });

async function consultar(lector: Lector, origen: string, cola: Cola, desde: number): Promise<{ lote: unknown[]; total?: number } | undefined> {
  const params: Record<string, string | number> = { _from: desde, _to: desde + PASO - 1 };
  if (cola.fq) params.fq = cola.fq;
  const r = await leerJson(lector, conParametros(`${origen}/api/catalog_system/pub/products/search`, params));
  if (!r || !Array.isArray(r.datos)) return undefined;
  return { lote: r.datos, total: totalDeRecursos(r.respuesta.headers.resources) };
}

function leerColas(v: unknown): Cola[] {
  return lista(v)
    .filter(esObjeto)
    .map((c) => ({ fq: typeof c.fq === 'string' ? c.fq.slice(0, 80) : '', ruta: lista(c.ruta).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 4) }))
    .filter((c) => c.fq === '' || /^C:\/[\d/]+\/$/.test(c.fq))
    .slice(0, 500);
}

export const conectorVtex: Conector = {
  plataforma: 'vtex',

  async sondear(lector, origen) {
    const r = await consultar(lector, origen, { fq: '', ruta: [] }, 0);
    if (!r) return null;
    const categorias = await arbol(lector, origen);
    const total = r.total;
    // Más de 2 500: se recorre por departamento desde el principio.
    const colas: Cola[] = total !== undefined && total > TOPE_VTEX && categorias.length > 0 ? categorias.map((n) => colaDe([n.id])) : [{ fq: '', ruta: [] }];
    return { plataforma: 'vtex', origen, total, categorias: contar(categorias), cursor: { colas, desde: 0, leidos: 0 }, avisos: [] };
  },

  async pagina(lector, origen, cursor): Promise<PaginaCatalogo> {
    const colas = leerColas(cursor.colas);
    let desde = Math.max(0, Number(cursor.desde) || 0);
    let leidos = Math.max(0, Number(cursor.leidos) || 0);
    const productos: ProductoWeb[] = [];
    const avisos: string[] = [];
    let arbolCache: NodoCategoria[] | null = null;

    for (let peticiones = 0; peticiones < PAGINAS_POR_LLAMADA && colas.length > 0; peticiones++) {
      const cola = colas[0];
      const r = await consultar(lector, origen, cola, desde);
      if (!r) {
        if (leidos === 0 && desde === 0 && productos.length === 0 && cola.fq === '') throw new Error('CATALOGO_NO_DISPONIBLE');
        // A mitad de una categoría: se reintenta el cursor. Al empezar una, se salta (filtro no admitido).
        if (desde > 0) throw new Error('PAGINA_FALLIDA');
        colas.shift();
        continue;
      }
      // Primera página de una categoría con más de 2 500: se parte en subcategorías.
      if (desde === 0 && r.total !== undefined && r.total > TOPE_VTEX && cola.ruta.length > 0) {
        arbolCache ??= await arbol(lector, origen);
        const nodo = buscar(arbolCache, cola.ruta);
        if (nodo && nodo.hijos.length > 0) {
          colas.splice(0, 1, ...nodo.hijos.map((h) => colaDe([...cola.ruta, h.id])));
          continue;
        }
        if (!avisos.includes('catalogoTruncado')) avisos.push('catalogoTruncado');
      }
      for (const crudo of r.lote) {
        const p = mapearProductoVtex(crudo, origen);
        if (p) productos.push(p);
      }
      leidos += r.lote.length;
      desde += PASO;
      const totalCola = Math.min(r.total ?? Infinity, TOPE_VTEX);
      if (r.lote.length < PASO || desde >= totalCola) {
        if (cola.fq === '' && r.total !== undefined && r.total > TOPE_VTEX && !avisos.includes('catalogoTruncado')) avisos.push('catalogoTruncado');
        colas.shift();
        desde = 0;
      }
    }
    return { productos, siguiente: colas.length ? { colas, desde, leidos } : null, leidos, avisos };
  },
};
