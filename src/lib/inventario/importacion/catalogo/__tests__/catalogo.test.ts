/// <reference types="jest" />
/**
 * Importación del catálogo completo por plataforma: mapeo a productos,
 * variantes, precios y categorías; paginación con cursor; deduplicación al
 * leer y al reimportar. Todo con respuestas de ejemplo inventadas (sin datos
 * de tiendas reales) y un lector falso: sin red.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { conectorShopify, mapearProductoShopify } from '../shopify';
import { categoriaMasProfunda, conectorWooCommerce, mapearProductoWoo } from '../woocommerce';
import { conectorVtex, mapearProductoVtex, totalDeRecursos } from '../vtex';
import { conectorMagento, mapearProductoMagento } from '../magento';
import { conectorPrestashop, mapearProductoPrestashop, valorIdioma } from '../prestashop';
import { descubrirUrlsProducto, leerPaginasProducto, locsDeSitemap, pareceUrlProducto, productoDesdeHtml, sitemapsDeRobots } from '../generica';
import { detectarPlataforma } from '../deteccion';
import { fusionarCatalogo, resolverSkusRepetidos, resumenCatalogo } from '../deduplicacion';
import { ordenDeSondeo } from '../index';
import { desdeUnidadesMenores, htmlAPlano, numeroApi } from '../util';
import type { Lector, RespuestaHttp } from '../tipos';
import { cantidadVariantes, productosWebAFilas, type ProductoWeb } from '../../web';
import { validarFilas } from '../../validacion';
import { filasAImportar } from '../../payload';
import { OPCIONES_POR_DEFECTO } from '../../tipos';

const fx = (nombre: string) => readFileSync(join(__dirname, 'fixtures', nombre), 'utf-8');
const fxJson = (nombre: string) => JSON.parse(fx(nombre));

type Ruta = { status?: number; json?: unknown; texto?: string; headers?: Record<string, string> } | null;

/** Lector falso: URL exacta (o función) → respuesta. Registra las URLs pedidas. */
function lectorFalso(rutas: Record<string, Ruta> | ((url: string, body?: string) => Ruta)) {
  const pedidas: string[] = [];
  const lector: Lector = async (url, op) => {
    pedidas.push(url);
    const r = typeof rutas === 'function' ? rutas(url, op?.body) : rutas[url];
    if (r === undefined) return { status: 404, headers: { 'content-type': 'text/html' }, texto: 'no', url };
    if (r === null) return null;
    const texto = r.texto ?? JSON.stringify(r.json);
    const headers = { 'content-type': r.json !== undefined ? 'application/json' : 'text/html', ...(r.headers ?? {}) };
    return { status: r.status ?? 200, headers, texto, url } as RespuestaHttp;
  };
  return { lector, pedidas };
}

describe('utilidades', () => {
  it('números de API en formato de máquina (no colombiano)', () => {
    expect(numeroApi('12.000')).toBe(12);
    expect(numeroApi('45000.00')).toBe(45000);
    expect(numeroApi(0)).toBeUndefined();
    expect(numeroApi('x')).toBeUndefined();
    expect(desdeUnidadesMenores('1500000', 2)).toBe(15000);
    expect(desdeUnidadesMenores('15000', 0)).toBe(15000);
  });
  it('HTML → texto con viñetas y entidades', () => {
    expect(htmlAPlano('<p>A &amp; B</p><ul><li>uno</li><li>dos</li></ul>')).toBe('A & B\n• uno\n• dos');
    expect(htmlAPlano('')).toBeUndefined();
  });
});

