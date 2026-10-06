/**
 * Shopify — catálogo público de la tienda (sin clave):
 *   GET /products.json?limit=250&page=N        productos con variantes, opciones e imágenes
 *   GET /collections.json?limit=250&page=N     colecciones
 *   GET /collections/<handle>/products.json    productos de una colección
 *
 * Lo que Shopify NO publica: existencias (solo `available`), costo ni código
 * de barras en todas las versiones. La categoría es el «tipo de producto»; si
 * falta, se usa la primera colección (no automática) que lo contiene.
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, CursorCatalogo, Lector, PaginaCatalogo } from './tipos';
import { absoluta, esObjeto, htmlAPlano, leerJson, lista, minimo, numeroApi, texto } from './util';

const POR_PAGINA = 250;
/** Páginas de 250 por llamada al servidor (≈ 1 000 productos). */
const PAGINAS_POR_LLAMADA = 4;
const MAX_PAGINAS = 200;
const MAX_COLECCIONES = 60;
const MAX_PAGINAS_POR_COLECCION = 8;

const OPCION_POR_DEFECTO = /^(title|título|titulo)$/i;
const VALOR_POR_DEFECTO = /^default title$/i;

function etiquetas(v: unknown): string[] | undefined {
  const crudas = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out = crudas.map((t) => texto(t, 80)).filter((t): t is string => !!t).slice(0, 20);
  return out.length ? out : undefined;
}

export function mapearProductoShopify(p: unknown, origen: string): ProductoWeb | null {
  if (!esObjeto(p)) return null;
  const nombre = texto(p.title);
  if (!nombre) return null;
  const opciones = lista(p.options)
    .filter(esObjeto)
    .map((o) => ({ nombre: texto(o.name, 80) ?? '', valores: lista(o.values).map((x) => texto(x, 100) ?? '') }))
    .filter((o) => o.nombre && !(OPCION_POR_DEFECTO.test(o.nombre) && o.valores.every((x) => VALOR_POR_DEFECTO.test(x))));
  const variantes = lista(p.variants).filter(esObjeto);
  const imagenes = lista(p.images)
    .filter(esObjeto)
    .map((im) => absoluta(im.src, origen))
    .filter((s): s is string => !!s);

  const detalle: VarianteWeb[] = variantes.map((v) => {
    const precio = numeroApi(v.price);
    const comparacion = numeroApi(v.compare_at_price);
    const valores: Record<string, string> = {};
    opciones.forEach((o, i) => {
      const valor = texto(v[`option${i + 1}`], 100);
      if (valor) valores[o.nombre] = valor;
    });
    return {
      opciones: valores,
      origen_id: v.id !== undefined ? String(v.id) : undefined,
      sku: texto(v.sku, 100),
      barcode: texto(v.barcode, 60),
      price: precio,
      compare_price: comparacion && precio && comparacion > precio ? comparacion : undefined,
      disponible: typeof v.available === 'boolean' ? v.available : undefined,
      imagen: esObjeto(v.featured_image) ? absoluta(v.featured_image.src, origen) : undefined,
    };
  });

  const unica = opciones.length === 0 || detalle.length <= 1;
  const precio = minimo(detalle.map((v) => v.price));
  const masBarata = detalle.find((v) => v.price === precio);
  const handle = texto(p.handle, 200);
  return {
    name: nombre,
    description: htmlAPlano(p.body_html),
    price: precio,
    compare_price: masBarata?.compare_price,
    sku: unica ? detalle[0]?.sku : undefined,
    barcode: unica ? detalle[0]?.barcode : undefined,
    brand: texto(p.vendor, 100),
    category: texto(p.product_type, 120),
    tags: etiquetas(p.tags),
    images: imagenes,
    url: handle ? `${origen}/products/${handle}` : undefined,
    origen_id: p.id !== undefined ? `shopify:${p.id}` : undefined,
    variantes_detalle: unica ? undefined : detalle,
    disponible: detalle.length ? detalle.some((v) => v.disponible !== false) : undefined,
  };
}

async function leerPaginaProductos(lector: Lector, url: string): Promise<unknown[] | undefined> {
  const r = await leerJson(lector, url);
  if (!r || !esObjeto(r.datos) || !Array.isArray(r.datos.products)) return undefined;
  return r.datos.products;
}

