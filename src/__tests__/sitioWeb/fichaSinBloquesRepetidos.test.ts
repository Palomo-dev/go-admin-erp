/**
 * Ninguna plantilla arma una ficha de producto «con todo doble».
 *
 * «Envío y devoluciones» (`product_shipping`) y «Beneficios» (`product_benefits`) recién puestos
 * pintan sus textos de fábrica, y son los mismos datos: «Tiempo de entrega · 24-48 horas hábiles»
 * y «Envío rápido · 24-48 horas»; «Devoluciones · 30 días» y «Garantía · 30 días». Moderna,
 * Clásica y Vibrante armaban los dos y el comercio lo reportó el 2026-11-25.
 *
 * Regla: una plantilla no arma los dos a la vez. Si un diseño nuevo necesita «Envío y
 * devoluciones», que lo arme con contenido propio (título, mensaje) o sin «Beneficios».
 */
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: jest.fn() },
  getProjectRef: jest.fn(() => 'test'),
}));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { TEMPLATE_PRESETS } from '@/lib/services/websiteSettingsService';
import { construirCatalogo } from '@/lib/website/contrato/catalogoPlantillas';

const catalogo = construirCatalogo(TEMPLATE_PRESETS);
const conFicha = catalogo.plantillas.filter((p) => (p.detalle?.producto.length ?? 0) > 0);

const tiposDe = (bloques: readonly (readonly unknown[])[]) => bloques.map((b) => String(b[0]));

describe('ficha de producto de las plantillas', () => {
  test('hay plantillas con ficha (la prueba no es ciega)', () => {
    expect(conFicha.length).toBeGreaterThanOrEqual(10);
    expect(conFicha.map((p) => p.id)).toEqual(expect.arrayContaining(['retail_modern', 'retail_classic', 'retail_bold']));
  });

  test.each(conFicha.map((p) => [p.id, p] as const))('%s no arma «Envío y devoluciones» y «Beneficios» de fábrica a la vez', (_id, plantilla) => {
    const bloques = plantilla.detalle?.producto ?? [];
    const envioDeFabrica = bloques.some((b) => b[0] === 'product_shipping' && Object.keys((b[2] as Record<string, unknown> | undefined) ?? {}).length === 0);
    const beneficiosDeFabrica = bloques.some((b) => b[0] === 'product_benefits' && !Array.isArray((b[2] as { items?: unknown[] } | undefined)?.items));
    expect(envioDeFabrica && beneficiosDeFabrica).toBe(false);
  });

  test.each(conFicha.map((p) => [p.id, p] as const))('%s no repite un mismo bloque en la ficha', (_id, plantilla) => {
    const tipos = tiposDe(plantilla.detalle?.producto ?? []);
    expect(tipos.filter((t, i) => tipos.indexOf(t) !== i)).toEqual([]);
  });

  test('Moderna, Clásica y Vibrante conservan «Beneficios»', () => {
    for (const id of ['retail_modern', 'retail_classic', 'retail_bold']) {
      const tipos = tiposDe(conFicha.find((p) => p.id === id)?.detalle?.producto ?? []);
      expect(tipos).toContain('product_benefits');
      expect(tipos).not.toContain('product_shipping');
    }
  });
});
