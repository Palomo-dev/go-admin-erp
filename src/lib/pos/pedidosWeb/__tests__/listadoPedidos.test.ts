import {
  cumplioPromesa,
  origenDelPedido,
  porcentajeATiempo,
  promesaDelPedido,
  rangosDelPeriodo,
  variacionPct,
} from '../listadoPedidos';

const AHORA = new Date('2026-10-06T19:17:00.000Z'); // 14:17 en Bogotá
const base = { created_at: '2026-10-06T19:05:00.000Z', delivery_type: 'delivery_own' };

describe('rangosDelPeriodo', () => {
  it('«Hoy» es el día de la organización y se compara con ayer a la misma hora', () => {
    const r = rangosDelPeriodo('today', 'America/Bogota', '2026-10-06', AHORA);
    expect(r.actual.from).toBe('2026-10-06T00:00:00.000-05:00');
    expect(r.actual.to).toBe('2026-10-06T23:59:59.999-05:00');
    expect(r.anterior?.from).toBe('2026-10-05T00:00:00.000-05:00');
    expect(r.anterior?.to).toBe('2026-10-05T14:17:00.000-05:00');
  });

  it('un rango personalizado se compara con el bloque igual de largo anterior', () => {
    const r = rangosDelPeriodo('custom', 'America/Bogota', '2026-10-06', AHORA, { desde: '2026-10-01', hasta: '2026-10-03' });
    expect(r.anterior?.from).toBe('2026-09-28T00:00:00.000-05:00');
    expect(r.anterior?.to).toBe('2026-09-30T23:59:59.999-05:00');
  });

  it('«Todo» no filtra ni compara', () => {
    expect(rangosDelPeriodo('all', 'America/Bogota', '2026-10-06', AHORA)).toEqual({ actual: {}, anterior: null });
  });
});

describe('promesaDelPedido', () => {
  it('sin confirmar: minutos de espera y alerta desde 10 min', () => {
    const p = promesaDelPedido({ ...base, status: 'pending' }, AHORA);
    expect(p).toMatchObject({ clave: 'sinConfirmar', detalle: { clave: 'haceSinPromesa', minutos: 12 }, tono: 'peligro' });
  });

  it('en preparación: faltan minutos para «listo»', () => {
    const p = promesaDelPedido({ ...base, delivery_type: 'dine_in', status: 'preparing', estimated_ready_at: '2026-10-06T19:26:00.000Z' }, AHORA);
    expect(p).toMatchObject({ clave: 'listo', detalle: { clave: 'faltan', minutos: 9 }, tono: 'exito' });
  });

  it('en preparación y vencido: retraso', () => {
    const p = promesaDelPedido({ ...base, status: 'preparing', estimated_ready_at: '2026-10-06T19:11:00.000Z' }, AHORA);
    expect(p).toMatchObject({ clave: 'listo', detalle: { clave: 'retraso', minutos: 6 }, tono: 'peligro' });
  });

  it('en camino pasado de la hora de entrega: retraso', () => {
    const p = promesaDelPedido({ ...base, status: 'in_delivery', estimated_delivery_at: '2026-10-06T19:03:00.000Z' }, AHORA);
    expect(p).toMatchObject({ clave: 'entrega', detalle: { clave: 'retraso', minutos: 14 } });
  });

  it('entregado antes de lo prometido', () => {
    const p = promesaDelPedido(
      { ...base, delivery_type: 'pickup', status: 'delivered', estimated_ready_at: '2026-10-06T17:21:00.000Z', ready_at: '2026-10-06T17:15:00.000Z', delivered_at: '2026-10-06T17:15:00.000Z' },
      AHORA,
    );
    expect(p).toMatchObject({ clave: 'entregado', detalle: { clave: 'antes', minutos: 6 }, tono: 'exito' });
  });

  it('cancelado: neutro y sin detalle', () => {
    expect(promesaDelPedido({ ...base, status: 'cancelled' }, AHORA)).toMatchObject({ clave: 'cancelado', detalle: null, tono: 'neutro' });
  });
});

describe('cumplimiento', () => {
  it('domicilio se mide por la entrega; recoger por «listo»', () => {
    expect(cumplioPromesa({ ...base, status: 'delivered', estimated_delivery_at: '2026-10-06T19:00:00Z', delivered_at: '2026-10-06T19:10:00Z' })).toBe(false);
    expect(cumplioPromesa({ ...base, delivery_type: 'pickup', status: 'delivered', estimated_ready_at: '2026-10-06T19:00:00Z', ready_at: '2026-10-06T18:58:00Z', delivered_at: '2026-10-06T19:30:00Z' })).toBe(true);
    expect(cumplioPromesa({ ...base, status: 'pending' })).toBeNull();
  });

  it('porcentaje sobre los medidos', () => {
    const r = porcentajeATiempo([
      { ...base, status: 'delivered', estimated_delivery_at: '2026-10-06T19:00:00Z', delivered_at: '2026-10-06T18:50:00Z' },
      { ...base, status: 'delivered', estimated_delivery_at: '2026-10-06T19:00:00Z', delivered_at: '2026-10-06T19:20:00Z' },
      { ...base, status: 'pending' },
    ]);
    expect(r).toEqual({ pct: 50, medidos: 2 });
  });
});

describe('variacionPct y origen', () => {
  it('sin base no hay variación', () => {
    expect(variacionPct(10, 0)).toBeNull();
    expect(variacionPct(118, 100)).toBe(18);
  });

  it('el QR de mesa se marca en el origen', () => {
    expect(origenDelPedido({ source: 'website', delivery_type: 'dine_in' })).toEqual({ clave: 'website', qrMesa: true });
    expect(origenDelPedido({ source: 'mobile_app', delivery_type: 'pickup' })).toEqual({ clave: 'mobile_app', qrMesa: false });
  });
});
