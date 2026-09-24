/**
 * Mapa canónico de atajos del POS (POS-UX-V2 §3): una sola lista para
 * registrar las acciones y dibujar el mapa F1.
 */
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
import { ATAJOS_POS, GRUPOS_ATAJOS_POS, TECLAS_RESERVADAS_NAVEGADOR, atajosPorGrupo, teclaAtajo } from '@/lib/pos/venta/atajos';
import { claveAtajo } from '@/components/kit/teclas';

type Mensajes = { posVenta?: { atajos?: Record<string, unknown> & { grupos?: Record<string, string> } } };

describe('mapa de atajos del POS', () => {
  test('cada atajo y cada grupo tiene su descripción en los 4 idiomas', () => {
    for (const [idioma, m] of Object.entries({ es, en, fr, pt }) as [string, Mensajes][]) {
      const atajos = m.posVenta?.atajos ?? {};
      for (const a of ATAJOS_POS) {
        expect([idioma, a.id, typeof atajos[a.id]]).toEqual([idioma, a.id, 'string']);
      }
      for (const g of GRUPOS_ATAJOS_POS) {
        expect([idioma, g, typeof atajos.grupos?.[g]]).toEqual([idioma, g, 'string']);
      }
    }
  });

  test('ids únicos y ninguna tecla reservada por el navegador (F3, F5, F11, F12, Ctrl+T…)', () => {
    const ids = ATAJOS_POS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const reservadas = new Set(TECLAS_RESERVADAS_NAVEGADOR.map((t) => claveAtajo(t)));
    for (const a of ATAJOS_POS) expect([a.id, reservadas.has(claveAtajo(a.tecla))]).toEqual([a.id, false]);
  });

  test('dentro de un mismo grupo registrable, una tecla hace una sola cosa', () => {
    for (const { grupo, atajos } of atajosPorGrupo()) {
      const claves = atajos.filter((a) => !a.soloMapa).map((a) => claveAtajo(a.tecla));
      expect([grupo, new Set(claves).size]).toEqual([grupo, claves.length]);
    }
  });

  test('las teclas del diseño: F4 cobra, F9 caja, Ctrl+N carrito nuevo, Alt+E exacto', () => {
    expect(teclaAtajo('cobrar')).toBe('F4');
    expect(teclaAtajo('caja')).toBe('F9');
    expect(teclaAtajo('nuevoCarrito')).toBe('Ctrl+N');
    expect(teclaAtajo('exacto')).toBe('Alt+E');
    expect(teclaAtajo('completarVenta')).toBe('Enter');
  });
});