describe('Shopify', () => {
  const [camiseta, gorra] = fxJson('shopify-products.json').products;
  const origen = 'https://tienda-shopify.test';

  it('variantes reales con su SKU, precio, precio anterior e imagen', () => {
    const p = mapearProductoShopify(camiseta, origen)!;
    expect(p).toMatchObject({
      name: 'Camiseta Básica',
      price: 45000,
      compare_price: 60000,
      sku: undefined,
      brand: 'Marca Demo',
      category: 'Camisetas',
      tags: ['verano', 'algodon'],
      url: 'https://tienda-shopify.test/products/camiseta-basica',
      origen_id: 'shopify:1001',
      disponible: true,
    });
    expect(p.description).toBe('Algodón 100 %\n• Suave\n• Fresca');
    expect(p.images).toEqual(['https://cdn.ejemplo.test/cam-1.jpg', 'https://cdn.ejemplo.test/cam-2.jpg']);
    expect(p.variantes_detalle).toEqual([
      { opciones: { Talla: 'S', Color: 'Rojo' }, origen_id: '5001', sku: 'CAM-S-R', barcode: undefined, price: 45000, compare_price: 60000, disponible: true, imagen: 'https://cdn.ejemplo.test/cam-s.jpg' },
      { opciones: { Talla: 'M', Color: 'Rojo' }, origen_id: '5002', sku: 'CAM-M-R', barcode: undefined, price: 48000, compare_price: undefined, disponible: false, imagen: undefined },
    ]);
  });

  it('«Default Title» no es variante: el SKU y precio van al producto; la comparación menor se descarta', () => {
    const p = mapearProductoShopify(gorra, origen)!;
    expect(p).toMatchObject({ sku: 'GOR-01', price: 25000, compare_price: undefined, category: undefined, tags: ['accesorios', 'gorras'], variantes_detalle: undefined });
  });

  it('pagina de a 250 y, si hay productos sin tipo, completa la categoría con las colecciones', async () => {
    const muchos = Array.from({ length: 250 }, (_, i) => ({ ...gorra, id: 9000 + i, handle: `g-${i}`, title: `Gorra ${i}` }));
    const { lector, pedidas } = lectorFalso({
      [`${origen}/products.json?limit=250&page=1`]: { json: { products: muchos } },
      [`${origen}/products.json?limit=250&page=2`]: { json: { products: [camiseta] } },
      [`${origen}/collections.json?limit=250&page=1`]: { json: { collections: [{ handle: 'all', title: 'Todo' }, { handle: 'gorras', title: 'Gorras' }] } },
      [`${origen}/collections/gorras/products.json?limit=250&page=1`]: { json: { products: [muchos[0]] } },
    });
    const t1 = await conectorShopify.pagina(lector, origen, { fase: 'productos', pagina: 1, sinTipo: 0 });
    expect(t1.productos).toHaveLength(251);
    expect(t1.siguiente).toEqual({ fase: 'colecciones', cols: [['gorras', 'Gorras']], indice: 0, pagina: 1 });
    const t2 = await conectorShopify.pagina(lector, origen, t1.siguiente!);
    expect(t2.siguiente).toBeNull();
    expect(t2.productos[0]).toMatchObject({ origen_id: 'shopify:9000', category: 'Gorras' });
    // La colección completa la categoría en la fusión; no crea un duplicado.
    const { productos, repetidos } = fusionarCatalogo(t1.productos, t2.productos);
    expect(productos).toHaveLength(251);
    expect(repetidos).toBe(1);
    expect(productos[0].category).toBe('Gorras');
    expect(pedidas.filter((u) => u.includes('collections.json'))).toHaveLength(1);
  });

  it('una página que falla a mitad no se toma como fin del catálogo', async () => {
    const { lector } = lectorFalso({ [`${origen}/products.json?limit=250&page=3`]: null });
    await expect(conectorShopify.pagina(lector, origen, { fase: 'productos', pagina: 3 })).rejects.toThrow('PAGINA_FALLIDA');
  });

  it('el sondeo confirma el endpoint y sigue la redirección al dominio propio', async () => {
    const { lector } = lectorFalso((url) => {
      if (url === `${origen}/products.json?limit=1`) return { json: { products: [gorra] } };
      if (url.includes('collections.json')) return { json: { collections: [] } };
      return undefined as unknown as Ruta;
    });
    const s = await conectorShopify.sondear(lector, origen);
    expect(s).toMatchObject({ plataforma: 'shopify', origen, categorias: 0, cursor: { fase: 'productos', pagina: 1 } });
  });
});

