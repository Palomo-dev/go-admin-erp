/**
 * Testimonios: columnas por dispositivo (QA 2026-11-25, org 338). «Columnas» se aplicaba también en
 * el celular: 3 tarjetas de ~90 px. Ahora el inspector ofrece «Columnas en tableta» y «Columnas en
 * celular» junto a «Columnas en computador», con los valores por defecto que la tienda aplica sin
 * clave (contrato compartido `seccionesTienda.ts`, copia idéntica en goadmin-websites).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';
import { campoVisible } from '@/components/sitio-web/editor/inspector/CampoSeccion';
import {
  CLAVES_AJUSTE_TIENDA,
  COLUMNAS_CELULAR_TESTIMONIOS,
  COLUMNAS_TABLETA_TESTIMONIOS,
  columnasTestimonios,
} from '@/lib/website/contrato/seccionesTienda';

const def = getSectionDefinition('testimonials');
const campos = def?.contentFields ?? [];
const visibles = (variante: string, contenido: Record<string, unknown> = {}) =>
  campos.filter((c) => campoVisible(c, contenido, variante));
const de = (variante: string, clave: string) => visibles(variante).filter((c) => c.key === clave);

describe('contrato: columnas por dispositivo', () => {
  test('sin claves: Grid 1 por fila y Carrusel deslizable en el celular; tableta 2; computador 3', () => {
    expect(columnasTestimonios({}, 'grid')).toEqual({ escritorio: 3, tableta: 2, celular: '1' });
    expect(columnasTestimonios({}, 'carousel')).toEqual({ escritorio: 3, tableta: 2, celular: 'carousel' });
    expect(columnasTestimonios(undefined, undefined)).toEqual({ escritorio: 3, tableta: 2, celular: '1' });
  });

  test('lo elegido manda; lo inválido vuelve al de siempre; nunca 3 en el celular', () => {
    expect(columnasTestimonios({ columns: 4, columns_tablet: '3', columns_mobile: '2' }, 'grid')).toEqual({ escritorio: 4, tableta: 3, celular: '2' });
    expect(columnasTestimonios({ columns: 1 }, 'grid').tableta).toBe(1);
    expect(columnasTestimonios({ columns_mobile: 'carousel' }, 'grid').celular).toBe('carousel');
    expect(columnasTestimonios({ columns_mobile: '1' }, 'carousel').celular).toBe('1');
    expect(columnasTestimonios({ columns_mobile: 3 }, 'grid').celular).toBe('1');
    expect(columnasTestimonios({ columns_tablet: 4 }, 'grid').tableta).toBe(2);
    expect(columnasTestimonios({ columns: 8 }, 'grid').escritorio).toBe(3);
  });

  test('el objeto viejo { desktop, tablet, mobile } se sigue leyendo', () => {
    expect(columnasTestimonios({ columns: { desktop: 5, tablet: 3, mobile: 2 } }, 'grid')).toEqual({ escritorio: 5, tableta: 3, celular: '2' });
  });

  test('las claves nuevas están declaradas como ajuste de tienda', () => {
    expect(CLAVES_AJUSTE_TIENDA.testimonials).toEqual(expect.arrayContaining(['columns_tablet', 'columns_mobile']));
  });
});

describe('inspector: «Columnas en tableta» y «Columnas en celular»', () => {
  test('van justo después de «Columnas en computador»', () => {
    const claves = campos.map((c) => c.key);
    const i = claves.indexOf('columns');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(claves.slice(i, i + 4)).toEqual(['columns', 'columns_tablet', 'columns_mobile', 'columns_mobile']);
    expect(campos[i].label).toBe('Columnas en computador');
    expect(campos[i].max).toBe(6);
  });

  test.each([
    ['grid', '1'],
    ['carousel', 'carousel'],
  ])('%s: un solo «Columnas en celular», con el valor que la tienda usa sin clave (%s)', (variante, porDefecto) => {
    const celular = de(variante, 'columns_mobile');
    expect(celular).toHaveLength(1);
    expect(celular[0].label).toBe('Columnas en celular');
    expect(celular[0].group).toBe('layout');
    expect(celular[0].defaultValue).toBe(porDefecto);
    expect(celular[0].defaultValue).toBe(columnasTestimonios({}, variante).celular);
    expect(celular[0].options?.map((o) => o.value)).toEqual([...COLUMNAS_CELULAR_TESTIMONIOS]);
    const tableta = de(variante, 'columns_tablet');
    expect(tableta).toHaveLength(1);
    expect(tableta[0].defaultValue).toBe(String(columnasTestimonios({}, variante).tableta));
    expect(tableta[0].options?.map((o) => o.value)).toEqual([...COLUMNAS_TABLETA_TESTIMONIOS]);
  });

  test.each(['quotes', 'minimal'])('%s (lista a todo el ancho): sin columnas por dispositivo', (variante) => {
    expect(de(variante, 'columns_mobile')).toHaveLength(0);
    expect(de(variante, 'columns_tablet')).toHaveLength(0);
  });

  test('los testimonios se siguen editando y ordenando (repetidor con nombre, cargo, texto, estrellas y foto)', () => {
    const items = campos.find((c) => c.key === 'items');
    expect(items?.type).toBe('repeater');
    expect(items?.itemFields?.map((f) => f.key)).toEqual(['name', 'role', 'content', 'rating', 'avatar_url']);
  });
});
