/**
 * «Plantilla completa» (`plantillaCompleta.ts`): cada plantilla del catálogo arma un sitio entero
 * —encabezado, pie, páginas, menús y secciones— que cumple el contrato del documento y que el
 * lector V2 del sitio sabe pintar (tipos, variantes y claves del `SECTION_CATALOG`, que la prueba
 * de contrato compara con el manifiesto de goadmin-websites). Además: los datos reales mandan, sin
 * datos no se inventan personas ni opiniones, y lo del dueño que se conserva (sistema y legales).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { validarDocumentoSitio, type DocumentoSitio, type PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { construirCatalogo, contarPorGiro, plantillaPorId, type PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';
import { esInicio, esPaginaLegal, esPlantillaTienda } from '@/components/sitio-web/paginas/tipoPagina';
import {
  COMPOSICIONES_ENCABEZADO,
  COMPOSICIONES_PIE,
  DATOS_VACIOS,
  SHELL_POR_GIRO,
  TIPOS_QUE_NECESITAN_DATOS,
  armarPlantillaCompleta,
  CATALOGO_PLANTILLAS,
  bannerDelSitio,
  construirSitioDePlantilla,
  modoPorDefecto,
  plantillaPorDefectoDelGiro,
  type DatosNegocio,
} from '../plantillaCompleta';

const CATALOGO = construirCatalogo(TEMPLATE_PRESETS);
const BANNER = 'https://example.com/storage/v1/object/public/organization_images/1/banner.jpeg';

function generador() {
  let n = 0;
  return () => `id-${++n}`;
}

/** Borrador como el que deja el importador del sitio viejo (estructura de la org de la prueba). */
function borradorImportado(): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: { alturaLogo: { mode: 'value', value: 72 } },
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: { textoPie: { mode: 'clear' } },
    shell: {
      header: { composicion: 'mega', menuPrincipalId: 'paginas-encabezado', opciones: { header_cta_text: 'Reservar Mesa' } },
      footer: { composicion: 'default', menuIds: ['paginas-pie'], opciones: { show_powered_by: false } },
    },
    menus: [
      { id: 'paginas-encabezado', nombre: 'Páginas del encabezado', items: [{ id: 'i1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'home' }] },
      { id: 'paginas-pie', nombre: 'Páginas del pie', items: [] },
    ],
    paginas: [
      { id: 'cart', slug: 'plantillas/cart', tipo: 'cart', titulo: 'Carrito', publicada: true, secciones: [] },
      { id: 'checkout', slug: 'plantillas/checkout', tipo: 'checkout', titulo: 'Checkout', publicada: true, secciones: [] },
      {
        id: 'home',
        slug: 'home',
        tipo: 'builtin',
        titulo: 'Inicio',
        publicada: true,
        secciones: [
          { id: 's1', tipo: 'menu_preview', variante: 'tabs', version: 1, contenido: { title: 'Nuestro Menú' } },
          {
            id: 's2',
            tipo: 'testimonials',
            variante: 'quotes',
            version: 1,
            contenido: { items: [{ name: 'Persona de ejemplo', text: 'Excelente', rating: 5 }] },
          },
          { id: 's3', tipo: 'hero', variante: 'fullscreen', version: 1, contenido: { title: 'Sabor', image_url: BANNER } },
        ],
      },
      {
        id: 'terminos',
        slug: 'terminos',
        tipo: 'legal',
        titulo: 'Términos y condiciones',
        publicada: true,
        secciones: [{ id: 's-t', tipo: 'text_block', variante: 'left', version: 1, contenido: { title: 'Términos', body: 'Texto real de la organización' } }],
      },
    ],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

const DATOS: DatosNegocio = {
  nombre: 'Restaurante de prueba',
  descripcion: null,
  ciudad: 'Medellín',
  direccion: null,
  telefono: '3000000000',
  portadaUrl: null,
  productos: [
    { id: 11, nombre: 'Plato uno', imagenUrl: 'https://example.com/p11.jpg', categoriaId: 1 },
    { id: 12, nombre: 'Plato dos', imagenUrl: 'https://example.com/p12.jpg', categoriaId: 1 },
    { id: 13, nombre: 'Plato tres', imagenUrl: 'https://example.com/p13.jpg', categoriaId: 2 },
    { id: 14, nombre: 'Plato cuatro', imagenUrl: 'https://example.com/p14.jpg', categoriaId: 2 },
    { id: 15, nombre: 'Bebida', imagenUrl: null, categoriaId: 3 },
  ],
  categorias: [
    { id: 1, nombre: 'Entradas' },
    { id: 2, nombre: 'Platos fuertes' },
    { id: 3, nombre: 'Bebidas' },
  ],
  testimonios: 0,
};

const armar = (p: PlantillaCatalogo, datos: DatosNegocio = DATOS, base = borradorImportado()) =>
  armarPlantillaCompleta(base, p, datos, { extendidos: true, generarId: generador() });

const inicioDe = (d: DocumentoSitio): PaginaSitio => d.paginas.find((p) => esInicio(p))!;
const visibles = (p: PaginaSitio) => p.secciones.filter((s) => s.visibilidad.movil || s.visibilidad.escritorio);

describe('catálogo: plantillas por giro', () => {
  it('Restaurante 8, Tienda 4, Hotel 4, Servicios 4, Gimnasio 4', () => {
    const c = contarPorGiro(CATALOGO);
    expect([c.restaurante, c.tienda, c.hotel, c.servicios, c.gimnasio]).toEqual([8, 4, 4, 4, 4]);
  });

  it('cada giro tiene una plantilla por defecto', () => {
    for (const giro of ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio', 'transporte', 'parqueadero'] as const) {
      expect(plantillaPorDefectoDelGiro(CATALOGO, giro)?.giro).toBe(giro);
    }
  });
});

describe.each(CATALOGO.plantillas.map((p) => [p.id, p] as const))('plantilla completa «%s»', (_id, plantilla) => {
  const { documento, resumen } = armar(plantilla);

  it('cumple el contrato del documento (schemaVersion 1)', () => {
    const r = validarDocumentoSitio(documento);
    if (!r.ok) throw new Error(JSON.stringify(r.errores));
    expect(r.documento.schemaVersion).toBe(1);
  });

  it('trae encabezado y pie con composiciones que el sitio pinta y opciones del contrato', () => {
    const { header, footer } = documento.shell;
    expect(COMPOSICIONES_ENCABEZADO).toContain(header.composicion);
    expect(COMPOSICIONES_PIE).toContain(footer.composicion);
    for (const clave of Object.keys(header.opciones)) expect(OPCIONES_SHELL[clave]?.zona).toBe('header');
    for (const clave of Object.keys(footer.opciones)) expect(OPCIONES_SHELL[clave]?.zona).toBe('footer');
    expect(header.opciones.header_cta_text).toBe(SHELL_POR_GIRO[plantilla.giro].encabezado.cta.texto);
    // El botón del encabezado lleva a una página que existe.
    const destino = String(header.opciones.header_cta_url).replace(/^\//, '');
    expect(documento.paginas.some((p) => p.slug === destino)).toBe(true);
  });

  it('trae menús: encabezado con sus páginas y pie con «Explora» y «Legales»', () => {
    const encabezado = documento.menus.find((m) => m.id === documento.shell.header.menuPrincipalId)!;
    expect(encabezado.items.length).toBeGreaterThanOrEqual(4);
    expect(encabezado.items[0].etiqueta).toBe('Inicio');
    const pie = documento.shell.footer.menuIds.map((id) => documento.menus.find((m) => m.id === id)!.nombre);
    expect(pie).toEqual(['Explora', 'Legales']);
  });

  it('Inicio sigue la estructura de la plantilla, en su orden (portada con foto si la hay)', () => {
    const inicio = inicioDe(documento);
    const esperada = plantilla.inicio.map(([t, v]) => [t, t === 'restaurant_hero' && v === 'typographic' ? 'split_bento' : v]);
    expect(inicio.secciones.map((s) => [s.tipo, s.variante])).toEqual(esperada);
    // Portada visible siempre; sin datos reales, transporte clásico queda en portada y mapa.
    expect(visibles(inicio)[0].tipo).toMatch(/hero$/);
    expect(visibles(inicio).length).toBeGreaterThanOrEqual(2);
  });

  it('cada sección es un tipo, variante y claves que el lector V2 sabe pintar', () => {
    for (const pagina of documento.paginas) {
      for (const s of pagina.secciones) {
        if (esPaginaLegal(pagina) || esPlantillaTienda(pagina)) continue;
        const def = getSectionDefinition(s.tipo);
        expect({ tipo: s.tipo, existe: Boolean(def) }).toEqual({ tipo: s.tipo, existe: true });
        expect(def!.variants.map((v) => v.id)).toContain(s.variante);
        const claves = new Set(def!.contentFields.map((f) => f.key));
        for (const k of Object.keys(s.contenido)) expect({ tipo: s.tipo, clave: k, declarada: claves.has(k) }).toEqual({ tipo: s.tipo, clave: k, declarada: true });
      }
    }
  });

  it('no inventa personas, opiniones ni cifras: esas secciones quedan ocultas', () => {
    for (const p of documento.paginas) {
      for (const s of p.secciones) {
        if (!TIPOS_QUE_NECESITAN_DATOS.has(s.tipo)) continue;
        expect(s.visibilidad).toEqual({ movil: false, escritorio: false });
        expect(s.contenido.items).toBeUndefined();
      }
    }
    expect(resumen.ocultas.every((o) => typeof o.tipo === 'string')).toBe(true);
  });
});

describe('restaurante: «Noir Omakase» sobre el sitio importado (caso de la org de prueba)', () => {
  const noir = plantillaPorId(CATALOGO, 'noir_omakase')!;
  const { documento, resumen } = armar(noir);

  it('páginas: Inicio, Menú, Pedir online, Reservar mesa, Nosotros, Contacto, Galería, legales y sistema', () => {
    expect(documento.paginas.map((p) => p.slug)).toEqual([
      'home', 'menu', 'domicilios', 'reservas-mesa', 'nosotros', 'contacto', 'galeria', 'privacidad',
      'plantillas/cart', 'plantillas/checkout', 'terminos',
    ]);
  });

  it('Inicio arranca con la portada CON FOTO (el banner del sitio viejo) y no con la carta', () => {
    const inicio = visibles(inicioDe(documento));
    expect(inicio[0].tipo).toBe('restaurant_hero');
    expect(inicio[0].variante).toBe('split_bento');
    expect((inicio[0].contenido.cards as unknown[]).length).toBe(3);
    expect(inicio[0].contenido).toMatchObject({ title: 'Restaurante de prueba', eyebrow: 'Medellín', primary_cta_url: '/reservas-mesa', secondary_cta_url: '/menu', image_url: BANNER });
    expect(inicio.map((s) => s.tipo)).toEqual(['restaurant_hero', 'signature_dishes', 'menu_preview', 'reservation', 'hours_location']);
  });

  it('platos estrella con productos reales que tienen foto', () => {
    const platos = inicioDe(documento).secciones.find((s) => s.tipo === 'signature_dishes')!;
    expect(platos.contenido.dishes).toEqual([{ product_id: 11 }, { product_id: 12 }, { product_id: 13 }, { product_id: 14 }]);
  });

  it('los testimonios de ejemplo del sitio viejo no pasan; sin testimonios reales la sección queda oculta', () => {
    const t = inicioDe(documento).secciones.find((s) => s.tipo === 'testimonials')!;
    expect(t.contenido).toEqual({ title: 'Lo que dicen nuestros clientes', data_source: 'database', max_items: 6 });
    expect(t.visibilidad).toEqual({ movil: false, escritorio: false });
    expect(JSON.stringify(documento)).not.toContain('Persona de ejemplo');
    expect(resumen.ocultas.map((o) => o.tipo)).toEqual(expect.arrayContaining(['chef_team', 'testimonials']));
  });

  it('con testimonios reales la sección se muestra (los lee de la base)', () => {
    const r = armar(noir, { ...DATOS, testimonios: 3 });
    const t = inicioDe(r.documento).secciones.find((s) => s.tipo === 'testimonials')!;
    expect(t.visibilidad).toEqual({ movil: true, escritorio: true });
  });

  it('encabezado «Reservar mesa», carrito y teléfono; pie con horario; conserva «Hecho con…»', () => {
    expect(documento.shell.header.opciones).toMatchObject({ header_cta_text: 'Reservar mesa', header_cta_url: '/reservas-mesa', show_header_cart: true, show_topbar: true });
    expect(documento.shell.footer.opciones).toMatchObject({ footer_show_hours: true, footer_show_contact: true, show_powered_by: false });
  });

  it('la política nueva nace con su texto base vacío, nunca con textos de otra sección', () => {
    const privacidad = documento.paginas.find((p) => p.slug === 'privacidad')!;
    expect(privacidad.secciones.map((x) => x.contenido)).toEqual([{ title: 'Política de privacidad', content: '' }]);
  });

  it('conserva el texto legal real y lo enlaza en «Legales»', () => {
    const terminos = documento.paginas.find((p) => p.slug === 'terminos')!;
    expect(terminos.secciones[0].contenido.body).toBe('Texto real de la organización');
    const legales = documento.menus.find((m) => m.nombre === 'Legales')!;
    expect(legales.items.map((i) => i.etiqueta).sort()).toEqual(['Política de privacidad', 'Términos y condiciones']);
  });

  it('aplica el estilo de la plantilla', () => {
    expect(documento.tema.preset).toEqual({ mode: 'value', value: 'noir_omakase' });
    expect(documento.tema.colores.fondo).toEqual({ mode: 'value', value: '#0E0E0E' });
  });

  it('es puro: no muta el borrador de entrada', () => {
    const base = borradorImportado();
    const copia = JSON.stringify(base);
    armar(noir, DATOS, base);
    expect(JSON.stringify(base)).toBe(copia);
  });
});

describe('sin datos de la organización', () => {
  it('sin ninguna foto, la portada de Noir queda tipográfica (la de la plantilla)', () => {
    const sinBanner = { ...borradorImportado(), paginas: borradorImportado().paginas.filter((p) => !esInicio(p)) };
    const { documento } = armar(plantillaPorId(CATALOGO, 'noir_omakase')!, DATOS_VACIOS, sinBanner);
    expect(inicioDe(documento).secciones[0].variante).toBe('typographic');
  });

  it('usa textos de ejemplo en español y sigue cumpliendo el contrato', () => {
    const tienda = plantillaPorDefectoDelGiro(CATALOGO, 'tienda')!;
    const { documento } = armar(tienda, DATOS_VACIOS);
    expect(validarDocumentoSitio(documento).ok).toBe(true);
    const hero = inicioDe(documento).secciones[0];
    expect(hero.contenido.title).toBe('Bienvenido a nuestra tienda');
    expect(documento.shell.header.opciones.show_topbar).toBe(false);
  });
});

describe('portada', () => {
  it('prefiere el banner del sitio viejo, luego la portada de la sede, luego una foto de producto', () => {
    expect(bannerDelSitio(borradorImportado())).toBe(BANNER);
    const sinBanner = { ...borradorImportado(), paginas: borradorImportado().paginas.filter((p) => !esInicio(p)) };
    const hotel = plantillaPorDefectoDelGiro(CATALOGO, 'hotel')!;
    const conPortada = armar(hotel, { ...DATOS, portadaUrl: 'https://example.com/sede.jpg' }, sinBanner);
    expect(inicioDe(conPortada.documento).secciones[0].contenido.image_url).toBe('https://example.com/sede.jpg');
    const conFoto = armar(hotel, DATOS, sinBanner);
    expect(inicioDe(conFoto.documento).secciones[0].contenido.image_url).toBe('https://example.com/p11.jpg');
  });
});

describe('enganche de sede: construirSitioDePlantilla (fuente única)', () => {
  it('usa la plantilla por defecto del giro; sin estilo, el tema sigue como venía (heredado en una sede)', () => {
    const base = borradorImportado();
    const d = construirSitioDePlantilla('restaurante', base, generador(), { conEstilo: false });
    expect(validarDocumentoSitio(d).ok).toBe(true);
    expect(d.tema).toEqual(base.tema);
    expect(inicioDe(d).secciones.map((s) => s.tipo)).toEqual(plantillaPorDefectoDelGiro(CATALOGO_PLANTILLAS, 'restaurante')!.inicio.map(([t]) => t));
    expect(d.shell.header.opciones.header_cta_text).toBe('Reservar mesa');
  });

  it('el catálogo del servidor es el mismo de Diseño y Plantillas', () => {
    expect(CATALOGO_PLANTILLAS).toEqual(CATALOGO);
  });
});

describe('opción por defecto del diálogo', () => {
  it('«Plantilla completa» si nunca se publicó el sitio nuevo; «Solo estilo» si ya es del dueño', () => {
    expect(modoPorDefecto(null)).toBe('completa');
    expect(modoPorDefecto({ revisionPublicadaId: null })).toBe('completa');
    expect(modoPorDefecto({ revisionPublicadaId: 'r1' })).toBe('estilo');
  });
});