describe('WooCommerce (Store API v1)', () => {
  const productos = fxJson('woo-products.json');
  const variaciones = fxJson('woo-variaciones.json');
  const arbol = { '3': ['Hogar', 0], '4': ['Tazas', 3], '5': ['Papelería', 0] } as Record<string, [string, number]>;
  const origen = 'https://tienda.ejemplo.test';

  it('variaciones con el nombre del término, su SKU y su precio en unidades menores', () => {
    const porId = new Map(variaciones.map((v: { id: number }) => [String(v.id), v]));
    const p = mapearProductoWoo(productos[0], origen, porId as Map<string, Record<string, unknown>>, arbol)!;
    expect(p).toMatchObject({ name: 'Taza Cerámica', sku: 'TAZA', price: 15000, brand: 'Alfarería Demo', category: 'Tazas', tags: ['regalo'], origen_id: 'woo:21' });
    expect(p.description).toBe('Taza de cerámica esmaltada, apta para microondas.');
    expect(p.variantes_detalle).toEqual([
      { opciones: { Color: 'Azul Cielo' }, origen_id: '211', sku: 'TAZA-AZ', price: 15000, compare_price: 17000, disponible: true, imagen: 'https://tienda.ejemplo.test/wp-content/uploads/taza-azul.jpg' },
      { opciones: { Color: 'Blanco' }, origen_id: '212', sku: 'TAZA-BL', price: 18000, compare_price: undefined, disponible: false, imagen: undefined },
    ]);
  });

  it('producto simple: precio de oferta y regular como precio anterior; sin existencias inventadas', () => {
    const p = mapearProductoWoo(productos[1], origen, new Map(), arbol)!;
    expect(p).toMatchObject({ price: 8000, compare_price: 10000, category: 'Papelería', disponible: false, variantes_detalle: undefined });
    expect(p.stock).toBeUndefined();
    expect(p.existencias).toBeUndefined();
  });

  it('categoría más profunda; sin árbol, la primera', () => {
    expect(categoriaMasProfunda([{ id: 3, name: 'Hogar' }, { id: 4, name: 'Tazas' }], arbol)).toBe('Tazas');
    expect(categoriaMasProfunda([{ id: 9, name: 'X' }, { id: 8, name: 'Y' }], {})).toBe('X');
  });

  it('sondeo por /wp-json y, si no, por ?rest_route; lectura con variaciones por padre', async () => {
    const raiz = `${origen}/?rest_route=/wc/store/v1`;
    const { lector, pedidas } = lectorFalso({
      // Con `?rest_route=` los parámetros van con «&».
      [`${raiz}/products&per_page=1`]: { json: [productos[0]], headers: { 'x-wp-total': '2', 'x-wp-totalpages': '1' } },
      [`${raiz}/products/categories&per_page=100&page=1`]: { json: fxJson('woo-categorias.json') },
      [`${raiz}/products&per_page=100&page=1`]: { json: productos, headers: { 'x-wp-total': '2', 'x-wp-totalpages': '1' } },
      [`${raiz}/products&type=variation&parent=21&per_page=100&page=1`]: { json: variaciones },
    });
    const s = (await conectorWooCommerce.sondear(lector, origen))!;
    expect(s).toMatchObject({ plataforma: 'woocommerce', total: 2, categorias: 3, cursor: { modo: 'rest_route', pagina: 1 } });
    const t = await conectorWooCommerce.pagina(lector, origen, s.cursor);
    expect(t.siguiente).toBeNull();
    expect(t.productos.map((p) => p.name)).toEqual(['Taza Cerámica', 'Libreta']);
    expect(t.productos[0].variantes_detalle?.[0].sku).toBe('TAZA-AZ');
    expect(t.productos[0].category).toBe('Tazas');
    expect(pedidas[0]).toBe(`${origen}/wp-json/wc/store/v1/products?per_page=1`);
  });

  it('un 400 después de la última página es el final (no un error)', async () => {
    const raiz = `${origen}/wp-json/wc/store/v1`;
    const cien = Array.from({ length: 100 }, (_, i) => ({ ...productos[1], id: 500 + i, name: `L${i}` }));
    const { lector } = lectorFalso({
      [`${raiz}/products?per_page=100&page=1`]: { json: cien },
      [`${raiz}/products?per_page=100&page=2`]: { status: 400, json: { code: 'rest_post_invalid_page_number' } },
    });
    const t = await conectorWooCommerce.pagina(lector, origen, { modo: 'wp_json', pagina: 1 });
    expect(t.productos).toHaveLength(100);
    expect(t.siguiente).toBeNull();
  });
});

