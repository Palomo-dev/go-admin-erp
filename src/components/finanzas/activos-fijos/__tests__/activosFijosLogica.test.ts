/**
 * «Activos fijos» (Finanzas ronda 2 · F1, F2, G3): cifras del resumen, buscador, primera cuota y
 * bloqueo tras la primera depreciación. Datos inventados.
 */
import {
  filtrarActivos,
  mesPrimeraCuota,
  mostrarDepreciar,
  resumenActivos,
  tieneDepreciacion,
} from '../activosFijosLogica';

const activos = [
  { id: 'a1', code: 'AF-001', name: 'Camioneta de reparto', acquisition_cost: 98000000, accumulated_depreciation: 26133333, current_value: 71866667 },
  { id: 'a2', code: 'AF-002', name: 'Horno industrial', acquisition_cost: 42000000, accumulated_depreciation: 7700000, current_value: 34300000 },
  { id: 'a4', code: 'AF-004', name: 'Mobiliario sede norte', acquisition_cost: 32000000, accumulated_depreciation: 0, current_value: 32000000 },
];

describe('resumen de activos fijos', () => {
  test('suma costo, acumulada y valor en libros', () => {
    const r = resumenActivos(activos, []);
    expect(r.costoTotal).toBe(172000000);
    expect(r.depreciacionAcumulada).toBe(33833333);
    expect(r.valorEnLibros).toBe(138166667);
    expect(r.pendientes).toBe(0);
    expect(r.motivoComun).toBeNull();
  });

  test('cuenta los pendientes y da el motivo si es uno solo', () => {
    const r = resumenActivos(activos, [{ activo_id: 'a4', motivo: 'faltan_cuentas' }]);
    expect(r.pendientes).toBe(1);
    expect(r.motivoComun).toBe('faltan_cuentas');
  });

  test('con motivos distintos no elige uno; ignora bloqueos de activos que no están', () => {
    const r = resumenActivos(activos, [
      { activo_id: 'a4', motivo: 'faltan_cuentas' },
      { activo_id: 'a2', motivo: 'period_closed' },
      { activo_id: 'otro', motivo: 'faltan_cuentas' },
    ]);
    expect(r.pendientes).toBe(2);
    expect(r.motivoComun).toBeNull();
  });

  test('numéricos que llegan como texto de la base se suman igual', () => {
    const r = resumenActivos([{ id: 'x', acquisition_cost: '100.5' as unknown as number, accumulated_depreciation: 0, current_value: '100.5' as unknown as number }], []);
    expect(r.costoTotal).toBe(100.5);
  });
});

describe('buscador', () => {
  test('por código o nombre, sin tildes ni mayúsculas', () => {
    expect(filtrarActivos(activos, 'af-002').map((a) => a.id)).toEqual(['a2']);
    expect(filtrarActivos(activos, 'MOBILIARIO').map((a) => a.id)).toEqual(['a4']);
    expect(filtrarActivos([{ code: 'AF-9', name: 'Cámara frigorífica' }], 'camara')).toHaveLength(1);
    expect(filtrarActivos(activos, '  ')).toHaveLength(3);
  });
});

describe('bloqueo tras la primera depreciación', () => {
  test('con un mes en asset_depreciations se bloquea aunque la acumulada sea 0 (cuota de $ 0)', () => {
    expect(tieneDepreciacion({ accumulated_depreciation: 0, depreciaciones: 1 })).toBe(true);
  });

  test('sin detalle, la acumulada mayor que cero también bloquea', () => {
    expect(tieneDepreciacion({ accumulated_depreciation: 1800000 })).toBe(true);
  });

  test('sin depreciación, se edita todo', () => {
    expect(tieneDepreciacion({ accumulated_depreciation: 0, depreciaciones: 0 })).toBe(false);
  });
});

describe('primera cuota y botón «Depreciar»', () => {
  test('es el mes siguiente al de la adquisición', () => {
    expect(mesPrimeraCuota('2026-10-15')).toBe('2026-11');
    expect(mesPrimeraCuota('2026-12-31')).toBe('2027-01');
    expect(mesPrimeraCuota('')).toBeNull();
    expect(mesPrimeraCuota('2026-13-01')).toBeNull();
  });

  test('sin activos no se muestra «Depreciar»', () => {
    expect(mostrarDepreciar(0)).toBe(false);
    expect(mostrarDepreciar(1)).toBe(true);
  });
});
