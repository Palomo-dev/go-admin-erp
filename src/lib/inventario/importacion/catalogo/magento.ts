/**
 * Magento 2 / Adobe Commerce — GraphQL de la tienda (`POST /graphql`), que es
 * público para el catálogo desde la 2.3 (lo usa el propio frontend PWA). El
 * REST `/rest/V1/products` exige token de administrador y NO se usa.
 *
 * Productos configurables: cada `variants[].product` es una variante con su
 * SKU y precio; los nombres de las opciones salen de `configurable_options`.
 * Las existencias exactas no son públicas (solo `stock_status`).
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, Lector, PaginaCatalogo } from './tipos';
import { absoluta, esObjeto, htmlAPlano, leerJson, lista, minimo, numeroApi, texto } from './util';

const POR_PAGINA = 50;
const PAGINAS_POR_LLAMADA = 4;
const MAX_PAGINAS = 400;

const PRECIO = 'price_range { minimum_price { regular_price { value } final_price { value } } }';

export const CONSULTA_MAGENTO = `query Catalogo($pagina: Int!, $tamano: Int!) {
  products(filter: { price: { from: "0" } }, pageSize: $tamano, currentPage: $pagina) {
    total_count
    page_info { current_page total_pages }
    items {
      __typename id sku name url_key url_suffix stock_status
      description { html }
      categories { name level }
      ${PRECIO}
      media_gallery { url disabled }
      ... on ConfigurableProduct {
        configurable_options { attribute_code label }
        variants {
          attributes { code label }
          product { sku stock_status ${PRECIO} media_gallery { url disabled } }
        }
      }
    }
  }
}`;

function preciosDe(p: Record<string, unknown>): { precio?: number; regular?: number } {
  const min = esObjeto(p.price_range) && esObjeto(p.price_range.minimum_price) ? p.price_range.minimum_price : {};
  const valor = (x: unknown) => (esObjeto(x) ? numeroApi(x.value) : undefined);
  return { precio: valor(min.final_price), regular: valor(min.regular_price) };
}

function imagenes(p: Record<string, unknown>, origen: string): string[] {
  return lista(p.media_gallery)
    .filter(esObjeto)
    .filter((m) => m.disabled !== true)
    .map((m) => absoluta(m.url, origen))
    .filter((s): s is string => !!s);
}

export function mapearProductoMagento(p: unknown, origen: string): ProductoWeb | null {
  if (!esObjeto(p)) return null;
  const nombre = texto(p.name);
  if (!nombre) return null;
  const { precio, regular } = preciosDe(p);
  const etiquetas = new Map(
    lista(p.configurable_options)
      .filter(esObjeto)
      .map((o) => [String(o.attribute_code ?? ''), texto(o.label, 80) ?? String(o.attribute_code ?? '')] as const),
  );
  const detalle: VarianteWeb[] = lista(p.variants)
    .filter(esObjeto)
    .map((v) => {
      const hijo = esObjeto(v.product) ? v.product : {};
      const opciones: Record<string, string> = {};
      for (const a of lista(v.attributes).filter(esObjeto)) {
        const codigo = String(a.code ?? '');
        const valor = texto(a.label, 100);
        if (codigo && valor) opciones[etiquetas.get(codigo) ?? codigo] = valor;
      }
      const pv = preciosDe(hijo);
      return {
        opciones,
        sku: texto(hijo.sku, 100),
        price: pv.precio,
        compare_price: pv.regular && pv.precio && pv.regular > pv.precio ? pv.regular : undefined,
        disponible: hijo.stock_status ? hijo.stock_status === 'IN_STOCK' : undefined,
        imagen: imagenes(hijo, origen)[0],
      };
    });
  const conVariantes = detalle.some((v) => Object.keys(v.opciones).length > 0);
  const categorias = lista(p.categories)
    .filter(esObjeto)
    .map((c) => ({ nombre: texto(c.name, 120), nivel: Number(c.level) || 0 }))
    .filter((c) => c.nombre)
    .sort((a, b) => b.nivel - a.nivel);
  const urlKey = texto(p.url_key, 200);
  const sufijo = typeof p.url_suffix === 'string' ? p.url_suffix : '.html';
  const precioFinal = conVariantes ? minimo(detalle.map((v) => v.price)) ?? precio : precio;
  return {
    name: nombre,
    description: esObjeto(p.description) ? htmlAPlano(p.description.html) : undefined,
    price: precioFinal,
    compare_price: !conVariantes && regular && precio && regular > precio ? regular : undefined,
    // El SKU del configurable es real en Magento: se conserva para el padre.
    sku: texto(p.sku, 100),
    category: categorias[0]?.nombre,
    images: imagenes(p, origen),
    url: urlKey ? `${origen}/${urlKey}${sufijo}` : undefined,
    origen_id: p.id !== undefined ? `magento:${p.id}` : p.sku ? `magento:${p.sku}` : undefined,
    variantes_detalle: conVariantes ? detalle : undefined,
    disponible: p.stock_status ? p.stock_status === 'IN_STOCK' : undefined,
  };
}

async function consultar(lector: Lector, origen: string, pagina: number, tamano: number) {
  const r = await leerJson(lector, `${origen}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CONSULTA_MAGENTO, variables: { pagina, tamano } }),
  });
  if (!r || !esObjeto(r.datos) || !esObjeto(r.datos.data) || !esObjeto(r.datos.data.products)) return undefined;
  const products = r.datos.data.products;
  const info = esObjeto(products.page_info) ? products.page_info : {};
  return { items: lista(products.items), total: Number(products.total_count) || 0, paginas: Number(info.total_pages) || 1 };
}

export const conectorMagento: Conector = {
  plataforma: 'magento',

  async sondear(lector, origen) {
    const r = await consultar(lector, origen, 1, 1);
    if (!r) return null;
    return { plataforma: 'magento', origen, total: r.total, cursor: { pagina: 1 }, avisos: ['magentoSinExistencias'] };
  },

  async pagina(lector, origen, cursor): Promise<PaginaCatalogo> {
    let pagina = Math.max(1, Number(cursor.pagina) || 1);
    const productos: ProductoWeb[] = [];
    let total: number | undefined;
    let fin = false;
    for (let k = 0; k < PAGINAS_POR_LLAMADA && pagina <= MAX_PAGINAS; k++, pagina++) {
      const r = await consultar(lector, origen, pagina, POR_PAGINA);
      if (!r) throw new Error(pagina === 1 ? 'CATALOGO_NO_DISPONIBLE' : 'PAGINA_FALLIDA');
      total = r.total;
      for (const crudo of r.items) {
        const p = mapearProductoMagento(crudo, origen);
        if (p) productos.push(p);
      }
      if (pagina >= r.paginas || r.items.length < POR_PAGINA) {
        fin = true;
        pagina++;
        break;
      }
    }
    const leidos = (Math.max(1, Number(cursor.pagina) || 1) - 1) * POR_PAGINA + productos.length;
    return { productos, siguiente: fin || pagina > MAX_PAGINAS ? null : { pagina }, leidos, total, avisos: !fin && pagina > MAX_PAGINAS ? ['catalogoTruncado'] : [] };
  },
};