describe('VTEX', () => {
  const [zapatilla, medias] = fxJson('vtex-search.json');
  const origen = 'https://www.tienda-vtex.test';

  it('cada SKU es una variante con precio, precio de lista, EAN, RefId y existencias', () => {
    const p = mapearProductoVtex(zapatilla, origen)!;
    expect(p).toMatchObject({ name: 'Zapatilla Running', price: 199900, compare_price: 249900, brand: 'Deportes Demo', category: 'Running', origen_id: 'vtex:301', sku: undefined });
    expect(p.variantes_detalle).toEqual([
      { opciones: { Talla: '40' }, origen_id: '3011', sku: 'ZR-01-40', barcode: '7700000000011', price: 199900, compare_price: 249900, disponible: true, existencias: 7, imagen: 'https://tiendavtex.vteximg.com.br/arquivos/ids/1/zr-40.jpg' },
      { opciones: { Talla: '41' }, origen_id: '3012', sku: 'ZR-01-41', barcode: '7700000000012', price: 209900, compare_price: undefined, disponible: false, existencias: 0, imagen: 'https://tiendavtex.vteximg.com.br/arquivos/ids/2/zr-41.jpg' },
    ]);
  });

  it('un solo SKU sin variaciones: RefId, EAN y existencias van al producto', () => {
    const p = mapearProductoVtex(medias, origen)!;
    expect(p).toMatchObject({ sku: 'MP-3-U', barcode: '7700000000021', existencias: 15, description: 'Pack de medias', category: 'Accesorios', variantes_detalle: undefined });
  });

  it('lee el total de la cabecera resources', () => {
    expect(totalDeRecursos('0-49/1234')).toBe(1234);
    expect(totalDeRecursos(undefined)).toBeUndefined();
  });

  it('más de 2 500 productos: recorre por departamento y parte el que supera el tope', async () => {
    const buscar = `${origen}/api/catalog_system/pub/products/search`;
    const { lector } = lectorFalso((url) => {
      if (url === `${buscar}?_from=0&_to=49`) return { json: [zapatilla], headers: { resources: '0-49/9000' } };
      if (url === `${origen}/api/catalog_system/pub/category/tree/3`) return { json: fxJson('vtex-arbol.json') };
      if (url.includes(`fq=${encodeURIComponent('C:/1/10/')}`)) return { json: [zapatilla], headers: { resources: '0-0/1' } };
      if (url.includes(`fq=${encodeURIComponent('C:/1/11/')}`)) return { json: [medias], headers: { resources: '0-0/1' } };
      if (url.includes(`fq=${encodeURIComponent('C:/1/')}`)) return { json: [zapatilla], headers: { resources: '0-49/3000' } };
      if (url.includes(`fq=${encodeURIComponent('C:/2/')}`)) return { json: [], headers: { resources: '0-0/0' } };
      return undefined as unknown as Ruta;
    });
    const s = (await conectorVtex.sondear(lector, origen))!;
    expect(s.total).toBe(9000);
    expect(s.categorias).toBe(4);
    expect((s.cursor.colas as { fq: string }[]).map((c) => c.fq)).toEqual(['C:/1/', 'C:/2/']);
    const t = await conectorVtex.pagina(lector, origen, s.cursor);
    expect(t.siguiente).toBeNull();
    expect(t.productos.map((p) => p.origen_id)).toEqual(['vtex:301', 'vtex:302']);
  });
});

