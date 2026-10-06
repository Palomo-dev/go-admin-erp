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
  coincideBusqueda,
  filtrarCatalogo,
  getSectionCatalogForBranch, tipoSedeDesdeGiro,
  normalizarBusqueda,
} from '../sectionsByBranchType';

const tiposDe = (c: ReturnType<typeof getSectionCatalogForBranch>) =>
  c.grupos.flatMap((g) => g.secciones.map((s) => s.type)).sort();

describe('getSectionCatalogForBranch', () => {
  const todos = SECTION_CATALOG.map((s) => s.type).sort();

  test.each([null, undefined, ...BRANCH_TYPES.map((b) => b.value)])(
    'con tipo %s devuelve TODAS las secciones del catálogo, cada una una sola vez',
    (tipo) => {
      const c = getSectionCatalogForBranch(tipo as BranchType | null | undefined);
      expect(tiposDe(c)).toEqual(todos);
      expect(c.total).toBe(SECTION_CATALOG.length);
    },
  );

  test('un restaurante ya puede añadir Habitaciones (antes se filtraba)', () => {
    const c = getSectionCatalogForBranch('restaurant');
    expect(tiposDe(c)).toContain('room_types');
    expect(c.grupos.find((g) => g.id === 'hospedaje')?.secciones.map((s) => s.type)).toContain('room_types');
  });

  test('las recomendadas salen primero según el tipo y siguen en su grupo', () => {
    const c = getSectionCatalogForBranch('restaurant');
    expect(c.recomendadas.map((s) => s.type)).toEqual(RECOMENDADAS_POR_TIPO.restaurant);
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
    expect(c.total).toBe(SECTION_CATALOG.length);
  });

  test('en la plantilla de producto recomienda los bloques de la ficha', () => {
    const c = getSectionCatalogForBranch('restaurant', { pageType: 'product_detail' });
    expect(c.recomendadas.map((s) => s.type)).toEqual(
      GRUPOS_SECCIONES.find((g) => g.id === 'ficha_producto')?.tipos,
    );
  });

  test('toda recomendación existe en el catálogo', () => {
    const existentes = new Set(SECTION_CATALOG.map((s) => s.type));
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
