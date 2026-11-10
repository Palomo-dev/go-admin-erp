/**
 * Catálogo de «Añadir sección» (Figma 05 Editor): ninguna sección queda oculta por el tipo de
 * la sede; el tipo solo ordena las recomendadas.
 */
// websitePageBuilderService crea el cliente del navegador al importarse: sin entorno en Jest.
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { SECTION_CATALOG } from '@/lib/services/websitePageBuilderService';
import { BRANCH_TYPES, type BranchType } from '@/types/branch';
import {
  GRUPOS_SECCIONES,
  RECOMENDADAS_POR_TIPO,
  VARIANTES_EN_CATALOGO,
  claveEntrada,
  coincideBusqueda,
  filtrarCatalogo,
  getSectionCatalogForBranch, tipoSedeDesdeGiro,
  normalizarBusqueda,
} from '../sectionsByBranchType';

/** Tipos de las tarjetas de tipo (sin las de variante destacada, que repiten su tipo). */
const tiposDe = (c: ReturnType<typeof getSectionCatalogForBranch>) =>
  c.grupos.flatMap((g) => g.secciones.filter((s) => !s.varianteDestacada).map((s) => s.type)).sort();
const TOTAL_TARJETAS = SECTION_CATALOG.length + VARIANTES_EN_CATALOGO.length;

describe('getSectionCatalogForBranch', () => {
  const todos = SECTION_CATALOG.map((s) => s.type).sort();

  test.each([null, undefined, ...BRANCH_TYPES.map((b) => b.value)])(
    'con tipo %s devuelve TODAS las secciones del catálogo, cada una una sola vez',
    (tipo) => {
      const c = getSectionCatalogForBranch(tipo as BranchType | null | undefined);
      expect(tiposDe(c)).toEqual(todos);
      expect(c.total).toBe(TOTAL_TARJETAS);
    },
  );

  test('un restaurante ya puede añadir Habitaciones (antes se filtraba)', () => {
    const c = getSectionCatalogForBranch('restaurant');
    expect(tiposDe(c)).toContain('room_types');
    expect(c.grupos.find((g) => g.id === 'hospedaje')?.secciones.map((s) => s.type)).toContain('room_types');
  });

  test('las recomendadas salen primero según el tipo y siguen en su grupo', () => {
    const c = getSectionCatalogForBranch('restaurant');
    expect(c.recomendadas.map(claveEntrada)).toEqual(RECOMENDADAS_POR_TIPO.restaurant);
    const carta = c.grupos.find((g) => g.id === 'carta');
    expect(carta?.secciones.map((s) => s.type)).toEqual(expect.arrayContaining(['menu_full', 'signature_dishes']));
  });

  test('restaurante: marquee, events y chef_team están disponibles aunque no sean recomendadas', () => {
    const c = getSectionCatalogForBranch('restaurant');
    const recomendadas = c.recomendadas.map((s) => s.type);
    for (const t of ['marquee', 'events', 'chef_team']) {
      expect(recomendadas).not.toContain(t);
      expect(tiposDe(c)).toContain(t);
    }
  });

  test('sin tipo de sede no hay recomendadas, pero sí todo el catálogo', () => {
    const c = getSectionCatalogForBranch(null);
    expect(c.recomendadas).toEqual([]);
    expect(c.total).toBe(TOTAL_TARJETAS);
  });

  test('en la plantilla de producto recomienda los bloques de la ficha', () => {
    const c = getSectionCatalogForBranch('restaurant', { pageType: 'product_detail' });
    expect(c.recomendadas.map((s) => s.type)).toEqual(
      GRUPOS_SECCIONES.find((g) => g.id === 'ficha_producto')?.tipos,
    );
  });

  test('toda recomendación existe en el catálogo (tipo, o tipo:variante de una tarjeta de variante)', () => {
    const existentes = new Set([...SECTION_CATALOG.map((s) => s.type), ...VARIANTES_EN_CATALOGO.map((v) => `${v.tipo}:${v.variante}`)]);
    for (const tipos of Object.values(RECOMENDADAS_POR_TIPO)) {
      for (const t of tipos) expect(existentes.has(t)).toBe(true);
    }
  });

  // Guardarraíl: al añadir un tipo al catálogo hay que darle grupo en GRUPOS_SECCIONES.
  test('todo tipo del catálogo está declarado en un grupo (nada cae en «Otras»)', () => {
    const c = getSectionCatalogForBranch(null);
    expect(c.grupos.find((g) => g.id === 'otras')).toBeUndefined();
  });

  test('una sección que ningún grupo declara cae en «Otras» en vez de desaparecer', () => {
    const nueva = { ...SECTION_CATALOG[0], type: 'seccion_nueva_sin_grupo' };
    const c = getSectionCatalogForBranch(null, { catalogo: [...SECTION_CATALOG, nueva] });
    expect(c.grupos.at(-1)?.id).toBe('otras');
    expect(c.grupos.at(-1)?.secciones.map((s) => s.type)).toEqual(['seccion_nueva_sin_grupo']);
  });
});

