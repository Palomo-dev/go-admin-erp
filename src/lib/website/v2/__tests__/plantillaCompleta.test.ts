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
import type { Giro } from '@/components/sitio-web/paginas/plantillasPagina';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { OPCIONES_SHELL, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import { RUTAS_SITIO_PUBLICO, SHELL_POR_PLANTILLA } from '@/lib/website/v2/shellPorPlantilla';
import { esInicio, esPaginaLegal, esPlantillaTienda } from '@/components/sitio-web/paginas/tipoPagina';
import {
  COMPOSICIONES_ENCABEZADO,
  COMPOSICIONES_PIE,
  DATOS_VACIOS,
  shellDePlantilla,
  shellPorDefectoDelDocumento,
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

  it('trae encabezado y pie con composiciones que el sitio pinta y opciones válidas del contrato', () => {
    const { header, footer } = documento.shell;
    expect(COMPOSICIONES_ENCABEZADO).toContain(header.composicion);
    expect(COMPOSICIONES_PIE).toContain(footer.composicion);
    for (const [clave, valor] of Object.entries(header.opciones)) {
      expect({ clave, zona: OPCIONES_SHELL[clave]?.zona }).toEqual({ clave, zona: 'header' });
      expect({ clave, valor: normalizarOpcionShell(clave, valor) }).toEqual({ clave, valor });
    }
    for (const [clave, valor] of Object.entries(footer.opciones)) {
      expect({ clave, zona: OPCIONES_SHELL[clave]?.zona }).toEqual({ clave, zona: 'footer' });
      expect({ clave, valor: normalizarOpcionShell(clave, valor) }).toEqual({ clave, valor });
    }
    const lamina = shellDePlantilla(plantilla.id, plantilla.giro as never);
    expect(header.composicion).toBe(lamina.encabezado.composicion);
    expect(footer.composicion).toBe(lamina.pie.composicion);
    if (lamina.encabezado.boton) expect(header.opciones.header_cta_text).toBe(lamina.encabezado.boton.texto);
  });

  it('los botones del encabezado llevan a una página que existe, a una ruta del sitio o a WhatsApp / mapa', () => {
    const { opciones } = documento.shell.header;
    for (const clave of ['header_cta_url', 'header_cta2_url']) {
      const url = opciones[clave];
      if (url === undefined) continue;
      const u = String(url);
      const valido =
        u === 'whatsapp' || u === 'maps' || (RUTAS_SITIO_PUBLICO as readonly string[]).includes(u) || documento.paginas.some((p) => `/${p.slug}` === u);
      expect({ clave, u, valido }).toEqual({ clave, u, valido: true });
    }
  });

  it('trae menús: encabezado con sus páginas y los del pie de la plantilla, sin enlaces rotos', () => {
    const encabezado = documento.menus.find((m) => m.id === documento.shell.header.menuPrincipalId)!;
    expect(encabezado.items.length).toBeGreaterThanOrEqual(4);
    expect(encabezado.items[0].etiqueta).toBe('Inicio');
    const pie = documento.shell.footer.menuIds.map((id) => documento.menus.find((m) => m.id === id)!);
    expect(pie.length).toBeGreaterThan(0);
    for (const m of pie) {
      expect(m.items.length).toBeGreaterThan(0);
      for (const i of m.items) {
        if (i.tipo === 'page') expect(documento.paginas.some((p) => p.id === i.paginaId)).toBe(true);
        else if (i.tipo === 'custom') expect(RUTAS_SITIO_PUBLICO).toContain(i.url);
      }
    }
    // Ninguna página se repite entre dos menús del pie («Tratamiento de datos» es a propósito un
    // segundo enlace a la política de privacidad: va en la barra inferior del pie).
    const enPie = pie.flatMap((m) =>
      m.items.filter((i) => i.tipo === 'page' && i.etiqueta !== 'Tratamiento de datos').map((i) => (i as { paginaId: string }).paginaId),
    );
    expect(new Set(enPie).size).toBe(enPie.length);
  });

  it('pie según la lámina: «Hecho con…» solo si la lámina lo trae; la tienda sin columna Contacto; «Tratamiento de datos» a la privacidad', () => {
    const shell = shellDePlantilla(plantilla.id, plantilla.giro as Giro);
    const opciones = documento.shell.footer.opciones;
    // El borrador de prueba ya lo había apagado: la decisión de la organización se conserva.
    expect(opciones.show_powered_by).toBe(false);
    // Sin decisión previa: solo las láminas que lo traen. true es el default del contrato (ausente = true).
    const sinEleccion = borradorImportado();
    sinEleccion.shell.footer.opciones = {};
    const limpio = armar(plantilla, DATOS, sinEleccion).documento.shell.footer.opciones;
    expect(limpio.show_powered_by ?? true).toBe(shell.pie.opciones.show_powered_by === true);
    if (plantilla.giro === 'tienda') expect(opciones.footer_show_contact).toBe(false);
    const legales = documento.menus.find((m) => m.nombre === 'Legales' && documento.shell.footer.menuIds.includes(m.id));
    if (legales) {
      const tratamiento = legales.items.find((i) => i.etiqueta === 'Tratamiento de datos');
      const privacidad = documento.paginas.find((p) => p.slug === 'privacidad');
      expect(tratamiento && tratamiento.tipo === 'page' ? tratamiento.paginaId : null).toBe(privacidad?.id ?? null);
    }
  });

  it('no copia anuncios de ejemplo de las láminas (no inventa precios ni promociones)', () => {
    expect(documento.shell.header.opciones.topbar_announcement).toBeUndefined();
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
      // La Carta QR de la mesa (Figma 2032:75742): fuera del menú, con las secciones de la lámina 17.
      'carta-qr',
      'plantillas/cart', 'plantillas/checkout', 'terminos',
    ]);
    const cartaQr = documento.paginas.find((p) => p.slug === 'carta-qr')!;
    expect(cartaQr.secciones.map((s) => `${s.tipo}:${s.variante}`)).toEqual([
      'restaurant_hero:mesa', 'table_service:barra', 'menu_full:qr', 'table_order:rondas',
      'table_bill:hoja', 'visit_feedback:tarjeta', 'hours_location:list',
    ]);
    // Nacen con los textos del contrato (contenido vacío) y visibles.
    expect(cartaQr.secciones.filter((s) => s.tipo !== 'hours_location').every((s) => Object.keys(s.contenido).length === 0)).toBe(true);
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

  it('encabezado y pie de la lámina «Noir Omakase»; conserva «Hecho con…»', () => {
    expect(documento.shell.header.composicion).toBe('default');
    expect(documento.shell.header.opciones).toMatchObject({
      header_cta_text: 'Reservar mesa',
      header_cta_url: '/reservas-mesa',
      logo_position: 'center',
      show_topbar: true,
      topbar_show_branch_status: true,
      header_show_language: true,
      show_header_cart: false,
      show_header_auth: false,
      search_style: 'hidden',
      mobile_menu_style: 'fullscreen',
      mobile_bottom_bar: 'auto',
    });
    expect(documento.shell.footer.composicion).toBe('centered');
    expect(documento.shell.footer.opciones).toMatchObject({ footer_background: 'tema', footer_show_hours: true, footer_show_whatsapp: true, show_powered_by: false });
    expect(documento.shell.footer.menuIds.map((id) => documento.menus.find((m) => m.id === id)!.nombre)).toEqual(['Legales']);
  });

  it('la política nueva nace con su texto base vacío, nunca con textos de otra sección', () => {
    const privacidad = documento.paginas.find((p) => p.slug === 'privacidad')!;
    expect(privacidad.secciones.map((x) => x.contenido)).toEqual([{ title: 'Política de privacidad', content: '' }]);
  });

  it('conserva el texto legal real y lo enlaza en «Legales»', () => {
    const terminos = documento.paginas.find((p) => p.slug === 'terminos')!;
    expect(terminos.secciones[0].contenido.body).toBe('Texto real de la organización');
    const legales = documento.menus.find((m) => m.nombre === 'Legales')!;
    expect(legales.items.map((i) => i.etiqueta).sort()).toEqual(['Política de privacidad', 'Tratamiento de datos', 'Términos y condiciones']);
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
    expect(documento.shell.header.opciones).toMatchObject({ show_topbar: true, topbar_show_free_shipping: true });
    // Sin categorías en el Inventario, el megamenú lleva las páginas del catálogo.
    const mega = documento.menus.find((m) => m.id === documento.shell.header.menuMegaId)!;
    expect(mega.items.map((i) => i.etiqueta)).toEqual(['Productos', 'Categorías', 'Ofertas']);
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

describe('encabezado y pie por plantilla (láminas aprobadas en Figma)', () => {
  const de = (id: string) => armar(plantillaPorId(CATALOGO, id)!).documento;
  const nombresPie = (d: DocumentoSitio) => d.shell.footer.menuIds.map((id) => d.menus.find((m) => m.id === id)!.nombre);

  it('cada plantilla del catálogo tiene su lámina (salvo transporte y parqueadero, que usan la del giro)', () => {
    for (const p of CATALOGO.plantillas) {
      if (p.giro === 'transporte' || p.giro === 'parqueadero') continue;
      expect({ id: p.id, lamina: p.id in SHELL_POR_PLANTILLA }).toEqual({ id: p.id, lamina: true });
    }
  });

  it('«Velvet Lounge»: segundo botón «Eventos» a una página Eventos real y menú «Eventos» en el pie', () => {
    const d = de('velvet_lounge');
    expect(d.shell.header.opciones).toMatchObject({ header_cta2_text: 'Eventos', header_cta2_url: '/eventos', header_cta_url: '/reservas-mesa' });
    expect(d.paginas.some((p) => p.slug === 'eventos')).toBe(true);
    expect(nombresPie(d)).toEqual(['Eventos', 'Legales']);
  });

  it('«Carta QR»: menú desde las categorías de la carta, selector de sede, sin barra móvil y página de alérgenos', () => {
    const d = de('carta_qr');
    expect(d.shell.header.opciones).toMatchObject({ header_menu_source: 'categorias_carta', header_show_branch_selector: true, mobile_bottom_bar: 'ninguna' });
    expect(d.shell.header.opciones.header_cta_text).toBeUndefined();
    const alergenos = d.paginas.find((p) => p.slug === 'alergenos')!;
    expect(alergenos.secciones[1].contenido.title).toBe('Alérgenos e ingredientes');
    expect(nombresPie(d)).toEqual(['Alérgenos']);
  });

  it('«Retail Moderno»: megamenú con las categorías reales del Inventario', () => {
    const d = de('retail_modern');
    expect(d.shell.header.composicion).toBe('mega');
    const mega = d.menus.find((m) => m.id === d.shell.header.menuMegaId)!;
    expect(mega.items).toEqual([
      expect.objectContaining({ etiqueta: 'Entradas', tipo: 'entity', entidad: 'category', entidadId: '1' }),
      expect.objectContaining({ etiqueta: 'Platos fuertes', entidadId: '2' }),
      expect.objectContaining({ etiqueta: 'Bebidas', entidadId: '3' }),
    ]);
    expect(nombresPie(d)).toEqual(['Ayuda', 'Envíos y devoluciones', 'Legales']);
    expect(d.shell.header.opciones.mobile_bottom_bar).toEqual(['whatsapp', 'llamar', 'como_llegar']);
  });

  it('hotel: «Políticas» con su página y «Legales» sin repetirla; barra móvil del giro', () => {
    const d = de('hotel_luxury');
    expect(d.shell.header.opciones).toMatchObject({ header_cta_url: '/reservas', header_booking_bar: true, mobile_bottom_bar: ['reservar', 'llamar', 'como_llegar'] });
    expect(nombresPie(d)).toEqual(['Políticas', 'Legales']);
    const legales = d.menus.find((m) => m.nombre === 'Legales')!;
    expect(legales.items.map((i) => i.etiqueta)).not.toContain('Políticas de la estadía');
    // «Hotel Minimal» solo trae «Políticas»: ahí van también las legales.
    const minimal = de('hotel_minimal');
    const politicas = minimal.menus.find((m) => m.nombre === 'Políticas')!;
    expect(politicas.items.map((i) => i.etiqueta)).toEqual(expect.arrayContaining(['Políticas de la estadía', 'Política de privacidad']));
  });

  it('servicios y gimnasio: segundo botón (WhatsApp / prueba gratis) y barra móvil del giro', () => {
    expect(de('services_modern').shell.header.opciones).toMatchObject({
      header_cta_url: '/agendar',
      header_cta2_text: 'WhatsApp',
      header_cta2_url: 'whatsapp',
      mobile_bottom_bar: ['agendar', 'whatsapp', 'llamar'],
    });
    expect(de('gym_power').shell.header.opciones).toMatchObject({
      header_cta_url: '/membresias',
      header_cta2_text: 'Prueba gratis',
      header_cta2_url: '/contacto',
      mobile_bottom_bar: ['prueba', 'como_llegar', 'llamar'],
    });
  });

  it('parqueadero: «parqueadero_A» por defecto; «Parking Tech» usa la lámina B', () => {
    const porDefecto = armar(plantillaPorDefectoDelGiro(CATALOGO, 'parqueadero')!).documento;
    expect(porDefecto.shell.header.opciones).toMatchObject({ topbar_show_availability: true, header_cta2_url: 'maps', header_cta_url: '/tarifas' });
    expect(nombresPie(porDefecto)).toEqual(['Tarifas', 'Legales']);
    const b = de('parking_tech');
    expect(b.shell.header.composicion).toBe('minimal');
    expect(b.shell.header.opciones).toMatchObject({ header_cta_text: 'Cómo llegar', header_cta_url: 'maps' });
  });

  it('«Restablecer a la plantilla»: lee la plantilla del tema y resuelve contra las páginas de hoy', () => {
    const d = de('velvet_lounge');
    const r = shellPorDefectoDelDocumento(d, 'restaurante');
    expect(r.plantillaId).toBe('velvet_lounge');
    expect(r.nombre).toBe('Velvet Lounge');
    expect(r.header.opciones).toEqual(d.shell.header.opciones);
    expect(r.footer.composicion).toBe('three_columns');
    // Sin la página Eventos, el segundo botón no se pone (nunca un enlace roto).
    const sinEventos = { ...d, paginas: d.paginas.filter((p) => p.slug !== 'eventos') };
    expect(shellPorDefectoDelDocumento(sinEventos, 'restaurante').header.opciones.header_cta2_url).toBeUndefined();
  });
});