describe('Magento 2 (GraphQL)', () => {
  const items = fxJson('magento-products.json').data.products.items;
  const origen = 'https://magento.ejemplo.test';

  it('configurable con variantes por opción; galería sin imágenes deshabilitadas', () => {
    const p = mapearProductoMagento(items[0], origen)!;
    expect(p).toMatchObject({ name: 'Chaqueta Impermeable', sku: 'CHQ-01', price: 250000, category: 'Chaquetas', url: 'https://magento.ejemplo.test/chaqueta-impermeable.html', origen_id: 'magento:41' });
    expect(p.images).toEqual(['https://magento.ejemplo.test/media/chq.jpg']);
    expect(p.variantes_detalle?.map((v) => [v.opciones, v.sku, v.price, v.compare_price, v.disponible])).toEqual([
      [{ Talla: 'M' }, 'CHQ-01-M', 250000, 300000, true],
      [{ Talla: 'L' }, 'CHQ-01-L', 320000, undefined, false],
    ]);
  });

  it('pagina por POST /graphql', async () => {
    const { lector, pedidas } = lectorFalso((url, body) => (url === `${origen}/graphql` && body?.includes('"pagina":1') ? { json: fxJson('magento-products.json') } : (undefined as unknown as Ruta)));
    const t = await conectorMagento.pagina(lector, origen, { pagina: 1 });
    expect(t.productos.map((p) => p.sku)).toEqual(['CHQ-01', 'PAR-01']);
    expect(t.siguiente).toBeNull();
    expect(t.total).toBe(2);
    expect(pedidas).toEqual([`${origen}/graphql`]);
  });
});

describe('PrestaShop (webservice con clave)', () => {
  const origen = 'https://presta.ejemplo.test';
  const dic = { categorias: { '12': 'Bolsos' }, valores: { '25': ['Color', 'Negro'], '26': ['Color', 'Marrón'] } as Record<string, [string, string]> };

  it('campos multi-idioma y combinaciones con el impacto sobre el precio base', () => {
    expect(valorIdioma([{ id: '1', value: '' }, { id: '2', value: 'B' }])).toBe('B');
    const [bolso, oculto] = fxJson('prestashop-products.json').products;
    const combos = fxJson('prestashop-combinations.json').combinations;
    const p = mapearProductoPrestashop(bolso, origen, combos, dic)!;
    expect(p).toMatchObject({ name: 'Bolso de Cuero', sku: 'BOL-7', price: 100000, brand: 'Cuero Demo', category: 'Bolsos', origen_id: 'prestashop:7' });
    expect(p.images).toEqual(['https://presta.ejemplo.test/70-large_default/bolso-de-cuero.jpg']);
    expect(p.variantes_detalle?.map((v) => [v.opciones, v.sku, v.price, v.existencias, v.imagen])).toEqual([
      [{ Color: 'Negro' }, 'BOL-7-NEG', 100000, 4, 'https://presta.ejemplo.test/71-large_default/bolso-de-cuero.jpg'],
      [{ Color: 'Marrón' }, 'BOL-7-MAR', 115000, 2, undefined],
    ]);
    // Inactivo en la tienda: no se importa.
    expect(mapearProductoPrestashop(oculto, origen, [], dic)).toBeNull();
  });

  it('sin clave no hay sondeo; la clave viaja en Authorization, no en la URL', async () => {
    expect(await conectorPrestashop.sondear(lectorFalso({}).lector, origen)).toBeNull();
    const cabeceras: Record<string, string>[] = [];
    const lector: Lector = async (url, op) => {
      cabeceras.push(op?.headers ?? {});
      expect(url).not.toContain('CLAVEDEPRUEBA');
      return { status: 200, headers: { 'content-type': 'application/json' }, texto: url.includes('/api/products') ? JSON.stringify({ products: [{ id: 1 }] }) : '[]', url };
    };
    const s = await conectorPrestashop.sondear(lector, origen, 'CLAVEDEPRUEBA1234567890');
    expect(s).toMatchObject({ plataforma: 'prestashop', total: 1, avisos: ['prestashopSinImpuestos'] });
    expect(cabeceras.every((h) => h.Authorization === `Basic ${Buffer.from('CLAVEDEPRUEBA1234567890:').toString('base64')}`)).toBe(true);
  });
});

