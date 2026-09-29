/**
 * Vigencias de membresías (docs/design/MEMBRESIAS-FASE-1-2.md §4 «Fechas»).
 *
 * Corre dentro de `npm run test:tz` con TZ=UTC, America/Bogota, Mexico_City, Madrid, Santiago y
 * Kathmandu: el resultado NO puede depender de la zona del proceso, solo de la de la organización.
 * Los valores esperados son los mismos que devolvió la base con fn_membresias_int_fin /
 * fn_membresias_int_restar en las pruebas en seco del 2026-09-29.
 */
import {
  calcularFin,
  diasHasta,
  estadoVisual,
  previsualizarRenovacion,
  restarPeriodos,
  sumarMesesPlano,
  vencePronto,
} from '@/lib/services/membresias/vigencia';
import { toPlainDate } from '@/lib/utils/dateCore';

const BOG = 'America/Bogota';

function iso(d: Date): string {
  return d.toISOString();
}

describe('calcularFin: último día del periodo a las 23:59:59 de la organización', () => {
  it('1 mes pagado el 28 sep (20:25 en Bogotá, ya 29 sep en UTC) vence el 27 oct 23:59:59', () => {
    const inicio = new Date('2026-09-29T01:25:38Z'); // 28 sep 20:25 en Bogotá
    expect(iso(calcularFin(inicio, 'month', 1, 1, BOG))).toBe('2026-10-28T04:59:59.000Z');
  });

  it('2 unidades = 2 periodos seguidos (P4)', () => {
    const inicio = new Date('2026-09-29T01:26:59Z');
    expect(iso(calcularFin(inicio, 'month', 1, 2, BOG))).toBe('2026-11-28T04:59:59.000Z');
  });

  it('el día sale de la zona de la organización, no del proceso', () => {
    const inicio = new Date('2026-09-29T01:00:00Z');
    expect(toPlainDate(calcularFin(inicio, 'day', 1, 1, BOG), BOG)).toBe('2026-09-28');
    expect(toPlainDate(calcularFin(inicio, 'day', 1, 1, 'UTC'), 'UTC')).toBe('2026-09-29');
  });

  it('semanas y años', () => {
    const inicio = new Date('2026-03-10T15:00:00Z');
    expect(toPlainDate(calcularFin(inicio, 'week', 2, 1, BOG), BOG)).toBe('2026-03-23');
    expect(toPlainDate(calcularFin(inicio, 'year', 1, 1, BOG), BOG)).toBe('2027-03-09');
  });

  it('fin de mes como Postgres: 31 ene + 1 mes = 28 feb, y vence el 27', () => {
    expect(sumarMesesPlano('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMesesPlano('2028-01-31', 1)).toBe('2028-02-29');
    const inicio = new Date('2026-01-31T15:00:00Z');
    expect(toPlainDate(calcularFin(inicio, 'month', 1, 1, BOG), BOG)).toBe('2026-02-27');
  });

  it('cantidad inválida cuenta como 1 periodo', () => {
    const inicio = new Date('2026-09-29T01:25:38Z');
    expect(iso(calcularFin(inicio, 'month', 1, 0, BOG))).toBe(iso(calcularFin(inicio, 'month', 1, 1, BOG)));
  });
});

describe('restarPeriodos: recorte por devolución parcial (P6)', () => {
  it('2 meses hasta el 27 nov − 1 periodo = 27 oct 23:59:59', () => {
    const fin = new Date('2026-11-28T04:59:59Z');
    expect(iso(restarPeriodos(fin, 'month', 1, 1, BOG))).toBe('2026-10-28T04:59:59.000Z');
  });

  it('es el inverso de calcularFin', () => {
    const inicio = new Date('2026-05-15T12:00:00Z');
    const fin3 = calcularFin(inicio, 'month', 1, 3, BOG);
    const fin1 = calcularFin(inicio, 'month', 1, 1, BOG);
    expect(iso(restarPeriodos(fin3, 'month', 1, 2, BOG))).toBe(iso(fin1));
  });
});

describe('previsualizarRenovacion (P3: suma desde el vencimiento)', () => {
  const ahora = new Date('2026-09-29T01:30:00Z'); // 28 sep en Bogotá

  it('antes de vencer: el periodo nuevo empieza el día siguiente al vencimiento', () => {
    const fin = new Date('2026-10-28T04:59:59Z'); // 27 oct
    const r = previsualizarRenovacion(fin, ahora, 'month', 1, 1, BOG);
    expect(toPlainDate(r.desde, BOG)).toBe('2026-10-28');
    expect(iso(r.hasta)).toBe('2026-11-28T04:59:59.000Z'); // 27 nov
  });

  it('ya vencida: el periodo nuevo empieza hoy', () => {
    const fin = new Date('2026-07-05T00:00:00Z');
    const r = previsualizarRenovacion(fin, ahora, 'month', 1, 1, BOG);
    expect(r.desde.getTime()).toBe(ahora.getTime());
    expect(toPlainDate(r.hasta, BOG)).toBe('2026-10-27');
  });
});

describe('estadoVisual', () => {
  const ahora = new Date('2026-09-29T01:30:00Z'); // 28 sep 20:30 en Bogotá

  it('activa con días restantes contados en la zona', () => {
    const e = estadoVisual({ status: 'active', end_date: '2026-10-28T04:59:59Z' }, ahora, BOG);
    expect(e).toEqual({ estado: 'activa', dias: 29 });
  });

  it('en gracia muestra los días que quedan (P5: deja entrar con aviso)', () => {
    const e = estadoVisual(
      { status: 'past_due', end_date: '2026-09-28T04:59:59Z', grace_until: '2026-09-30T04:59:59Z' },
      ahora,
      BOG,
    );
    expect(e).toEqual({ estado: 'en_gracia', dias: 1 });
  });

  it('gracia agotada es vencida', () => {
    const e = estadoVisual(
      { status: 'past_due', end_date: '2026-09-20T04:59:59Z', grace_until: '2026-09-25T04:59:59Z' },
      ahora,
      BOG,
    );
    expect(e.estado).toBe('vencida');
  });

  it('pendiente: por pagar o por activar según el pago', () => {
    expect(estadoVisual({ status: 'pending', end_date: '2026-10-28T04:59:59Z' }, ahora, BOG).estado).toBe('pendiente_pago');
    expect(estadoVisual({ status: 'pending', end_date: '2026-10-28T04:59:59Z', pagada: true }, ahora, BOG).estado).toBe('por_activar');
  });

  it('una activa cuyo vencimiento ya pasó (la tarea aún no corrió) se muestra vencida', () => {
    expect(estadoVisual({ status: 'active', end_date: '2026-07-05T00:00:00Z' }, ahora, BOG).estado).toBe('vencida');
  });

  it('congelada y cancelada', () => {
    expect(estadoVisual({ status: 'frozen', end_date: '2026-10-28T04:59:59Z' }, ahora, BOG).estado).toBe('congelada');
    expect(estadoVisual({ status: 'cancelled', end_date: '2026-10-28T04:59:59Z' }, ahora, BOG).estado).toBe('cancelada');
  });

  it('vence pronto: activa con 7 días o menos', () => {
    expect(vencePronto({ status: 'active', end_date: '2026-10-03T04:59:59Z' }, ahora, BOG)).toBe(true);
    expect(vencePronto({ status: 'active', end_date: '2026-10-28T04:59:59Z' }, ahora, BOG)).toBe(false);
  });

  it('diasHasta cuenta días calendario de la organización, no horas', () => {
    // 28 sep 20:30 → 29 sep 00:30 en Bogotá: 1 día aunque sean 4 horas.
    expect(diasHasta(new Date('2026-09-29T05:30:00Z'), ahora, BOG)).toBe(1);
  });
});
