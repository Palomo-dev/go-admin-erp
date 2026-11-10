/**
 * Las 7 plantillas de tienda nuevas (Panorama, Atelier, Radiante, Roble, Marea, Contraste y Hogar;
 * PLANO §1 y §4, aprobadas el 2026-11-10) en el catálogo y en «Plantilla completa»:
 * - cumplen el contrato del documento con y sin las banderas que ya existen;
 * - cada sección que arman es un `tipo · variante` que el sitio pinta (SECTION_MAP de
 *   goadmin-websites, cuando el repositorio está al lado) con claves que el sitio lee;
 * - Inicio, ficha y categoría con las variantes de su lámina; la ficha y la categoría del borrador
 *   se REEMPLAZAN (D4) conservando id, dirección y si estaban publicadas;
 * - tarjeta, perillas, acento y paginación solo con su bandera;
 * - las plantillas de antes dan el MISMO documento que antes, byte a byte («Solo estilo» y
 *   «Plantilla completa»): huellas generadas en la rama base con las mismas entradas
 *   (`fixtures/huellasPlantillasMain.json`).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { createHash } from 'crypto';
import { validarDocumentoSitio, type DocumentoSitio, type PaginaSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import {
  IDS_PLANTILLAS_TIENDA,
  construirCatalogo,
  esPlantillaTiendaNueva,
  plantillaPorId,
  plantillasDelGiro,
  tieneSerifa,
  type PlantillaCatalogo,
} from '@/lib/website/contrato/catalogoPlantillas';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import {
  CLAVES_AJUSTE_TIENDA,
  CLAVES_SECCION_TIENDA,
  VARIANTES_TIENDA,
  normalizarBloqueColor,
} from '@/lib/website/contrato/seccionesTienda';
import { normalizarTarjeta } from '@/lib/website/tarjetaProducto';
import { leerMenuInferior } from '@/lib/website/menuInferior';
import { OPCIONES_SHELL, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { esInicio } from '@/components/sitio-web/paginas/tipoPagina';
import { armarPlantillaCompleta, DATOS_VACIOS, type DatosNegocio, type OpcionesPlantillaCompleta } from '../plantillaCompleta';
import { aplicarEstiloPlantilla } from '../usarPlantilla';
import { shellDePlantilla } from '../shellPorPlantilla';
import { borradorTienda, DATOS_TIENDA, generadorIds } from './fixtures/entradasPlantillasTienda';
import HUELLAS_MAIN from './fixtures/huellasPlantillasMain.json';

const CATALOGO = construirCatalogo(TEMPLATE_PRESETS);
const NUEVAS = IDS_PLANTILLAS_TIENDA.map((id) => plantillaPorId(CATALOGO, id)!);
const DATOS = DATOS_TIENDA as DatosNegocio;
const TODAS_LAS_BANDERAS = { tarjeta: true, tokensDiseno: true, paginacion: true } as const;

const armar = (p: PlantillaCatalogo, extra: Partial<OpcionesPlantillaCompleta> = {}, base: DocumentoSitio = borradorTienda(), datos: DatosNegocio = DATOS) =>
  armarPlantillaCompleta(base, p, datos, { extendidos: true, generarId: generadorIds(), ...extra });

const paginaDeTipo = (d: DocumentoSitio, tipo: string): PaginaSitio | undefined => d.paginas.find((p) => p.tipo === tipo);
const tiposVariantes = (secciones: readonly SeccionSitio[]) => secciones.map((s) => `${s.tipo}.${s.variante}`);
const visibles = (p: PaginaSitio) => p.secciones.filter((s) => s.visibilidad.movil || s.visibilidad.escritorio);

// ─── SECTION_MAP del sitio (goadmin-websites al lado, como en plantillasContrato.test.ts) ──────

const RAIZ_ERP = path.resolve(__dirname, '../../../../..');
const DIR_SITIO = process.env.GOADMIN_WEBSITES_DIR || path.resolve(RAIZ_ERP, '../goadmin-websites');
const ARCHIVO_SECTION_MAP = path.join(DIR_SITIO, 'components/sections/SectionRenderer.tsx');
const HAY_SITIO = fs.existsSync(ARCHIVO_SECTION_MAP);

/** `tipo` → variantes que el sitio pinta, leídas del literal `SECTION_MAP` con el AST de TypeScript. */
function leerSectionMap(): Map<string, Set<string>> {
  const fuente = ts.createSourceFile(ARCHIVO_SECTION_MAP, fs.readFileSync(ARCHIVO_SECTION_MAP, 'utf8'), ts.ScriptTarget.Latest, true);
  const mapa = new Map<string, Set<string>>();
  const nombre = (n: ts.PropertyName) => (ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : n.getText());
  const visitar = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && ts.isIdentifier(nodo.name) && nodo.name.text === 'SECTION_MAP' && nodo.initializer && ts.isObjectLiteralExpression(nodo.initializer)) {
      for (const tipo of nodo.initializer.properties) {
        if (!ts.isPropertyAssignment(tipo) || !ts.isObjectLiteralExpression(tipo.initializer)) continue;
        mapa.set(
          nombre(tipo.name),
          new Set(tipo.initializer.properties.filter(ts.isPropertyAssignment).map((v) => nombre(v.name))),
        );
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return mapa;
}

/** Sin el sitio al lado: las variantes del catálogo del editor más las del contrato de tienda. */
function variantesConocidas(): (tipo: string, variante: string) => boolean {
  if (HAY_SITIO) {
    const mapa = leerSectionMap();
    return (tipo, variante) => mapa.get(tipo)?.has(variante) === true;
  }
  return (tipo, variante) =>
    ((VARIANTES_TIENDA as Record<string, readonly string[]>)[tipo] ?? []).includes(variante) ||
    !!getSectionDefinition(tipo)?.variants.some((v) => v.id === variante);
}

/**
 * Claves que el sitio lee y el catálogo del editor aún no declara (E4 las ofrece en el
 * inspector). Cada una con el archivo del sitio que la lee: con el repositorio al lado, la prueba
 * comprueba que de verdad aparezca allí.
 */
const CLAVES_QUE_LEE_EL_SITIO: Readonly<Record<string, string>> = {
  section_background: 'components/sections/SectionWrapperBase.tsx',
  padding_top: 'components/sections/SectionWrapperBase.tsx',
  padding_bottom: 'components/sections/SectionWrapperBase.tsx',
  padding_x: 'components/sections/SectionWrapperBase.tsx',
  banner_layout: 'lib/website/distribucionBanner.ts',
  gallery_layout: 'components/sections/product-detail/ProductGallery.tsx',
  thumbnails_position: 'components/sections/product-detail/ProductGallery.tsx',
  buttons_layout: 'components/sections/product-detail/ProductActions.tsx',
  related_products_layout: 'components/sections/product-detail/RelatedProductsSection.tsx',
};

function clavesPermitidas(tipo: string, variante: string): Set<string> {
  return new Set([
    ...(getSectionDefinition(tipo)?.contentFields.map((f) => f.key) ?? []),
    ...(CLAVES_SECCION_TIENDA[`${tipo}.${variante}`] ?? []),
    ...(CLAVES_AJUSTE_TIENDA[tipo] ?? []),
    ...(CLAVES_AJUSTE_TIENDA[`${tipo}.${variante}`] ?? []),
    ...Object.keys(CLAVES_QUE_LEE_EL_SITIO),
  ]);
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────────────────────

describe('catálogo: las 7 plantillas de tienda nuevas', () => {
  test('están en el giro tienda, sin bandera, y la de por defecto sigue siendo «Retail Moderno»', () => {
    expect(NUEVAS.map((p) => p.nombre)).toEqual(['Panorama', 'Atelier', 'Radiante', 'Roble', 'Marea', 'Contraste', 'Hogar']);
    for (const p of NUEVAS) {
      expect(p.giro).toBe('tienda');
      expect(p.porDefecto).toBe(false);
      expect(esPlantillaTiendaNueva(p.id)).toBe(true);
    }
    expect(plantillasDelGiro(CATALOGO, 'tienda')[0].id).toBe('retail_modern');
    expect(esPlantillaTiendaNueva('retail_modern')).toBe(false);
  });

  test('cada una se apoya en una plantilla del sitio que ya existe (no hace falta un preset nuevo)', () => {
    const bases = new Set(TEMPLATE_PRESETS.filter((t) => t.business_type === 'retail').map((t) => t.id));
    expect(Object.fromEntries(NUEVAS.map((p) => [p.id, p.base]))).toEqual({
      retail_panorama: 'retail_modern',
      retail_atelier: 'retail_elegant',
      retail_radiante: 'retail_classic',
      retail_roble: 'retail_modern',
      retail_marea: 'retail_bold',
      retail_contraste: 'retail_bold',
      retail_hogar: 'retail_modern',
    });
    for (const p of NUEVAS) expect(bases.has(p.base)).toBe(true);
  });

  test('las plantillas de antes no traen ningún campo nuevo', () => {
    for (const p of CATALOGO.plantillas.filter((x) => !esPlantillaTiendaNueva(x.id))) {
      expect([p.tarjetaProducto, p.tokens, p.detalle, p.carrusel, p.paginacion, p.estilo.secundario, p.estilo.acentoSecundario]).toEqual(Array(7).fill(undefined));
      expect(p.inicio.every((s) => s.length === 2)).toBe(true);
    }
  });

  test('la tarjeta de cada una pasa el normalizador del contrato sin perder ni cambiar nada', () => {
    for (const p of NUEVAS) expect({ id: p.id, tarjeta: normalizarTarjeta(p.tarjetaProducto) }).toEqual({ id: p.id, tarjeta: p.tarjetaProducto });
  });

  test('Instrument Serif cuenta como serifa (descripción del par en Diseño)', () => {
    expect(tieneSerifa('Instrument Serif')).toBe(true);
  });
});

// ─── Plantilla completa de cada una ───────────────────────────────────────────────────────────

describe.each(NUEVAS.map((p) => [p.id, p] as const))('«Plantilla completa» de %s', (_id, plantilla) => {
  const { documento, resumen } = armar(plantilla, TODAS_LAS_BANDERAS);
  const conVariante = variantesConocidas();

  test('cumple el contrato del documento, con y sin las banderas', () => {
    for (const d of [documento, armar(plantilla).documento, armar(plantilla, { ...TODAS_LAS_BANDERAS, extendidos: false }).documento]) {
      const r = validarDocumentoSitio(d);
      if (!r.ok) throw new Error(JSON.stringify(r.errores));
    }
    // Sin datos de la organización también.
    const vacia = validarDocumentoSitio(armar(plantilla, TODAS_LAS_BANDERAS, borradorTienda(), DATOS_VACIOS).documento);
    if (!vacia.ok) throw new Error(JSON.stringify(vacia.errores));
  });

  test('cada sección de Inicio, ficha y categoría es una variante que el sitio pinta, con claves que el sitio lee', () => {
    const paginas = [documento.paginas.find((p) => esInicio(p))!, paginaDeTipo(documento, 'product_detail')!, paginaDeTipo(documento, 'category_detail')!];
    for (const pagina of paginas) {
      for (const s of pagina.secciones) {
        expect({ pagina: pagina.slug, seccion: `${s.tipo}.${s.variante}`, pinta: conVariante(s.tipo, s.variante ?? '') }).toEqual({
          pagina: pagina.slug,
          seccion: `${s.tipo}.${s.variante}`,
          pinta: true,
        });
        const permitidas = clavesPermitidas(s.tipo, s.variante ?? '');
        for (const k of Object.keys(s.contenido)) {
          expect({ seccion: `${s.tipo}.${s.variante}`, clave: k, lee: permitidas.has(k) }).toEqual({ seccion: `${s.tipo}.${s.variante}`, clave: k, lee: true });
        }
      }
    }
  });

  test('Inicio sigue la lámina, en su orden, y arranca con la portada', () => {
    const inicio = documento.paginas.find((p) => esInicio(p))!;
    const bloques = Math.min(DATOS.categorias.length, 5);
    const esperada = plantilla.inicio.flatMap(([t, v]) => (t === 'image_text' && v === 'color_block' ? Array(bloques).fill(`${t}.${v}`) : [`${t}.${v}`]));
    expect(tiposVariantes(inicio.secciones)).toEqual(esperada);
    expect(visibles(inicio)[0].tipo).toBe('hero');
  });

  test('ficha y categoría con los bloques de la lámina (D4)', () => {
    expect(tiposVariantes(paginaDeTipo(documento, 'product_detail')!.secciones)).toEqual(plantilla.detalle!.producto.map(([t, v]) => `${t}.${v}`));
    expect(tiposVariantes(paginaDeTipo(documento, 'category_detail')!.secciones)).toEqual(plantilla.detalle!.categoria.map(([t, v]) => `${t}.${v}`));
    expect(resumen.paginas).toBe(documento.paginas.filter((p) => p.tipo !== 'cart' && p.tipo !== 'checkout' && p.id !== 'terminos').length);
  });

  test('no deja enlaces sin resolver ni inventa cifras, cupones o reseñas', () => {
    const texto = JSON.stringify(documento.paginas);
    expect(texto).not.toMatch(/@pagina:/);
    for (const p of documento.paginas) {
      for (const s of p.secciones) {
        if (['testimonials', 'stats', 'brands', 'transformation', 'shop_the_look', 'product_anatomy', 'welcome_popup'].includes(s.tipo)) {
          expect(s.contenido.items).toBeUndefined();
        }
        if (s.tipo === 'welcome_popup') {
          expect(s.contenido.coupon_code).toBeUndefined();
          expect(s.visibilidad).toEqual({ movil: false, escritorio: false });
        }
        if (s.tipo === 'promo_banners') {
          for (const b of (s.contenido.banners as Record<string, unknown>[] | undefined) ?? []) expect(b.coupon_code).toBeUndefined();
        }
      }
    }
  });

  test('encabezado y pie de la lámina, con opciones válidas del contrato', () => {
    const lamina = shellDePlantilla(plantilla.id, 'tienda');
    expect(documento.shell.header.composicion).toBe(lamina.encabezado.composicion);
    expect(documento.shell.footer.composicion).toBe(lamina.pie.composicion);
    for (const zona of ['header', 'footer'] as const) {
      for (const [clave, valor] of Object.entries(documento.shell[zona].opciones)) {
        expect({ clave, zona: OPCIONES_SHELL[clave]?.zona, valor: normalizarOpcionShell(clave, valor) }).toEqual({ clave, zona, valor });
      }
    }
    const menu = leerMenuInferior(documento.shell.header.opciones);
    if (menu) expect({ enabled: menu.enabled, variant: menu.variant, items: menu.items.length }).toEqual({ enabled: true, variant: 'tabs', items: 5 });
  });
});

// ─── Casos de cada lámina ─────────────────────────────────────────────────────────────────────

describe('lo propio de cada lámina', () => {
  const doc = (id: string, extra: Partial<OpcionesPlantillaCompleta> = TODAS_LAS_BANDERAS) => armar(plantillaPorId(CATALOGO, id)!, extra).documento;
  const inicio = (d: DocumentoSitio) => d.paginas.find((p) => esInicio(p))!;
  const seccion = (p: PaginaSitio, tipoVariante: string) => p.secciones.find((s) => `${s.tipo}.${s.variante}` === tipoVariante)!;

  test('Panorama: píldora transparente, pie oscuro propio como tarjeta y portada con buscador', () => {
    const d = doc('retail_panorama');
    expect(d.shell.header.composicion).toBe('pill');
    expect(d.shell.header.opciones.header_transparent_over_hero).toBe(true);
    // W1: con el tema de V2, `dark` se repinta con el tema; el pie oscuro va como `custom`.
    expect(d.shell.footer.opciones).toMatchObject({ footer_background: 'custom', footer_custom_bg_color: '#111111', footer_inset: true });
    expect(seccion(inicio(d), 'hero.search').contenido).toMatchObject({ inset: true, search_placeholder: '¿Qué buscas?' });
    expect(seccion(inicio(d), 'link_cloud.pills').contenido.source).toBe('categories');
  });

  test('Atelier: enlaces grandes en el pie, galería en mosaico y «Se lleva con» en la ficha', () => {
    const d = doc('retail_atelier');
    expect(d.shell.footer.opciones.footer_links_style).toBe('display');
    const ficha = paginaDeTipo(d, 'product_detail')!;
    expect(seccion(ficha, 'product_gallery.default').contenido).toMatchObject({ gallery_layout: 'mosaic', thumbnails_position: 'none' });
    expect(seccion(ficha, 'product_actions.default').contenido).toMatchObject({ button_hint: 'auto' });
    expect(seccion(ficha, 'complete_the_look.default').contenido).toMatchObject({ source: 'tag' });
    // La portada lleva su botón a Productos (una página real).
    expect(seccion(inicio(d), 'hero.fullscreen').contenido).toMatchObject({ cta_text: 'Ver la colección', cta_url: '/productos', show_cta: true });
  });

  test('Radiante: acento amarillo, botón «Comprar» en píldora, barra tipo app y marca gigante', () => {
    const d = doc('retail_radiante');
    expect(d.tema.colores.acento).toEqual({ mode: 'value', value: '#F2F06B' });
    expect(d.shell.header.opciones).toMatchObject({ header_cta_text: 'Comprar', header_cta_url: '/productos', header_cta_shape: 'pill' });
    expect(d.shell.footer.opciones.footer_brand_display).toBe('giant');
    expect(seccion(inicio(d), 'hero.floating').contenido).toMatchObject({ buttons: [{ label: 'Comprar', url: '/productos', variant: 'solid' }] });
    // «Blog» sin banners y antes y después sin fotos: ocultas.
    const blog = inicio(d).secciones.find((s) => s.tipo === 'promo_banners')!;
    expect(blog.visibilidad).toEqual({ movil: false, escritorio: false });
    expect(seccion(inicio(d), 'transformation.slider').visibilidad).toEqual({ movil: false, escritorio: false });
  });

  test('Roble: segundo botón a Contacto (no hay Showroom), índice de piezas y botón enlace en la portada', () => {
    const d = doc('retail_roble');
    expect(d.shell.header.opciones).toMatchObject({ header_cta2_text: 'Contacto', header_cta2_url: '/contacto' });
    expect(d.shell.header.opciones.header_cta_text).toBeUndefined();
    expect(seccion(inicio(d), 'hero.fullscreen').contenido.buttons).toEqual([{ label: 'Ver la colección', url: '/productos', variant: 'link' }]);
    expect(seccion(inicio(d), 'product_anatomy.default').visibilidad).toEqual({ movil: false, escritorio: false });
    expect(seccion(paginaDeTipo(d, 'category_detail')!, 'category_filters.default').contenido.subcategory_style).toBe('tabs');
  });

  test('Marea: secundario y acento propios; un bloque de color por categoría real, a todo el ancho', () => {
    const d = doc('retail_marea');
    expect(d.tema.colores.secundario).toEqual({ mode: 'value', value: '#0E2433' });
    expect(d.tema.colores.acento).toEqual({ mode: 'value', value: '#DBC6A4' });
    const bloques = inicio(d).secciones.filter((s) => s.variante === 'color_block');
    expect(bloques).toHaveLength(5);
    expect(bloques.map((b) => normalizarBloqueColor(b.contenido).title)).toEqual(['Sala', 'Iluminación', 'Textiles', 'Alfombras', 'Decoración']);
    expect(bloques[0].contenido).toMatchObject({
      number: '01',
      image_url: 'https://example.com/c1.jpg',
      bg_color: '#C2410C',
      cta_url: '/categorias/sala',
      full_bleed: true,
      padding_top: 'none',
      padding_bottom: 'none',
      padding_x: 'none',
    });
    // Color que no es hex: el del tema. Sin foto de la categoría: la de un producto suyo.
    expect(bloques[1].contenido.bg_color).toBeUndefined();
    expect(bloques[1].contenido.image_url).toBe('https://example.com/p23.jpg');
    expect(bloques.every((b) => b.visibilidad.escritorio)).toBe(true);
    // Sin categorías: una sola sección vacía y oculta para que el dueño la complete.
    const sinCategorias = armar(plantillaPorId(CATALOGO, 'retail_marea')!, {}, borradorTienda(), { ...DATOS, categorias: [] }).documento;
    const solo = inicio(sinCategorias).secciones.filter((s) => s.variante === 'color_block');
    expect(solo).toHaveLength(1);
    expect(solo[0].visibilidad).toEqual({ movil: false, escritorio: false });
    expect(seccion(paginaDeTipo(d, 'product_detail')!, 'product_actions.default').contenido.show_price_in_button).toBe(true);
  });

  test('Contraste: mayúsculas en los botones (token + interruptor del shell) y filtros laterales seguidos de la rejilla', () => {
    const d = doc('retail_contraste');
    expect(d.tema.tokens?.boton?.mayusculas).toEqual({ mode: 'value', value: true });
    expect(d.shell.header.opciones.buttons_uppercase_active).toBe(true);
    const categoria = paginaDeTipo(d, 'category_detail')!;
    const i = categoria.secciones.findIndex((s) => s.variante === 'sidebar_facets');
    expect(categoria.secciones[i + 1].tipo).toBe('category_products');
    expect(seccion(inicio(d), 'promo_banners.grid').contenido.banner_layout).toBe('triple_center');
    expect(seccion(inicio(d), 'text_block.inline_icons').contenido.segments).toEqual([
      { text: 'Sala' },
      { icon: 'Sparkles' },
      { text: 'Iluminación' },
      { icon: 'Sparkles' },
      { text: 'Textiles' },
      { icon: 'Sparkles' },
      { text: 'Alfombras' },
      { icon: 'Sparkles' },
      { text: 'Decoración' },
      { icon: 'Sparkles' },
      { text: 'Exterior' },
    ]);
  });

  test('Hogar (D5): primario #1C1A18 y acento #B4583A; hover sutil, carrusel en barra y cargar más', () => {
    const d = doc('retail_hogar');
    expect(d.tema.colores.primario).toEqual({ mode: 'value', value: '#1C1A18' });
    expect(d.tema.colores.acento).toEqual({ mode: 'value', value: '#B4583A' });
    expect(d.tema.tokens?.hover).toEqual({ mode: 'value', value: 'sutil' });
    expect(d.tema.carrusel).toEqual({ mode: 'value', value: { indicador: 'barra' } });
    expect(d.tema.paginacion).toEqual({ mode: 'value', value: { estilo: 'cargar_mas' } });
    expect(seccion(inicio(d), 'hero.split_products').contenido.product_ids).toEqual([21, 22, 23]);
    expect(seccion(inicio(d), 'welcome_popup.coupon').contenido.enabled).toBe(false);
    expect(seccion(paginaDeTipo(d, 'category_detail')!, 'category_header.default').contenido).toMatchObject({ layout: 'split_text' });
    expect(tiposVariantes(paginaDeTipo(d, 'product_detail')!.secciones).at(-1)).toBe('product_pager.default');
  });
});

// ─── Tema: solo con su bandera ────────────────────────────────────────────────────────────────

describe('tarjeta, perillas y paginación: solo con su bandera (ya existentes)', () => {
  const contraste = plantillaPorId(CATALOGO, 'retail_contraste')!;
  const hogar = plantillaPorId(CATALOGO, 'retail_hogar')!;

  test('sin banderas no se escribe tarjeta, paginación ni carrusel; las perillas propias de la plantilla sí', () => {
    const base = borradorTienda();
    const { tema } = armar(hogar, {}, base).documento;
    expect(tema.tarjetaProducto).toBeUndefined();
    // Hover y mayúsculas de las 7 nuevas no dependen de la bandera de estilos combinables (el sitio los pinta).
    expect(tema.tokens).toEqual({ ...(base.tema.tokens ?? {}), hover: { mode: 'value', value: hogar.tokens!.hover } });
    expect(tema.paginacion).toBeUndefined();
    expect(tema.carrusel).toBeUndefined();
  });

  test('con banderas: la tarjeta de la lámina tal cual y las perillas fusionadas con las que había', () => {
    const { tema } = armar(contraste, TODAS_LAS_BANDERAS).documento;
    expect(tema.tarjetaProducto).toEqual({ mode: 'value', value: contraste.tarjetaProducto });
    expect(tema.tokens).toEqual({
      radio: { mode: 'value', value: 'suave' },
      boton: { forma: { mode: 'value', value: 'redondeado' }, mayusculas: { mode: 'value', value: true } },
    });
    // Copia: el documento no comparte objetos con el catálogo.
    expect((tema.tarjetaProducto as { value: unknown }).value).not.toBe(contraste.tarjetaProducto);
  });

  test('una sede (sin estilo) no escribe tarjeta ni perillas, aunque haya banderas', () => {
    const base = borradorTienda();
    const { tema } = armar(contraste, { ...TODAS_LAS_BANDERAS, conEstilo: false }, base).documento;
    expect(tema).toEqual(base.tema);
  });

  test('«Solo estilo» escribe el acento solo de las que lo traen; tarjeta y perillas no son estilo', () => {
    const base = borradorTienda();
    const radiante = aplicarEstiloPlantilla(base, plantillaPorId(CATALOGO, 'retail_radiante')!, true);
    expect(radiante.tema.colores.acento).toEqual({ mode: 'value', value: '#F2F06B' });
    expect(radiante.tema.tarjetaProducto).toBeUndefined();
    const panorama = aplicarEstiloPlantilla(base, plantillaPorId(CATALOGO, 'retail_panorama')!, true);
    expect(panorama.tema.colores.acento).toEqual(base.tema.colores.acento);
  });
});

// ─── Páginas de detalle: reemplazo (D4) solo en las nuevas ────────────────────────────────────

describe('ficha y categoría (D4)', () => {
  test('las nuevas REEMPLAZAN la ficha del borrador: conservan id, dirección y si estaba publicada', () => {
    const base = borradorTienda();
    const { documento } = armar(plantillaPorId(CATALOGO, 'retail_atelier')!, {}, base);
    const ficha = paginaDeTipo(documento, 'product_detail')!;
    expect({ id: ficha.id, slug: ficha.slug, publicada: ficha.publicada, titulo: ficha.titulo }).toEqual({
      id: 'ficha',
      slug: 'plantillas/product-detail',
      publicada: false,
      titulo: 'Detalle del producto',
    });
    expect(ficha.secciones.map((s) => s.tipo)).not.toContain(undefined);
    expect(ficha.secciones[0].contenido).toEqual({ gallery_layout: 'mosaic', thumbnails_position: 'none' });
    // La categoría no existía: nace en su dirección canónica, publicada.
    const categoria = paginaDeTipo(documento, 'category_detail')!;
    expect({ slug: categoria.slug, publicada: categoria.publicada }).toEqual({ slug: 'plantillas/category-detail', publicada: true });
    // Carrito y checkout se conservan tal cual; nada se duplica.
    for (const id of ['cart', 'checkout']) expect(documento.paginas.find((p) => p.id === id)).toEqual(base.paginas.find((p) => p.id === id));
    expect(documento.paginas.filter((p) => p.tipo === 'product_detail')).toHaveLength(1);
    expect(new Set(documento.paginas.map((p) => p.id)).size).toBe(documento.paginas.length);
  });

  test('las plantillas de tienda de antes siguen CONSERVANDO las páginas de detalle', () => {
    for (const id of ['retail_modern', 'retail_classic', 'retail_bold', 'retail_elegant']) {
      const base = borradorTienda();
      const { documento } = armar(plantillaPorId(CATALOGO, id)!, TODAS_LAS_BANDERAS, base);
      expect(paginaDeTipo(documento, 'product_detail')).toEqual(base.paginas.find((p) => p.id === 'ficha'));
      expect(paginaDeTipo(documento, 'category_detail')).toBeUndefined();
    }
  });
});

// ─── Las plantillas de antes: el mismo documento que en la rama base ──────────────────────────

describe('las plantillas de antes dan el mismo documento que antes (huellas de la rama base)', () => {
  const huella = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const huellas = HUELLAS_MAIN as Record<string, Record<string, string>>;
  const viejas = CATALOGO.plantillas.filter((p) => !esPlantillaTiendaNueva(p.id));

  test('son las mismas 33 que había', () => {
    expect(viejas.map((p) => p.id).sort()).toEqual(Object.keys(huellas).sort());
  });

  test.each(viejas.map((p) => [p.id, p] as const))('%s: «Solo estilo» y «Plantilla completa» byte a byte', (id, p) => {
    expect({
      estiloExtendido: huella(aplicarEstiloPlantilla(borradorTienda(), p, true)),
      estiloBasico: huella(aplicarEstiloPlantilla(borradorTienda(), p, false)),
      // Documento y resumen. Con las banderas encendidas: las de antes no traen tarjeta ni perillas.
      completa: huella(armar(p, TODAS_LAS_BANDERAS)),
      completaSede: huella(armar(p, { extendidos: false, conEstilo: false })),
    }).toEqual(huellas[id]);
  });
});

(HAY_SITIO ? describe : describe.skip)('contra goadmin-websites (al lado)', () => {
  test('las claves que el catálogo del editor aún no declara sí las lee el sitio', () => {
    for (const [clave, archivo] of Object.entries(CLAVES_QUE_LEE_EL_SITIO)) {
      const fuente = fs.readFileSync(path.join(DIR_SITIO, archivo), 'utf8');
      expect({ clave, archivo, aparece: fuente.includes(clave) }).toEqual({ clave, archivo, aparece: true });
    }
  });
});