describe('Genérica: sitemap + JSON-LD', () => {
  const origen = 'https://www.tienda-wix.test';

  it('lee <loc> de índices y de urlset (con CDATA y entidades)', () => {
    expect(locsDeSitemap(fx('sitemap-indice.xml')).sitemaps).toHaveLength(3);
    expect(locsDeSitemap(fx('sitemap-productos.xml')).urls[1]).toBe('https://www.tienda-wix.test/product-page/jabon?x=1&y=2');
    expect(sitemapsDeRobots('User-agent: *\nSitemap: https://www.tienda-wix.test/sitemap.xml\n', origen)).toEqual(['https://www.tienda-wix.test/sitemap.xml']);
  });

  it('reconoce URLs de producto y descarta categorías, blog y la portada', () => {
    expect(pareceUrlProducto('https://x.test/products/camisa')).toBe(true);
    expect(pareceUrlProducto('https://x.test/zapatilla-running/p')).toBe(true);
    expect(pareceUrlProducto('https://x.test/index.php?id_product=7&controller=product')).toBe(true);
    expect(pareceUrlProducto('https://x.test/blog/novedades')).toBe(false);
    expect(pareceUrlProducto('https://x.test/')).toBe(false);
  });

  it('descubre el sitemap de productos por robots.txt y no sale del dominio', async () => {
    const { lector } = lectorFalso({
      [`${origen}/robots.txt`]: { texto: `Sitemap: ${origen}/sitemap.xml` },
      [`${origen}/sitemap.xml`]: { texto: fx('sitemap-indice.xml') },
      [`${origen}/store-products-sitemap.xml`]: { texto: fx('sitemap-productos.xml') },
    });
    const r = await descubrirUrlsProducto(lector, origen);
    expect(r.urls).toEqual([`${origen}/product-page/vela-aromatica`, `${origen}/product-page/jabon?x=1&y=2`]);
  });

  it('ProductGroup con variantes, migas como categoría y precio tachado como anterior', () => {
    const p = productoDesdeHtml(fx('generica-ficha.html'), `${origen}/product-page/vela-aromatica`)!;
    expect(p).toMatchObject({ name: 'Vela Aromática', sku: 'VELA', brand: 'Velas Demo', category: 'Velas', price: 30000, description: 'Vela de soya & lavanda', images: [`${origen}/vela.jpg`] });
    expect(p.variantes_detalle?.map((v) => [v.opciones, v.sku, v.price, v.compare_price, v.disponible])).toEqual([
      [{ Talla: 'Pequeña' }, 'VELA-P', 30000, undefined, true],
      [{ Talla: 'Grande' }, 'VELA-G', 52000, 60000, false],
    ]);
  });

  it('respaldo Open Graph de producto; una página sin producto no inventa nada', () => {
    const og = '<meta property="og:type" content="product"><meta property="og:title" content="Jabón Artesanal"><meta property="product:price:amount" content="12000"><meta property="og:image" content="/jabon.jpg">';
    expect(productoDesdeHtml(og, `${origen}/p/jabon`)).toMatchObject({ name: 'Jabón Artesanal', price: 12000, images: [`${origen}/jabon.jpg`] });
    expect(productoDesdeHtml('<html><title>Blog</title></html>', `${origen}/blog`)).toBeNull();
  });

  it('lee fichas en paralelo, conserva el orden y cuenta las que no traen datos', async () => {
    const a = `${origen}/product-page/vela-aromatica`;
    const b = `${origen}/product-page/sin-datos`;
    const { lector } = lectorFalso({ [a]: { texto: fx('generica-ficha.html') }, [b]: { texto: '<html></html>' } });
    const r = await leerPaginasProducto(lector, [a, b]);
    expect(r.productos.map((p) => p.origen_id)).toEqual([`url:${a}`]);
    expect(r.sinDatos).toEqual([b]);
  });
});

