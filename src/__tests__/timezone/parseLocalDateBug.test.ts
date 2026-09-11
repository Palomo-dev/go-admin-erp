// ============================================================
// Tests que documentan el BUG #1: parseLocalDate destruye la zona
// horaria al hacer split('T')[0] sobre un timestamptz.
//
// Estos tests verifican que el comportamiento ACTUAL (roto) de
// parseLocalDate/formatDate produce la fecha equivocada para
// instantes despues de las 19:00 hora Bogota.
//
// Despues de la Fase 5, cuando parseLocalDate y formatDate viejo
// se eliminen, estos tests se reescriben para verificar que los
// call-sites ya no los usan.
// ============================================================

import { parseLocalDate, formatDate } from '@/utils/Utils';

describe('BUG #1 — parseLocalDate destruye la zona horaria', () => {
  it('un timestamptz 2026-09-11T01:30:00Z se parsea como 11/09 (dia UTC, no Bogota)', () => {
    // Este instante es 20:30 del 10/09 en Bogota, pero parseLocalDate
    // hace split('T')[0] = "2026-09-11" y lo interpreta como dia local.
    const result = parseLocalDate('2026-09-11T01:30:00Z');
    // El bug: el dia del Date resultante es 11 (UTC), no 10 (Bogota).
    // Como el runtime de test es UTC, getDate() devuelve 11.
    expect(result.getDate()).toBe(11);
  });

  it('formatDate muestra 11/09/2026 para una venta del 10/09 a las 20:30 Bogota', () => {
    // El bug en accion: formatDate delega en parseLocalDate que hace
    // split('T')[0] y se queda con el dia UTC.
    const iso = '2026-09-11T01:30:00Z'; // 20:30 del 10/09 en Bogota
    const result = formatDate(iso);
    // BUG: muestra 11/09/2026 cuando deberia mostrar 10/09/2026
    expect(result).toBe('11/09/2026');
  });

  it('parseLocalDate con offset explicito -05:00 tambien pierde el dia', () => {
    // 2026-09-10T20:30:00-05:00 = 20:30 del 10/09 en Bogota
    // parseLocalDate hace split('T')[0] = "2026-09-10" -> OK en este caso
    // porque el offset ya es -05:00 y el dia calendario coincide.
    // Pero si el offset fuera +00:00 (Z), el dia se desplaza.
    const result = parseLocalDate('2026-09-10T20:30:00-05:00');
    expect(result.getDate()).toBe(10); // Este caso si funciona
  });

  it('el bug solo se manifiesta cuando el offset empuja el dia UTC adelante', () => {
    // 2026-09-11T01:30:00-05:00 = 01:30 del 11/09 en Bogota (ya es dia 11)
    // 2026-09-11T01:30:00Z      = 20:30 del 10/09 en Bogota (dia 10)
    // Ambos tienen "2026-09-11" en el string, pero solo el primero es dia 11.
    const r1 = parseLocalDate('2026-09-11T01:30:00-05:00');
    const r2 = parseLocalDate('2026-09-11T01:30:00Z');
    // Ambos devuelven 11 porque split('T')[0] descarta el offset.
    expect(r1.getDate()).toBe(11);
    expect(r2.getDate()).toBe(11);
    // Pero el segundo deberia ser 10 en Bogota. El bug.
  });
});
