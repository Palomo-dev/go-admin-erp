/**
 * MRR de membresías (docs/design/MEMBRESIAS-FASE-1-2.md §11.3): el precio VIGENTE del producto
 * normalizado a un mes según la duración del plan, sumando solo membresías activas o en gracia.
 */
import {
  DIAS_POR_MES,
  calcularMrr,
  cuotaMensual,
  cuotaMensualDeMembresia,
  duracionDelPlan,
  periodosPorMes,
  preciosVigentesPorProducto,
  sumaAlMrr,
  type MembresiaMrr,
} from '@/lib/services/membresias/mrr';

const TZ = 'America/Bogota';
const AHORA = new Date('2026-09-29T15:00:00Z'); // 10:00 en Bogotá

describe('cuotaMensual: precio del periodo → cuota de un mes', () => {
  it('plan de 1 mes: la cuota es el precio', () => {
    expect(cuotaMensual(138000, 'month', 1)).toBe(138000);
  });

  it('plan de 3 meses: un tercio del precio', () => {
    expect(cuotaMensual(270000, 'month', 3)).toBe(90000);
  });

  it('plan de 1 año: un doceavo del precio', () => {
    expect(cuotaMensual(1200000, 'year', 1)).toBe(100000);
  });

  it('plan de 15 días: el precio por los 30,42 días del mes promedio', () => {
    expect(DIAS_POR_MES).toBeCloseTo(30.4167, 4);
    expect(cuotaMensual(50000, 'day', 15)).toBeCloseTo((50000 * 365) / 12 / 15, 2);
    expect(cuotaMensual(50000, 'day', 15)).toBe(101388.89);
  });

  it('plan de 1 semana: el precio por las 4,35 semanas del mes promedio', () => {
    expect(periodosPorMes('week', 1)).toBeCloseTo(4.345, 3);
    expect(cuotaMensual(20000, 'week', 1)).toBe(86904.76);
  });

  it('12 cuotas mensuales de un plan anual suman el año; 12 de uno semanal, 52,14 semanas', () => {
    expect(cuotaMensual(1200000, 'year', 1) * 12).toBe(1200000);
    expect(periodosPorMes('week', 1) * 12).toBeCloseTo(365 / 7, 6);
  });

  it('precio cero, negativo o inválido no suma', () => {
    expect(cuotaMensual(0, 'month', 1)).toBe(0);
    expect(cuotaMensual(-5, 'month', 1)).toBe(0);
    expect(cuotaMensual(Number.NaN, 'month', 1)).toBe(0);
  });

  it('una duración inválida cuenta como 1 periodo', () => {
    expect(cuotaMensual(100000, 'month', 0)).toBe(100000);
  });
});

describe('duracionDelPlan', () => {
  it('usa duration_unit y duration_value', () => {
    expect(duracionDelPlan({ duration_unit: 'month', duration_value: 3, duration_days: 90 })).toEqual({ unidad: 'month', valor: 3 });
  });

  it('sin unidad válida cae a duration_days en días', () => {
    expect(duracionDelPlan({ duration_unit: null, duration_value: null, duration_days: 30 })).toEqual({ unidad: 'day', valor: 30 });
    expect(duracionDelPlan({ duration_unit: 'quincena', duration_value: 1, duration_days: 15 })).toEqual({ unidad: 'day', valor: 15 });
  });
});

