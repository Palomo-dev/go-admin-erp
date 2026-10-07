/**
 * Lienzo de la Carta QR por pasos: al seleccionar una sección se pide su paso al sitio
 * (`goadmin:paso`) en vez de desplazarse (`goadmin:scroll`), que en las demás páginas sigue igual.
 */
import { lienzoPorPasos, mensajesSeleccion } from '../pasoLienzo';

const sec = (section_type: string, section_variant = 'default') => ({ section_type, section_variant });

describe('lienzoPorPasos (misma regla que esPaginaModoMesa del sitio)', () => {
  it('la página de tipo carta_qr va por pasos aunque solo tenga la carta', () => {
    expect(lienzoPorPasos([sec('menu_full', 'qr')], { tipo: 'carta_qr', slug: 'mi-carta' })).toBe(true);
  });

  it('/carta-qr armada a mano con secciones de mesa va por pasos', () => {
    expect(lienzoPorPasos([sec('table_bill', 'hoja')], { tipo: 'custom', slug: 'carta-qr' })).toBe(true);
    expect(lienzoPorPasos([sec('restaurant_hero', 'mesa')], { tipo: 'custom', slug: '/carta-qr' })).toBe(true);
  });

  it('cualquier otra página, como siempre', () => {
    expect(lienzoPorPasos([sec('menu_full', 'qr')], { tipo: 'custom', slug: 'carta-qr' })).toBe(false);
    expect(lienzoPorPasos([sec('table_order', 'rondas')], { tipo: 'builtin', slug: 'menu' })).toBe(false);
    expect(lienzoPorPasos([sec('hero')], null)).toBe(false);
    expect(lienzoPorPasos([], undefined)).toBe(false);
  });
});

describe('mensajesSeleccion', () => {
  it('Carta QR: «Cuenta de la mesa» seleccionada pide su paso al sitio (lámina 17)', () => {
    expect(mensajesSeleccion('sec-cuenta', true)).toEqual([
      { type: 'goadmin:select', sectionId: 'sec-cuenta' },
      { type: 'goadmin:paso', sectionId: 'sec-cuenta' },
    ]);
  });

  it('Carta QR: encabezado y pie siguen seleccionables (el sitio los muestra en la bienvenida)', () => {
    expect(mensajesSeleccion('header', true)).toContainEqual({ type: 'goadmin:paso', sectionId: 'header' });
    expect(mensajesSeleccion('footer', true)).toContainEqual({ type: 'goadmin:paso', sectionId: 'footer' });
  });

  it('otras páginas: resaltar y desplazarse, como siempre', () => {
    expect(mensajesSeleccion('sec-1', false)).toEqual([
      { type: 'goadmin:select', sectionId: 'sec-1' },
      { type: 'goadmin:scroll', sectionId: 'sec-1' },
    ]);
  });

  it('sin selección: solo se quita el resaltado', () => {
    expect(mensajesSeleccion(null, true)).toEqual([{ type: 'goadmin:select', sectionId: null }]);
    expect(mensajesSeleccion(null, false)).toEqual([{ type: 'goadmin:select', sectionId: null }]);
  });
});