describe('detección de la plataforma', () => {
  it('por HTML y cabeceras, de la más probable a la menos', () => {
    expect(detectarPlataforma('<link href="https://cdn.shopify.com/s/x.css"><script>Shopify.theme = {}</script>')[0]).toBe('shopify');
    expect(detectarPlataforma('<link href="/wp-content/plugins/woocommerce/a.css">')).toEqual(['woocommerce']);
    expect(detectarPlataforma('', { 'x-vtex-cache-status': 'HIT' })).toEqual(['vtex']);
    expect(detectarPlataforma('<script>var prestashop = {}</script>')).toEqual(['prestashop']);
    expect(detectarPlataforma('<img src="https://static.wixstatic.com/media/a.jpg">')).toEqual(['wix']);
    expect(detectarPlataforma('<html>nada</html>')).toEqual([]);
  });
  it('orden de sondeo: lo detectado primero; plataforma sin API → directo al sitemap', () => {
    expect(ordenDeSondeo(['vtex'])).toEqual(['vtex', 'shopify', 'woocommerce', 'magento']);
    expect(ordenDeSondeo([])).toEqual(['shopify', 'woocommerce', 'vtex', 'magento']);
    expect(ordenDeSondeo(['wix'])).toEqual([]);
  });
});

describe('deduplicación y resumen', () => {
  const base: ProductoWeb = { name: 'Uno', origen_id: 'shopify:1', url: 'https://t.test/products/uno', sku: 'U-1' };

  it('fusiona por id de plataforma, URL (sin www ni barra final) o SKU; completa sin pisar', () => {
    const r = fusionarCatalogo([base], [
      { name: 'Uno bis', origen_id: 'shopify:1', category: 'Cat' },
      { name: 'Uno URL', url: 'https://www.t.test/products/uno/', images: ['https://t.test/1.jpg'] },
      { name: 'Uno SKU', sku: 'u-1' },
      { name: 'Dos', origen_id: 'shopify:2' },
    ]);
    expect(r.repetidos).toBe(3);
    expect(r.productos).toHaveLength(2);
    expect(r.productos[0]).toMatchObject({ name: 'Uno', category: 'Cat', images: ['https://t.test/1.jpg'] });
  });

  it('SKU de la tienda repetido entre productos distintos: el segundo se genera y avisa', () => {
    const r = resolverSkusRepetidos([
      { name: 'A', sku: 'X' },
      { name: 'B', sku: 'x', variantes_detalle: [{ opciones: { T: 'S' }, sku: 'X' }] },
    ]);
    expect(r[0].sku).toBe('X');
    expect(r[1]).toMatchObject({ sku: undefined, sku_repetido: 'x' });
    expect(r[1].variantes_detalle?.[0].sku).toBeUndefined();
    const filas = productosWebAFilas(r);
    expect(filas[1].avisosLectura?.map((a) => a.codigo)).toEqual(['skuGenerado', 'skuRepetidoTienda']);
    expect(filas[1].reference).toBe('x');
    // Sin pasar por la deduplicación (análisis con IA): se renombra y también se avisa.
    const directas = productosWebAFilas([{ name: 'A', sku: 'X' }, { name: 'B', sku: 'X' }]);
    expect(directas.map((f) => f.sku)).toEqual(['X', 'X-2']);
    expect(directas[1].avisosLectura).toEqual([{ codigo: 'skuRepetidoTienda', params: { sku: 'X' } }]);
  });

  it('resumen: productos, variantes, categorías, sin precio, con imagen y existencias', () => {
    const shop = fxJson('shopify-products.json').products.map((p: unknown) => mapearProductoShopify(p, 'https://s.test')!);
    const vtex = fxJson('vtex-search.json').map((p: unknown) => mapearProductoVtex(p, 'https://v.test')!);
    const r = resumenCatalogo([...shop, ...vtex]);
    expect(r).toMatchObject({ productos: 4, variantes: 4, sinCategoria: 1, conPrecio: 4, conImagen: 2, conExistencias: 2 });
    expect(r.categorias.map((c) => c.nombre)).toEqual(['Accesorios', 'Camisetas', 'Running']);
  });
});

