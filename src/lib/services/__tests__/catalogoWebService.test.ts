/// <reference types="jest" />
/**
 * Lector del servidor para catálogos web: guarda SSRF en cada redirección,
 * reintento ante 429/5xx, tope de tamaño; y las entradas de la ruta (URLs del
 * mismo sitio, plataforma y cursor válidos). `fetch` falso: sin red.
 */
import { crearLector, detectarCatalogo, ErrorCatalogo, leerFichasProducto, leerTandaCatalogo } from '../catalogoWebService';

type Resp = { status?: number; body?: string; headers?: Record<string, string> };

function fetchFalso(rutas: Record<string, Resp | Resp[]>) {
  const pedidas: string[] = [];
  const impl = (async (url: string) => {
    pedidas.push(url);
    let r = rutas[url];
    if (Array.isArray(r)) r = r.shift() ?? { status: 500 };
    if (!r) return new Response('no', { status: 404 });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers ?? { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, pedidas };
}

const sinEspera = { pausaMs: 0, dormir: async () => undefined };

describe('crearLector', () => {
  it('no pide hosts internos ni sigue redirecciones hacia ellos', async () => {
    const { impl, pedidas } = fetchFalso({ 'https://tienda.test/a': { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } } });
    const lector = crearLector({ ...sinEspera, fetchImpl: impl });
    expect(await lector('http://127.0.0.1/x')).toBeNull();
    expect(await lector('https://tienda.test/a')).toBeNull();
    expect(pedidas).toEqual(['https://tienda.test/a']);
  });

  it('sigue una redirección pública y devuelve la URL final con cabeceras en minúsculas', async () => {
    const { impl } = fetchFalso({
      'https://a.myshopify.test/products.json': { status: 301, headers: { location: 'https://www.tienda.test/products.json' } },
      'https://www.tienda.test/products.json': { body: '{"products":[]}', headers: { 'Content-Type': 'application/json', 'X-WP-Total': '3' } },
    });
    const r = await crearLector({ ...sinEspera, fetchImpl: impl })('https://a.myshopify.test/products.json');
    expect(r).toMatchObject({ status: 200, url: 'https://www.tienda.test/products.json', texto: '{"products":[]}' });
    expect(r?.headers['x-wp-total']).toBe('3');
  });

  it('reintenta ante 429/503 y se rinde tras los reintentos', async () => {
    const { impl, pedidas } = fetchFalso({ 'https://t.test/x': [{ status: 429 }, { status: 503 }, { body: '[]' }], 'https://t.test/y': [{ status: 503 }, { status: 503 }, { status: 503 }] });
    const lector = crearLector({ ...sinEspera, fetchImpl: impl, reintentos: 2 });
    expect((await lector('https://t.test/x'))?.status).toBe(200);
    expect((await lector('https://t.test/y'))?.status).toBe(503);
    expect(pedidas.filter((u) => u.endsWith('/y'))).toHaveLength(3);
  });

  it('descarta respuestas de más de 10 MB', async () => {
    const { impl } = fetchFalso({ 'https://t.test/grande': { body: 'x', headers: { 'content-length': String(11 * 1024 * 1024) } } });
    expect(await crearLector({ ...sinEspera, fetchImpl: impl })('https://t.test/grande')).toBeNull();
  });
});

describe('entradas de la ruta', () => {
  it('fichas: solo URLs del mismo sitio y como máximo 12 por llamada', async () => {
    await expect(leerFichasProducto('https://t.test', ['https://otro.test/p/1'])).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(leerFichasProducto('https://t.test', Array.from({ length: 13 }, (_, i) => `https://t.test/p/${i}`))).rejects.toMatchObject({ code: 'TOO_MANY_URLS' });
    await expect(leerFichasProducto('http://10.0.0.1', ['http://10.0.0.1/p/1'])).rejects.toBeInstanceOf(ErrorCatalogo);
  });

  it('tanda: plataforma conocida, cursor objeto y clave para PrestaShop', async () => {
    await expect(leerTandaCatalogo('https://t.test', 'tiendita', {})).rejects.toMatchObject({ code: 'INVALID_PLATFORM' });
    await expect(leerTandaCatalogo('https://t.test', 'shopify', 'x')).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
    await expect(leerTandaCatalogo('https://t.test', 'prestashop', {})).rejects.toMatchObject({ code: 'KEY_REQUIRED' });
  });

  it('tanda: una página que falla se informa como reintentable (503)', async () => {
    const { impl } = fetchFalso({});
    await expect(leerTandaCatalogo('https://t.test', 'shopify', { fase: 'productos', pagina: 2 }, undefined, { ...sinEspera, fetchImpl: impl, reintentos: 0 })).rejects.toMatchObject({
      status: 503,
      code: 'PAGE_FAILED',
    });
  });
});

describe('detectarCatalogo', () => {
  it('Shopify por el HTML, confirmado por /products.json', async () => {
    const { impl, pedidas } = fetchFalso({
      'https://t.test/': { body: '<script src="https://cdn.shopify.com/x.js"></script>', headers: { 'content-type': 'text/html' } },
      'https://t.test/products.json?limit=1': { body: '{"products":[]}' },
      'https://t.test/collections.json?limit=250&page=1': { body: '{"collections":[{"handle":"ofertas","title":"Ofertas"}]}' },
    });
    const d = await detectarCatalogo('https://t.test/', undefined, { ...sinEspera, fetchImpl: impl });
    expect(d).toMatchObject({ plataforma: 'shopify', detectada: 'shopify', disponible: true, categorias: 1, origen: 'https://t.test' });
    expect(pedidas[1]).toBe('https://t.test/products.json?limit=1');
  });

  it('PrestaShop sin clave: pide la clave y no sondea otras APIs', async () => {
    const { impl, pedidas } = fetchFalso({ 'https://p.test/': { body: '<script>var prestashop = {};</script>', headers: { 'content-type': 'text/html' } } });
    const d = await detectarCatalogo('https://p.test/', undefined, { ...sinEspera, fetchImpl: impl });
    expect(d).toMatchObject({ plataforma: 'generica', detectada: 'prestashop', disponible: false, requiereClave: true });
    expect(pedidas.some((u) => u.includes('products.json') || u.includes('wc/store') || u.includes('graphql'))).toBe(false);
  });
});
