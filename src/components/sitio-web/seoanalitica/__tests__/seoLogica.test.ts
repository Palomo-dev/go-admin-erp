/**
 * Lógica pura de SEO y redes (Figma B/08) y de la salud del sitio y los
 * píxeles (B/08, B/09). Datos inventados; «Tu marca» como negocio de ejemplo.
 */
import type { DocumentoSitio, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import {
  calidadPagina,
  calidadPaginas,
  contarCambios,
  estadoLongitud,
  extraerCodigoVerificacion,
  mostrarRed,
  normalizarRed,
  resumenSeo,
  seoVacio,
  sugerenciaBasica,
  aplicarAlDocumento,
  valoresDesdeDocumento,
} from '../seoLogica';
import { abreviarId, leerRobots, leerSitemap, normalizarIdPixel, paginaCargaId } from '../saludSitio';

const v = <T,>(value: T) => ({ mode: 'value' as const, value });

function pagina(p: Partial<PaginaSitio> & { id: string; slug: string }): PaginaSitio {
  return { tipo: 'builtin', titulo: 'Página', publicada: true, secciones: [], ...p } as PaginaSitio;
}

function documento(paginas: PaginaSitio[], seo: DocumentoSitio['seo'] = {}): DocumentoSitio {
  return {
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo,
    contenido: { redesSociales: v({ instagram: 'https://www.instagram.com/tumarca', youtube: 'https://youtube.com/@tumarca' }) },
    shell: { header: { composicion: 'clasico', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'clasico', menuIds: [], opciones: {} } },
    menus: [],
    paginas,
  } as unknown as DocumentoSitio;
}

describe('contadores', () => {
  test('bien, largo y falta', () => {
    expect(estadoLongitud('', 60)).toEqual({ largo: 0, estado: 'falta' });
    expect(estadoLongitud('Tu marca · Calzado hecho en Colombia', 60).estado).toBe('bien');
    expect(estadoLongitud('x'.repeat(61), 60)).toEqual({ largo: 61, estado: 'largo' });
  });
  test('cuenta caracteres, no bytes', () => {
    expect(estadoLongitud('ñandú', 60).largo).toBe(5);
  });
});

describe('calidad por página', () => {
  const desc = 'Zapatos de cuero hechos a mano. Paga contra entrega o con tarjeta y recibe en 2 a 4 días.';
  test('inicio usa la descripción del sitio; sin imagen → falta imagen', () => {
    const inicio = pagina({ id: 'p1', slug: '', titulo: 'Inicio' });
    const c = calidadPagina(inicio, { seo: { descripcion: v(desc) } });
    expect(c.campos.descripcion).toBe('bien');
    expect(c.campos.imagen).toBe('falta');
    expect(c.general).toBe('falta_imagen');
  });
  test('falta descripción en una página interna; mejorable si el título es corto', () => {
    const contacto = pagina({ id: 'p2', slug: 'contacto', titulo: 'Contacto' });
    expect(calidadPagina(contacto, { seo: { descripcion: v(desc), imagenOgUrl: v('https://x.co/a.jpg') } }).general).toBe('falta_descripcion');
    const corta = pagina({ id: 'p3', slug: 'cambios', titulo: 'Cambios', seo: { descripcion: v(desc) } });
    const c = calidadPagina(corta, { seo: { imagenOgUrl: v('https://x.co/a.jpg') } });
    expect(c.campos.titulo).toBe('mejorable');
    expect(c.general).toBe('mejorable');
  });
  test('solo publicadas y sin plantillas de Tienda; inicio primero', () => {
    const doc = documento([
      pagina({ id: 'b', slug: 'contacto', titulo: 'Contacto' }),
      pagina({ id: 'a', slug: '', titulo: 'Inicio' }),
      pagina({ id: 'c', slug: 'oculta', titulo: 'Oculta', publicada: false }),
      pagina({ id: 'd', slug: 'producto', titulo: 'Producto', tipo: 'product_detail' }),
    ]);
    expect(calidadPaginas(doc).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('redes sociales', () => {
  test('forma corta → URL', () => {
    expect(normalizarRed('instagram', '@tumarca')).toBe('https://www.instagram.com/tumarca');
    expect(normalizarRed('facebook', 'facebook.com/tumarca')).toBe('https://www.facebook.com/tumarca');
    expect(normalizarRed('tiktok', '@tumarca')).toBe('https://www.tiktok.com/@tumarca');
    expect(normalizarRed('whatsapp', '+57 300 555 0100')).toBe('https://wa.me/573005550100');
    expect(normalizarRed('whatsapp', '300 555 0100')).toBe('https://wa.me/573005550100');
    expect(normalizarRed('instagram', '')).toBeNull();
  });
  test('inválidos', () => {
    expect(normalizarRed('instagram', 'https://otra.com/x')).toBeUndefined();
    expect(normalizarRed('whatsapp', 'abc')).toBeUndefined();
  });
  test('URL → forma corta, ida y vuelta', () => {
    expect(mostrarRed('instagram', 'https://www.instagram.com/tumarca')).toBe('@tumarca');
    expect(mostrarRed('facebook', 'https://www.facebook.com/tumarca')).toBe('facebook.com/tumarca');
    expect(mostrarRed('tiktok', 'https://www.tiktok.com/@tumarca')).toBe('@tumarca');
    expect(mostrarRed('whatsapp', 'https://wa.me/573005550100')).toBe('+57 300 555 0100');
    for (const red of ['instagram', 'facebook', 'tiktok', 'whatsapp'] as const) {
      const url = normalizarRed(red, mostrarRed(red, normalizarRed(red, red === 'whatsapp' ? '3005550100' : '@tumarca') ?? ''));
      expect(url).toBeTruthy();
    }
  });
});

describe('documento', () => {
  test('lee y aplica sin tocar otras redes', () => {
    const doc = documento([], { titulo: v('Tu marca') });
    const vals = valoresDesdeDocumento(doc);
    expect(vals.titulo).toBe('Tu marca');
    expect(vals.redes.instagram).toBe('@tumarca');
    const nuevo = aplicarAlDocumento(doc, { ...vals, titulo: ' ', descripcion: 'Hola', imagen: 'https://x.co/og.jpg', redes: { ...vals.redes, instagram: '', tiktok: '@tumarca' } });
    expect(nuevo.seo.titulo).toEqual({ mode: 'clear' });
    expect(nuevo.seo.descripcion).toEqual(v('Hola'));
    expect(nuevo.seo.imagenOgUrl).toEqual(v('https://x.co/og.jpg'));
    const redes = nuevo.contenido.redesSociales;
    expect(redes?.mode === 'value' && redes.value).toEqual({ youtube: 'https://youtube.com/@tumarca', tiktok: 'https://www.tiktok.com/@tumarca' });
  });
  test('sin documento: todo vacío y «primera vez»', () => {
    const vals = valoresDesdeDocumento(null);
    expect(seoVacio(vals)).toBe(true);
  });
});

describe('search console', () => {
  test('acepta la etiqueta completa o el código', () => {
    expect(extraerCodigoVerificacion('<meta name="google-site-verification" content="abcDEF_123-xyz456" />')).toBe('abcDEF_123-xyz456');
    expect(extraerCodigoVerificacion('abcDEF_123-xyz456')).toBe('abcDEF_123-xyz456');
    expect(extraerCodigoVerificacion('')).toBeNull();
    expect(extraerCodigoVerificacion('<script>')).toBeUndefined();
  });
});

describe('sugerencia, resumen y cambios', () => {
  test('sugerencia básica respeta los límites', () => {
    const s = sugerenciaBasica('Tu marca', 'Restaurante', null);
    expect(s.titulo).toBe('Tu marca · Restaurante');
    expect(Array.from(s.descripcion).length).toBeLessThanOrEqual(160);
  });
  test('resumen móvil y conteo de cambios', () => {
    const base = { titulo: 'a', descripcion: 'b', imagen: null, redes: { instagram: '@x', facebook: '', tiktok: '', whatsapp: '' }, verificacion: '', ocultar: false };
    expect(resumenSeo(base, true, []).redes).toEqual(['instagram']);
    expect(contarCambios({ ...base, titulo: 'c', ocultar: true }, base)).toBe(2);
  });
});

describe('salud del sitio y píxeles', () => {
  test('sitemap', () => {
    expect(leerSitemap(200, '<?xml?><urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>')).toEqual({ publicado: true, direcciones: 2 });
    expect(leerSitemap(404, '')).toEqual({ publicado: false, direcciones: 0 });
    expect(leerSitemap(200, '<html>no</html>').publicado).toBe(false);
  });
  test('robots', () => {
    expect(leerRobots(200, 'User-agent: *\nDisallow: /checkout\nDisallow: /cuenta/\n')).toEqual({ publicado: true, bloqueaTodo: false, rutasBloqueadas: ['/checkout', '/cuenta'] });
    expect(leerRobots(200, 'User-agent: *\nDisallow: /').bloqueaTodo).toBe(true);
    expect(leerRobots(404, '').publicado).toBe(false);
  });
  test('IDs de píxeles', () => {
    expect(normalizarIdPixel('meta', ' 1234567890123 ')).toBe('1234567890123');
    expect(normalizarIdPixel('gtm', 'gtm-abc1234')).toBe('GTM-ABC1234');
    expect(normalizarIdPixel('ga4', 'G-ABC123XYZ')).toBe('G-ABC123XYZ');
    expect(normalizarIdPixel('meta', 'abc')).toBeUndefined();
    expect(normalizarIdPixel('ads', '')).toBeNull();
    expect(abreviarId('1234567890123')).toBe('1234…0123');
    expect(paginaCargaId("fbq('init', '1234567890123');", '1234567890123')).toBe(true);
    expect(paginaCargaId('91234567890123', '1234567890123')).toBe(false);
  });
});
