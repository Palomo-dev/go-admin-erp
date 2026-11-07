/**
 * Opciones de encabezado y pie de las plantillas de tienda (PLANO §2 ítems 11, 20 y 23-25): ausentes
 * o inválidas valen el default, que es el sitio de hoy.
 */
import {
  COLUMNAS_IMPORTADAS,
  COLUMNAS_NUEVAS_SHELL,
  COMPOSICIONES_HEADER,
  ESTILOS_ENLACES_PIE,
  FORMAS_BOTON_ENCABEZADO,
  MARCAS_PIE,
  OPCIONES_SHELL,
  cumpleRegla,
  normalizarOpcionShell,
} from '@/lib/website/v2/mapeoAjustes';
import { CLAVES_PIE } from '@/lib/website/ajustesVivos';

const NUEVAS = {
  header_cta_shape: 'pill',
  buttons_uppercase_active: false,
  footer_brand_display: 'none',
  footer_brand_figure_url: null,
  footer_inset: false,
  footer_links_style: 'normal',
} as const;

describe('opciones de shell de las plantillas de tienda', () => {
  test('registradas como nuevas, con regla, fuera del select legacy', () => {
    for (const [col, porDefecto] of Object.entries(NUEVAS)) {
      const def = OPCIONES_SHELL[col];
      expect(def).toBeDefined();
      expect(def.nueva).toBe(true);
      expect(def.regla).toBeDefined();
      expect(def.porDefecto).toBe(porDefecto);
      expect(COLUMNAS_NUEVAS_SHELL).toContain(col);
      expect(COLUMNAS_IMPORTADAS).not.toContain(col);
      if (def.porDefecto !== null) expect(cumpleRegla(def.regla!, def.porDefecto)).toBe(true);
    }
    expect(OPCIONES_SHELL.header_cta_shape.zona).toBe('header');
    expect(OPCIONES_SHELL.buttons_uppercase_active.zona).toBe('header');
    for (const col of ['footer_brand_display', 'footer_brand_figure_url', 'footer_inset', 'footer_links_style']) {
      expect(OPCIONES_SHELL[col].zona).toBe('footer');
      // El guardado legacy las conoce (y las omite si la fila no trae la columna).
      expect(CLAVES_PIE).toContain(col);
    }
  });

  test('ausentes o nulas = default (el sitio de hoy)', () => {
    for (const [col, porDefecto] of Object.entries(NUEVAS)) {
      expect(normalizarOpcionShell(col, undefined)).toBe(porDefecto);
      expect(normalizarOpcionShell(col, null)).toBe(porDefecto);
      expect(normalizarOpcionShell(col, { basura: 1 })).toBe(porDefecto);
    }
  });

  test('valores del contrato', () => {
    expect(COMPOSICIONES_HEADER).toContain('pill');
    expect(FORMAS_BOTON_ENCABEZADO).toEqual(['pill', 'circle']);
    expect(MARCAS_PIE).toEqual(['none', 'giant']);
    expect(ESTILOS_ENLACES_PIE).toEqual(['normal', 'display']);
    expect(normalizarOpcionShell('header_cta_shape', 'circle')).toBe('circle');
    expect(normalizarOpcionShell('footer_brand_display', 'giant')).toBe('giant');
    expect(normalizarOpcionShell('footer_inset', true)).toBe(true);
    expect(normalizarOpcionShell('footer_links_style', 'display')).toBe('display');
    expect(normalizarOpcionShell('footer_brand_figure_url', 'https://cdn.ejemplo.co/figura.png')).toBe('https://cdn.ejemplo.co/figura.png');
    expect(normalizarOpcionShell('footer_brand_figure_url', ' /img/figura.png ')).toBe('/img/figura.png');
  });

  test('valores inválidos = default', () => {
    expect(normalizarOpcionShell('header_cta_shape', 'triangulo')).toBe('pill');
    expect(normalizarOpcionShell('footer_brand_display', 'enorme')).toBe('none');
    expect(normalizarOpcionShell('footer_brand_display', true)).toBe('none');
    expect(normalizarOpcionShell('footer_inset', 'true')).toBe(false);
    expect(normalizarOpcionShell('footer_links_style', 'grande')).toBe('normal');
    for (const malo of ['http://inseguro.co/x.png', 'javascript:alert(1)', '//cdn.ejemplo.co/x.png', 'tel:3001234567', 'mailto:a@b.co', '', 42, `https://a.co/${'x'.repeat(2100)}`]) {
      expect(normalizarOpcionShell('footer_brand_figure_url', malo)).toBeNull();
    }
  });
});