describe('catálogo → filas de la RPC (mismo camino que el archivo)', () => {
  const shop = fxJson('shopify-products.json').products.map((p: unknown) => mapearProductoShopify(p, 'https://s.test')!);

  it('padre sin precio propio de variantes; hijas con SU SKU, precio, comparación e imagen', () => {
    const filas = productosWebAFilas(shop);
    expect(filas).toHaveLength(4);
    const [padre, s, m, gorra] = filas;
    expect(padre).toMatchObject({ sku: 'WEB-CAMISETA-BASICA', isParent: true, price: 45000, category: 'Camisetas', stock: undefined });
    expect(s).toMatchObject({ sku: 'CAM-S-R', reference: 'CAM-S-R', parentSku: padre.sku, price: 45000, comparePrice: 60000, name: 'Camiseta Básica - S / Rojo', imageUrls: 'https://cdn.ejemplo.test/cam-s.jpg', variantData: '{"Talla":"S","Color":"Rojo"}' });
    expect(s.imagenesDelPadre).toBeUndefined();
    expect(m).toMatchObject({ sku: 'CAM-M-R', price: 48000, comparePrice: undefined, imagenesDelPadre: true });
    expect(gorra).toMatchObject({ sku: 'GOR-01', skuGenerado: false, price: 25000 });
    expect(cantidadVariantes(shop[0])).toBe(2);
  });

  it('variante sin SKU en la tienda: SKU determinista del padre + valores (estable al reimportar)', () => {
    const p: ProductoWeb = { name: 'Bolso', variantes_detalle: [{ opciones: { Color: 'Azul Rey' }, price: 10 }, { opciones: { Color: 'Azul Rey' }, price: 11 }, { opciones: {} }] };
    const a = productosWebAFilas([p]);
    const b = productosWebAFilas([p]);
    expect(a.map((f) => f.sku)).toEqual(['WEB-BOLSO', 'WEB-BOLSO-AZUL-REY']);
    expect(b.map((f) => f.sku)).toEqual(a.map((f) => f.sku));
  });

  it('existencias de la tienda solo como stock si se pide (exigen costo)', () => {
    const vtex = fxJson('vtex-search.json').map((p: unknown) => mapearProductoVtex(p, 'https://v.test')!);
    expect(productosWebAFilas(vtex).every((f) => f.stock === undefined)).toBe(true);
    const con = productosWebAFilas(vtex, { existenciasComoStock: true });
    expect(con.map((f) => [f.sku, f.stock])).toEqual([
      ['WEB-ZAPATILLA-RUNNING', undefined],
      ['ZR-01-40', 7],
      ['ZR-01-41', undefined],
      ['MP-3-U', 15],
    ]);
  });

  it('reimportar: los SKU que ya existen se actualizan en vez de duplicarse', () => {
    const filas = productosWebAFilas(shop);
    const existentes = new Map([
      ['WEB-CAMISETA-BASICA', 10],
      ['CAM-S-R', 11],
      ['CAM-M-R', 12],
      ['GOR-01', 13],
    ]);
    const validadas = validarFilas(filas, { existentes, opciones: OPCIONES_POR_DEFECTO, categorias: new Set(['camisetas']) });
    expect(validadas.map((v) => v.accion)).toEqual(['actualizar', 'actualizar', 'actualizar', 'actualizar']);
    expect(validadas.every((v) => v.estado !== 'error')).toBe(true);
    // Solo crear nuevos: nada se envía.
    const soloCrear = validarFilas(filas, { existentes, opciones: { ...OPCIONES_POR_DEFECTO, modo: 'solo_crear' } });
    expect(filasAImportar(soloCrear, new Set(), OPCIONES_POR_DEFECTO)).toHaveLength(0);
    // Primera vez: padres antes que variantes en el envío.
    const nuevas = filasAImportar(validarFilas(filas, { existentes: new Map(), opciones: OPCIONES_POR_DEFECTO }), new Set(), OPCIONES_POR_DEFECTO);
    expect(nuevas.map((f) => [f.sku, f.es_padre, f.sku_padre ?? null, f.precio])).toEqual([
      ['WEB-CAMISETA-BASICA', true, null, 45000],
      ['GOR-01', false, null, 25000],
      ['CAM-S-R', false, 'WEB-CAMISETA-BASICA', 45000],
      ['CAM-M-R', false, 'WEB-CAMISETA-BASICA', 48000],
    ]);
  });
});
