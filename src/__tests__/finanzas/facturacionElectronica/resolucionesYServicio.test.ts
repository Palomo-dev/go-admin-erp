/**
 * Resoluciones y numeración (consumo, vigencia, avisos, validación) y pasos
 * para activar el servicio de facturación electrónica. Lógica pura.
 */
import {
  avisosRangos,
  consumoRango,
  diasEntre,
  leerRango,
  ordenarRangos,
  requiereResolucion,
  validarRango,
  type DatosRango,
  type RangoNumeracion,
} from '@/lib/finanzas/facturacionElectronica/resolucionesLogica';
import { faltantesEmisor, pasosActivacion, puedeSolicitarActivacion, pasosListos } from '@/lib/finanzas/facturacionElectronica/servicioLogica';

const HOY = '2026-11-07';

function rango(p: Partial<RangoNumeracion> = {}): RangoNumeracion {
  return {
    id: 1,
    branch_id: 1,
    document_type: 'invoice',
    prefix: 'FV',
    resolution_number: '18764000000001',
    resolution_date: '2026-01-01',
    range_start: 1,
    range_end: 5000,
    current_number: 1042,
    valid_from: '2026-01-01',
    valid_until: '2028-02-14',
    is_active: true,
    alert_threshold: 100,
    ...p,
  };
}

describe('consumo (current_number = último usado, como fn_get_next_invoice_number)', () => {
  test('rango a mitad', () => {
    expect(consumoRango(rango())).toEqual({ usados: 1042, total: 5000, quedan: 3958, porcentaje: 20.8 });
  });
  test('sin usar (0) y rango que no empieza en 1', () => {
    expect(consumoRango(rango({ current_number: 0 }))).toMatchObject({ usados: 0, quedan: 5000 });
    expect(consumoRango(rango({ range_start: 1001, range_end: 2000, current_number: 1001 }))).toMatchObject({ usados: 1, total: 1000, quedan: 999 });
  });
  test('agotado', () => {
    expect(consumoRango(rango({ range_start: 1, range_end: 100, current_number: 100 }))).toMatchObject({ usados: 100, quedan: 0, porcentaje: 100 });
  });
});

describe('estado del rango', () => {
  test.each([
    [{}, 'vigente'],
    [{ is_active: false }, 'inactiva'],
    [{ valid_until: '2026-08-01' }, 'vencida'],
    [{ current_number: 5000 }, 'agotada'],
    [{ current_number: 4950 }, 'por_agotar'],
    [{ valid_until: '2026-11-20' }, 'por_vencer'],
    [{ valid_from: '2026-12-01' }, 'futura'],
  ] as const)('%j → %s', (p, estado) => {
    expect(leerRango(rango(p as Partial<RangoNumeracion>), HOY).estado).toBe(estado);
  });

  test('umbral de vencimiento: 30, 15 o 7 días', () => {
    expect(leerRango(rango({ valid_until: '2026-12-01' }), HOY).umbralVencimiento).toBe(30);
    expect(leerRango(rango({ valid_until: '2026-11-20' }), HOY).umbralVencimiento).toBe(15);
    expect(leerRango(rango({ valid_until: '2026-11-10' }), HOY).umbralVencimiento).toBe(7);
    expect(leerRango(rango({ valid_until: null }), HOY).umbralVencimiento).toBeNull();
  });

  test('días entre fechas planas, sin zona horaria', () => {
    expect(diasEntre('2026-11-07', '2026-11-08')).toBe(1);
    expect(diasEntre('2026-03-08', '2026-03-09')).toBe(1);
  });

  test('notas crédito y débito no exigen resolución', () => {
    expect(requiereResolucion('credit_note')).toBe(false);
    expect(requiereResolucion('debit_note')).toBe(false);
    expect(requiereResolucion('support_document')).toBe(true);
  });
});

