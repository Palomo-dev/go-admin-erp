/**
 * Sondeo de la campana (2026-11-24): el tic de 30 s relee solo los avisos del miembro y la
 * campana completa cada 5 minutos. Aquí, las dos piezas puras que deciden eso.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { TICS_CARGA_COMPLETA, mezclarConAvisos, tocaCargaCompleta, type NotificacionHeader } from '../useNotificacionesHeader';

const n = (id: string, created_at: string, aviso = false): NotificacionHeader =>
  ({ id, created_at, payload: aviso ? { source: 'member_notice' } : {}, is_read_by_me: false }) as unknown as NotificacionHeader;

describe('sondeo de la campana', () => {
  test('de cada 10 tics, 9 son livianos y 1 relee todo (cada 5 minutos)', () => {
    expect(TICS_CARGA_COMPLETA).toBe(10);
    const completos = Array.from({ length: 30 }, (_, i) => i + 1).filter(tocaCargaCompleta);
    expect(completos).toEqual([10, 20, 30]);
    expect(tocaCargaCompleta(0)).toBe(false);
  });

  test('mezcla notificaciones y avisos de la más nueva a la más vieja, con tope de 15', () => {
    const notificaciones = [n('n2', '2026-11-24T10:00:00Z'), n('n1', '2026-11-24T08:00:00Z')];
    const avisos = [n('a1', '2026-11-24T09:00:00Z', true)];
    expect(mezclarConAvisos(notificaciones, avisos).map((x) => x.id)).toEqual(['n2', 'a1', 'n1']);
    // No toca las listas de entrada (la base se reutiliza en el siguiente tic).
    expect(notificaciones.map((x) => x.id)).toEqual(['n2', 'n1']);

    const muchas = Array.from({ length: 20 }, (_, i) => n(`m${i}`, `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    const mezcla = mezclarConAvisos(muchas, [n('a9', '2026-12-01T00:00:00Z', true)]);
    expect(mezcla).toHaveLength(15);
    expect(mezcla[0].id).toBe('a9');
  });

  test('sin avisos nuevos, la lista vuelve a ser solo las notificaciones (un aviso descartado en otro equipo desaparece)', () => {
    const notificaciones = [n('n1', '2026-11-24T08:00:00Z')];
    expect(mezclarConAvisos(notificaciones, []).map((x) => x.id)).toEqual(['n1']);
  });
});