describe('búsqueda', () => {
  test('ignora tildes y mayúsculas', () => {
    expect(normalizarBusqueda('  MENÚ ')).toBe('menu');
  });

  test('«habitaciones» encuentra la sección de habitaciones', () => {
    const def = SECTION_CATALOG.find((s) => s.type === 'room_types')!;
    expect(coincideBusqueda(def, 'habitaciones')).toBe(true);
  });

  test('«carta» encuentra la carta completa y la destacada', () => {
    const r = filtrarCatalogo(getSectionCatalogForBranch(null), 'carta');
    const tipos = r.grupos.flatMap((g) => g.secciones.map((s) => s.type));
    expect(tipos).toEqual(expect.arrayContaining(['menu_full', 'menu_preview']));
  });

  test('sin coincidencias: 0 de N, grupos vacíos (estado «búsqueda sin resultados»)', () => {
    const c = getSectionCatalogForBranch('restaurant');
    const r = filtrarCatalogo(c, 'piscina');
    expect(r.coincidencias).toBe(0);
    expect(r.total).toBe(c.total);
    expect(r.recomendadas).toEqual([]);
    expect(r.grupos.every((g) => g.secciones.length === 0)).toBe(true);
  });

  test('búsqueda vacía devuelve el catálogo entero', () => {
    const c = getSectionCatalogForBranch('hotel');
    expect(filtrarCatalogo(c, '   ').coincidencias).toBe(c.total);
  });
});

describe('recomendadas sin tipo de sede (sitio principal)', () => {
  test('salen del giro del sitio: un restaurante ve primero Carta, Reservar y Horario', () => {
    expect(tipoSedeDesdeGiro('restaurante')).toBe('restaurant');
    expect(tipoSedeDesdeGiro('tienda')).toBe('retail');
    expect(tipoSedeDesdeGiro('otro')).toBeNull();
    expect(tipoSedeDesdeGiro(null)).toBeNull();
    const tipos = getSectionCatalogForBranch(tipoSedeDesdeGiro('restaurante')).recomendadas.map((s) => s.type);
    expect(tipos).toEqual(expect.arrayContaining(['menu_full', 'reservation', 'hours_location']));
  });
});

describe('tarjetas de variante («Café de especialidad», Figma 2223:46106)', () => {
  test('cada variante sale junto a su tipo (o en el grupo que la ubica), y añade ESA variante', () => {
    const c = getSectionCatalogForBranch(null);
    for (const v of VARIANTES_EN_CATALOGO) {
      const clave = `${v.tipo}:${v.variante}`;
      // Plantillas de tienda: un grupo puede ubicar la tarjeta («tipo:variante» en sus tipos).
      const ubicada = GRUPOS_SECCIONES.find((g) => g.tipos.includes(clave));
      const grupo = ubicada
        ? c.grupos.find((g) => g.id === ubicada.id)!
        : c.grupos.find((g) => g.secciones.some((s) => s.type === v.tipo && !s.varianteDestacada))!;
      const lista = grupo.secciones.map(claveEntrada);
      if (!ubicada) {
        // Tras su tipo vienen solo tarjetas de ese tipo (en el orden de VARIANTES_EN_CATALOGO).
        const desde = lista.indexOf(v.tipo);
        const posicion = lista.indexOf(clave);
        expect(posicion).toBeGreaterThan(desde);
        expect(lista.slice(desde + 1, posicion + 1).every((k) => k.startsWith(`${v.tipo}:`))).toBe(true);
      } else {
        expect(lista).toContain(clave);
      }
      const tarjeta = grupo.secciones.find((s) => claveEntrada(s) === clave)!;
      expect(tarjeta.variants[0].id).toBe(v.variante);
      expect(tarjeta.label).toBe(v.etiqueta);
    }
  });

  test.each([
    ['carrusel portada fotos', 'hero:carousel_editorial'],
    ['historia capítulos', 'how_it_works:chapters'],
    ['carta sede puntos', 'menu_full:dotted'],
    ['plano mesas reservar', 'reservation:floor_plan'],
  ])('«%s» encuentra %s', (busqueda, clave) => {
    const r = filtrarCatalogo(getSectionCatalogForBranch(null), busqueda);
    expect(r.grupos.flatMap((g) => g.secciones.map(claveEntrada))).toContain(clave);
  });

  test('un restaurante las ve en «Recomendadas»', () => {
    const claves = getSectionCatalogForBranch('restaurant').recomendadas.map(claveEntrada);
    expect(claves).toEqual(expect.arrayContaining(['hero:carousel_editorial', 'how_it_works:chapters', 'menu_full:dotted', 'reservation:floor_plan']));
  });
});