describe('preciosVigentesPorProducto (misma regla que fn_membresias_int_precio_vigente)', () => {
  it('toma el más reciente ya vigente; ignora el programado y el terminado', () => {
    const precios = preciosVigentesPorProducto(
      [
        { id: 1, product_id: 10, price: 100000, effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-06-01T00:00:00Z' },
        { id: 2, product_id: 10, price: 120000, effective_from: '2026-06-01T00:00:00Z', effective_to: null },
        { id: 3, product_id: 10, price: 150000, effective_from: '2026-10-01T00:00:00Z', effective_to: null },
        { id: 4, product_id: 20, price: 90000, effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-09-01T00:00:00Z' },
      ],
      AHORA,
    );
    expect(precios.get(10)).toBe(120000);
    expect(precios.has(20)).toBe(false);
  });

  it('con la misma fecha de inicio gana la fila más nueva (id mayor)', () => {
    const precios = preciosVigentesPorProducto(
      [
        { id: 7, product_id: 10, price: '100', effective_from: '2026-09-01T00:00:00Z' },
        { id: 9, product_id: 10, price: '110', effective_from: '2026-09-01T00:00:00Z' },
      ],
      AHORA,
    );
    expect(precios.get(10)).toBe(110);
  });
});

describe('calcularMrr', () => {
  const planMes = { product_id: 1, duration_unit: 'month', duration_value: 1, duration_days: 30 };
  const planTrimestre = { product_id: 2, duration_unit: 'month', duration_value: 3, duration_days: 90 };
  const planAnual = { product_id: 3, duration_unit: 'year', duration_value: 1, duration_days: 365 };
  const planQuincena = { product_id: 4, duration_unit: 'day', duration_value: 15, duration_days: 15 };
  const planSemana = { product_id: 5, duration_unit: 'week', duration_value: 1, duration_days: 7 };
  const precios = new Map<number, number>([
    [1, 138000],
    [2, 270000],
    [3, 1200000],
    [4, 50000],
    [5, 20000],
  ]);
  const futuro = '2026-10-27T04:59:59Z';
  const pasado = '2026-09-20T04:59:59Z';

  const m = (plan: MembresiaMrr['plan'], status: string, end_date: string, grace_until: string | null = null): MembresiaMrr => ({
    plan,
    status,
    end_date,
    grace_until,
  });

  it('suma cada plan normalizado a mes (no el precio del periodo)', () => {
    const lista = [
      m(planMes, 'active', futuro),
      m(planTrimestre, 'active', futuro),
      m(planAnual, 'active', futuro),
      m(planQuincena, 'active', futuro),
      m(planSemana, 'active', futuro),
    ];
    // 138 000 + 90 000 + 100 000 + 101 388,89 + 86 904,76
    expect(calcularMrr(lista, precios, AHORA, TZ)).toBe(516293.65);
    // El cálculo viejo sumaba el precio del periodo: 1 678 000.
    expect(calcularMrr(lista, precios, AHORA, TZ)).not.toBe(138000 + 270000 + 1200000 + 50000 + 20000);
  });

  it('en gracia suma; vencida, congelada, pendiente y cancelada no', () => {
    const graciaVigente = '2026-10-01T04:59:59Z';
    const lista = [
      m(planMes, 'past_due', pasado, graciaVigente), // en gracia: suma
      m(planMes, 'active', pasado, graciaVigente), // la tarea aún no pasó: en gracia, suma
      m(planMes, 'active', pasado), // vencida sin gracia
      m(planMes, 'past_due', pasado, '2026-09-25T04:59:59Z'), // gracia agotada
      m(planMes, 'expired', pasado),
      m(planMes, 'frozen', futuro),
      m(planMes, 'pending', futuro),
      m(planMes, 'cancelled', futuro),
    ];
    expect(lista.map((x) => sumaAlMrr(x, AHORA, TZ))).toEqual([true, true, false, false, false, false, false, false]);
    expect(calcularMrr(lista, precios, AHORA, TZ)).toBe(276000);
  });

  it('sin precio vigente la membresía no suma (nunca cae a membership_plans.price)', () => {
    const sinPrecio = m({ product_id: 99, duration_unit: 'month', duration_value: 1 }, 'active', futuro);
    expect(cuotaMensualDeMembresia(sinPrecio, precios)).toBe(0);
    expect(calcularMrr([sinPrecio], precios, AHORA, TZ)).toBe(0);
  });

  it('si el plan no trae producto usa el de la membresía', () => {
    const conProductoPropio: MembresiaMrr = { ...m({ product_id: null, duration_unit: 'month', duration_value: 3 }, 'active', futuro), product_id: 2 };
    expect(cuotaMensualDeMembresia(conProductoPropio, precios)).toBe(90000);
  });

  it('el día de vencimiento sigue sumando hasta las 23:59:59 de la organización', () => {
    // Vence el 29 sep 23:59:59 en Bogotá (04:59:59 UTC del 30).
    const venceHoy = m(planMes, 'active', '2026-09-30T04:59:59Z');
    expect(sumaAlMrr(venceHoy, new Date('2026-09-30T04:30:00Z'), TZ)).toBe(true);
    expect(sumaAlMrr(venceHoy, new Date('2026-09-30T05:00:00Z'), TZ)).toBe(false);
  });
});
