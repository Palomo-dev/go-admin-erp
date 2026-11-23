import {
  diferenciaLinea,
  lineaRequiereMotivo,
  montoLineaValido,
  puedeCerrarCuadre,
  totalesCuadre,
} from '../cuadre';
import { prepararUbicacion, validarZona } from '../zonas';

describe('cuadre del domiciliario', () => {
  it('diferencia en centavos, sin arrastre binario', () => {
    expect(diferenciaLinea(58900, 57900)).toBe(-1000);
    expect(diferenciaLinea(0.3, 0.1 + 0.2)).toBe(0);
  });

  it('monto válido entre 0 y lo esperado; motivo si falta', () => {
    expect(montoLineaValido(50000, 50000)).toBe(true);
    expect(montoLineaValido(50000, 0)).toBe(true);
    expect(montoLineaValido(50000, 50001)).toBe(false);
    expect(montoLineaValido(50000, -1)).toBe(false);
    expect(montoLineaValido(50000, Number.NaN)).toBe(false);
    expect(lineaRequiereMotivo(50000, 49999)).toBe(true);
    expect(lineaRequiereMotivo(50000, 50000)).toBe(false);
  });

  const lineas = [
    { esperado: 30000, recibido: 30000, status: 'received' as const },
    { esperado: 20000, recibido: 19000, status: 'shortage' as const },
    { esperado: 9999, recibido: null, status: 'cancelled' as const },
  ];

  it('totales ignoran las anuladas y la diferencia solo cuenta lo procesado', () => {
    expect(totalesCuadre(lineas)).toEqual({ esperado: 50000, recibido: 49000, diferencia: -1000, pendientes: 0 });
    expect(totalesCuadre([...lineas, { esperado: 5000, recibido: null, status: 'pending' }]))
      .toEqual({ esperado: 55000, recibido: 49000, diferencia: -1000, pendientes: 1 });
  });

  it('cerrar exige todo recibido y, con diferencia, motivo y responsable', () => {
    expect(puedeCerrarCuadre([{ esperado: 1, recibido: null, status: 'pending' }], null, null))
      .toEqual({ ok: false, error: 'LINEAS_PENDIENTES' });
    expect(puedeCerrarCuadre(lineas, 'Faltaron mil', null)).toEqual({ ok: false, error: 'MOTIVO_Y_RESPONSABLE_REQUERIDOS' });
    expect(puedeCerrarCuadre(lineas, '  ', 'courier')).toEqual({ ok: false, error: 'MOTIVO_Y_RESPONSABLE_REQUERIDOS' });
    expect(puedeCerrarCuadre(lineas, 'Faltaron mil', 'courier')).toEqual({ ok: true });
    expect(puedeCerrarCuadre([lineas[0]], null, null)).toEqual({ ok: true });
  });
});

describe('zonas de envío', () => {
  it('zona válida', () => {
    expect(validarZona({ name: 'Centro', fee: 5000, promise_min_minutes: 30, promise_max_minutes: 60,
      free_shipping_from: 100000, free_shipping_applies_to: 'web', delivery_days: [1, 2, 3, 4, 5], cutoff_time: '18:00' }))
      .toEqual([]);
  });

  it('errores con el mismo criterio de los CHECK', () => {
    expect(validarZona({ name: ' ' })).toContain('nombre_requerido');
    expect(validarZona({ name: 'A', fee: -1 })).toContain('tarifa_invalida');
    expect(validarZona({ name: 'A', promise_min_minutes: 60, promise_max_minutes: 30 })).toContain('promesa_invalida');
    expect(validarZona({ name: 'A', free_shipping_from: 0 })).toContain('envio_gratis_invalido');
    expect(validarZona({ name: 'A', free_shipping_applies_to: 'manual' as never })).toContain('aplica_gratis_invalido');
    expect(validarZona({ name: 'A', delivery_days: [] })).toContain('dias_invalidos');
    expect(validarZona({ name: 'A', delivery_days: [0, 8] })).toContain('dias_invalidos');
    expect(validarZona({ name: 'A', cutoff_time: '25:00' })).toContain('corte_invalido');
  });

  it('ubicaciones: normaliza el DANE y valida cada tipo', () => {
    expect(prepararUbicacion({ location_type: 'municipality', municipality_code: '5001' }))
      .toEqual({ ok: true, fila: { location_type: 'municipality', label: null, municipality_code: '05001' } });
    expect(prepararUbicacion({ location_type: 'neighborhood', neighborhood: ' Laureles ', municipality_code: '05001' }))
      .toMatchObject({ ok: true, fila: { neighborhood: 'Laureles', municipality_code: '05001' } });
    expect(prepararUbicacion({ location_type: 'neighborhood', neighborhood: '' })).toEqual({ ok: false, error: 'barrio_requerido' });
    expect(prepararUbicacion({ location_type: 'municipality', municipality_code: '12' })).toEqual({ ok: false, error: 'municipio_invalido' });
    expect(prepararUbicacion({ location_type: 'postal_code', postal_code: '050031' })).toMatchObject({ ok: true });
    expect(prepararUbicacion({ location_type: 'polygon', polygon: { type: 'Point' } })).toEqual({ ok: false, error: 'poligono_invalido' });
    expect(prepararUbicacion({ location_type: 'polygon', polygon: { type: 'Polygon', coordinates: [] } })).toMatchObject({ ok: true });
  });
});
