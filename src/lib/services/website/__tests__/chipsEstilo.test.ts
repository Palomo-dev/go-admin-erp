jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
import { getSectionDefinition } from '@/lib/services/websitePageBuilderService';

// MAP-08 / TESTIM-20: selects cortos van como chips (CampoSeccion, ≤5 opciones) y marcan lo que pinta la tienda sin clave.
describe('chips de estilo con el valor de la tienda', () => {
  test.each([
    ['map', 'map_style', 'default'],
    ['testimonials', 'source_badge_style', 'pill'],
  ])('%s.%s', (tipo, clave, porDefecto) => {
    const c = getSectionDefinition(tipo)?.contentFields.find((x) => x.key === clave);
    expect(c?.type).toBe('select');
    expect(c!.options!.length).toBeLessThanOrEqual(5);
    expect(c!.defaultValue).toBe(porDefecto);
    expect(c!.options!.map((o) => o.value)).toContain(porDefecto);
  });
});
