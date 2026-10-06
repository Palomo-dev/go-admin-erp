/**
 * Plantillas claras: el texto sale del secundario del preset solo si se lee sobre el fondo.
 * Varios presets traen como secundario un color de fondo o de acento y el texto quedaba
 * casi blanco sobre blanco (hotel minimal, wellness, services minimal) o naranja (resort).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));
import { construirCatalogo, textoPlantillaClara } from '@/lib/website/contrato/catalogoPlantillas';
import { contraste } from '@/lib/utils/contrasteColor';
import { TEMPLATE_PRESETS } from '@/lib/services/websiteSettingsService';

describe('textoPlantillaClara', () => {
  it('conserva un secundario oscuro que se lee', () => {
    expect(textoPlantillaClara('#2d3748')).toBe('#2D3748');
  });

  it('cambia a texto oscuro los secundarios que no se leen sobre blanco', () => {
    for (const color of ['#F7FAFC', '#F5F0EB', '#FFFFFF', '#FF7043', '#4ECDC4']) {
      expect(textoPlantillaClara(color)).toBe('#1A1A1A');
    }
  });

  it('ninguna plantilla del catálogo deja el texto ilegible sobre su fondo', () => {
    const catalogo = construirCatalogo(TEMPLATE_PRESETS as never);
    for (const p of catalogo.plantillas) {
      const razon = contraste(p.estilo.texto, p.estilo.fondo);
      expect({ id: p.id, ok: razon !== null && razon >= 4.5 }).toEqual({ id: p.id, ok: true });
    }
  });
});