async function colecciones(lector: Lector, origen: string): Promise<{ handle: string; titulo: string }[]> {
  const out: { handle: string; titulo: string }[] = [];
  for (let pagina = 1; pagina <= 4 && out.length < MAX_COLECCIONES; pagina++) {
    const r = await leerJson(lector, `${origen}/collections.json?limit=${POR_PAGINA}&page=${pagina}`);
    const lote = r && esObjeto(r.datos) ? lista(r.datos.collections).filter(esObjeto) : [];
    for (const c of lote) {
      const handle = texto(c.handle, 200);
      const titulo = texto(c.title, 120);
      // «all»/«frontpage» no son categorías.
      if (handle && titulo && !/^(all|frontpage|todos?|inicio|home)$/i.test(handle)) out.push({ handle, titulo });
    }
    if (lote.length < POR_PAGINA) break;
  }
  return out.slice(0, MAX_COLECCIONES);
}

export const conectorShopify: Conector = {
  plataforma: 'shopify',

  async sondear(lector, origen) {
    const r = await leerJson(lector, `${origen}/products.json?limit=1`);
    if (!r || !esObjeto(r.datos) || !Array.isArray(r.datos.products)) return null;
    const efectivo = new URL(r.respuesta.url || origen).origin;
    const cols = await colecciones(lector, efectivo);
    return { plataforma: 'shopify', origen: efectivo, categorias: cols.length, cursor: { fase: 'productos', pagina: 1, sinTipo: 0 }, avisos: ['shopifySinExistencias'] };
  },

  async pagina(lector, origen, cursor): Promise<PaginaCatalogo> {
    const productos: ProductoWeb[] = [];
    const fase = cursor.fase === 'colecciones' ? 'colecciones' : 'productos';

    if (fase === 'productos') {
      let pagina = Math.max(1, Number(cursor.pagina) || 1);
      let sinTipo = Number(cursor.sinTipo) || 0;
      let fin = false;
      for (let k = 0; k < PAGINAS_POR_LLAMADA && pagina <= MAX_PAGINAS; k++, pagina++) {
        const lote = await leerPaginaProductos(lector, `${origen}/products.json?limit=${POR_PAGINA}&page=${pagina}`);
        // Una página que falla a mitad del catálogo NO es el final: el asistente reintenta este cursor.
        if (!lote) throw new Error(pagina === 1 ? 'CATALOGO_NO_DISPONIBLE' : 'PAGINA_FALLIDA');
        for (const crudo of lote) {
          const p = mapearProductoShopify(crudo, origen);
          if (!p) continue;
          if (!p.category) sinTipo++;
          productos.push(p);
        }
        if (lote.length < POR_PAGINA) {
          fin = true;
          pagina++;
          break;
        }
      }
      const leidosAntes = (Math.max(1, Number(cursor.pagina) || 1) - 1) * POR_PAGINA;
      if (!fin && pagina <= MAX_PAGINAS) {
        return { productos, siguiente: { fase: 'productos', pagina, sinTipo }, leidos: leidosAntes + productos.length, avisos: [] };
      }
      const avisos = pagina > MAX_PAGINAS ? ['catalogoTruncado'] : [];
      // Sin tipo de producto: la colección hace de categoría (la lista viaja en el cursor).
      const cols = sinTipo > 0 ? await colecciones(lector, origen) : [];
      const siguiente: CursorCatalogo | null = cols.length > 0 ? { fase: 'colecciones', cols: cols.map((c) => [c.handle, c.titulo]), indice: 0, pagina: 1 } : null;
      return { productos, siguiente, leidos: leidosAntes + productos.length, avisos };
    }

    // ── Colecciones como categoría de los productos sin tipo ───────────────
    const cols = lista(cursor.cols)
      .filter((c): c is unknown[] => Array.isArray(c))
      .map((c) => ({ handle: texto(c[0], 200) ?? '', titulo: texto(c[1], 120) ?? '' }))
      .filter((c) => c.handle && c.titulo)
      .slice(0, MAX_COLECCIONES);
    let indice = Math.max(0, Number(cursor.indice) || 0);
    let pagina = Math.max(1, Number(cursor.pagina) || 1);
    for (let peticiones = 0; peticiones < PAGINAS_POR_LLAMADA && indice < cols.length; peticiones++) {
      const c = cols[indice];
      const lote = await leerPaginaProductos(lector, `${origen}/collections/${encodeURIComponent(c.handle)}/products.json?limit=${POR_PAGINA}&page=${pagina}`);
      for (const crudo of lote ?? []) {
        const p = mapearProductoShopify(crudo, origen);
        // Solo completa la categoría: la fusión no pisa la que ya trae el producto.
        if (p) productos.push({ ...p, category: p.category || c.titulo });
      }
      if (!lote || lote.length < POR_PAGINA || pagina >= MAX_PAGINAS_POR_COLECCION) {
        indice++;
        pagina = 1;
      } else {
        pagina++;
      }
    }
    return { productos, siguiente: indice < cols.length ? { fase: 'colecciones', cols: cursor.cols, indice, pagina } : null, avisos: [] };
  },
};