test('avisos: del más grave al más leve, solo rangos activos', () => {
  const avisos = avisosRangos(
    [
      rango({ id: 1, valid_until: '2026-11-20' }),
      rango({ id: 2, current_number: 5000 }),
      rango({ id: 3, current_number: 4990 }),
      rango({ id: 4, valid_until: '2026-01-01', is_active: false }),
      rango({ id: 5 }),
    ],
    HOY,
  );
  expect(avisos.map((a) => [a.id, a.tipo])).toEqual([
    [2, 'agotada'],
    [3, 'por_agotar'],
    [1, 'por_vencer'],
  ]);
});

test('orden de la tabla: factura, soporte, notas; activo primero', () => {
  const r = ordenarRangos([rango({ id: 1, document_type: 'credit_note' }), rango({ id: 2, document_type: 'support_document' }), rango({ id: 3, is_active: false }), rango({ id: 4 })]);
  expect(r.map((x) => x.id)).toEqual([4, 3, 2, 1]);
});

describe('validación del formulario (mismas reglas que los CHECK de la tabla)', () => {
  const base: DatosRango = {
    documentType: 'invoice',
    prefix: 'FV',
    rangeStart: 1,
    rangeEnd: 100,
    currentNumber: 10,
    resolutionNumber: '',
    resolutionDate: '',
    validFrom: '2026-01-01',
    validUntil: '2027-01-01',
    technicalKey: '',
    testSetId: '',
    factusNumberingRangeId: null,
    isActive: true,
    alertThreshold: 100,
  };
  test('válido', () => expect(validarRango(base)).toEqual([]));
  test('errores', () => {
    expect(validarRango({ ...base, rangeEnd: 0 })).toContain('rango');
    expect(validarRango({ ...base, currentNumber: 500 })).toContain('actual');
    expect(validarRango({ ...base, prefix: ' ' })).toContain('prefijo');
    expect(validarRango({ ...base, validUntil: '2025-01-01' })).toContain('vigencia');
    expect(validarRango({ ...base, documentType: 'otro' })).toContain('tipo');
  });
});

describe('servicio: pasos para activar', () => {
  const emisorCompleto = {
    nit: '901456789',
    dv: 3,
    legal_name: 'Mi empresa S.A.S.',
    fiscal_responsibilities: ['O-13'],
    municipality_id: 'm-1',
    email: 'fe@miempresa.co',
  };

  test('faltantes del emisor', () => {
    expect(faltantesEmisor(emisorCompleto)).toEqual([]);
    expect(faltantesEmisor({ ...emisorCompleto, nit: null, tax_id: '901', email: 'no-es-correo' })).toEqual(['correo']);
    expect(faltantesEmisor(null)).toHaveLength(6);
    expect(faltantesEmisor({ ...emisorCompleto, fiscal_responsibilities: [], dv: null })).toEqual(['dv', 'responsabilidades']);
  });

  test('pendiente con el emisor listo: paso actual = resolución; no se puede solicitar aún', () => {
    const p = pasosActivacion({ faltanEmisor: [], tieneResolucionFactura: false, cuentaHabilitada: false, aceptados: 0 });
    expect(p.map((x) => [x.id, x.estado, x.quien])).toEqual([
      ['emisor', 'listo', 'tu'],
      ['resolucion', 'actual', 'tu'],
      ['cuenta', 'pendiente', 'goAdmin'],
      ['primerDocumento', 'pendiente', 'automatico'],
    ]);
    expect(puedeSolicitarActivacion(p)).toBe(false);
    expect(pasosListos(p)).toBe(1);
  });

  test('con los pasos del cliente listos se puede solicitar', () => {
    const p = pasosActivacion({ faltanEmisor: [], tieneResolucionFactura: true, cuentaHabilitada: false, aceptados: 0 });
    expect(puedeSolicitarActivacion(p)).toBe(true);
    expect(p.find((x) => x.id === 'cuenta')?.estado).toBe('actual');
  });
});
