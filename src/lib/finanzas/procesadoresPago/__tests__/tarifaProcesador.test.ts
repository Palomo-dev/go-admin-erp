import { PLANES_BOLD, erroresTarifa, estimarCobro, leerTarifa, sumarEstimaciones, tramoDelCobro, type TarifaProcesador } from '../tarifaProcesador';

const inmediato = PLANES_BOLD.abonoInmediato;
const diaSiguiente = PLANES_BOLD.diaSiguiente;

describe('tarifa del procesador (configurable, nunca cableada)', () => {
  it('lee la tarifa guardada en fee_schedule (la de la org 358 por migración)', () => {
    const guardada = {
      version: 1,
      plan: 'abonoInmediato',
      base: { porcentaje: 3.59, fijo: 900 },
      tarjeta: null,
      internacionalPct: 1,
      ivaComisionPct: 19,
      reteFuentePct: 0,
      reteIcaPct: 0,
      reteIvaPct: 0,
      retencionesConfiguradas: false,
    };
    expect(leerTarifa(guardada)).toEqual(inmediato);
    expect(leerTarifa(null)).toBeNull();
    expect(leerTarifa({ base: { porcentaje: 'x' } })).toBeNull();
  });

  it('abono inmediato: 3,59 % + $ 900 más IVA 19 % sobre la comisión', () => {
    const e = estimarCobro(20000, inmediato, { submetodo: 'nequi' });
    // 20.000 × 3,59 % = 718 + 900 = 1.618; IVA 19 % = 307,42; neto = 18.074,58.
    expect(e).toMatchObject({ bruto: 20000, comision: 1618, ivaComision: 307.42, retenciones: 0, neto: 18074.58, estimado: true, sinTarifa: false });
  });

  it('tarjeta internacional suma su porcentaje', () => {
    const e = estimarCobro(100000, inmediato, { submetodo: 'card', internacional: true });
    expect(e.comision).toBe(5490); // 4,59 % + 900
  });

  it('día siguiente: Visa/MC, otras tarjetas y PSE/billeteras con su tramo; PSE sin retenciones', () => {
    expect(tramoDelCobro(diaSiguiente, { submetodo: 'card', marcaTarjeta: 'Visa' }).porcentaje).toBe(2.99);
    expect(tramoDelCobro(diaSiguiente, { submetodo: 'card', marcaTarjeta: 'American Express' }).porcentaje).toBe(3.29);
    expect(tramoDelCobro(diaSiguiente, { submetodo: 'nequi' }).porcentaje).toBe(2.89);
    const conRetenciones: TarifaProcesador = { ...diaSiguiente, reteFuentePct: 1.5, reteIcaPct: 0.414, reteIvaPct: 0, retencionesConfiguradas: true };
    expect(estimarCobro(100000, conRetenciones, { submetodo: 'pse' }).retenciones).toBe(0);
    const tarjeta = estimarCobro(100000, conRetenciones, { submetodo: 'card' });
    expect(tarjeta.reteFuente).toBe(1500);
    expect(tarjeta.reteIca).toBe(414);
    expect(tarjeta.neto).toBe(100000 - tarjeta.comision - tarjeta.ivaComision - 1914);
  });

  it('sin tarifa: no inventa descuentos y lo marca', () => {
    expect(estimarCobro(50000, null)).toMatchObject({ comision: 0, neto: 50000, sinTarifa: true, estimado: true });
  });

  it('suma de los 16 cobros de Bold de la org 358 (5 completos + 11 anticipos) con abono inmediato', () => {
    const completos = [44000, 55900, 28900, 105900, 112900].map((m) => estimarCobro(m, inmediato, { submetodo: 'card' }));
    const anticipos = Array.from({ length: 11 }, () => estimarCobro(20000, inmediato, { submetodo: 'nequi' }));
    const t = sumarEstimaciones([...completos, ...anticipos]);
    expect(t.bruto).toBe(567600);
    // Comisión: 567.600 × 3,59 % = 20.376,84 + 16 × 900 = 34.776,84; IVA 19 % ≈ 6.607,6.
    expect(t.comision).toBeCloseTo(34776.84, 1);
    expect(t.ivaComision).toBeCloseTo(6607.6, 0);
    expect(t.neto).toBeCloseTo(567600 - t.comision - t.ivaComision, 1);
  });

  it('valida porcentajes y fijos antes de guardar', () => {
    expect(erroresTarifa(inmediato)).toEqual([]);
    expect(erroresTarifa({ ...inmediato, base: { porcentaje: 120, fijo: -1 } }).sort()).toEqual(['fijo', 'porcentaje']);
    expect(erroresTarifa({ ...inmediato, reteIcaPct: -2 })).toEqual(['porcentaje']);
  });
});
