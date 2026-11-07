/**
 * Alertas de cuentas de dinero (Finanzas r2 · A1/A2): claves estables, filas
 * de la tabla, cifras y validación de la revisión. Sin red ni base de datos.
 */
import {
  aplanarAlertas,
  cifrasAlertas,
  claveDiferenciaSaldo,
  claveDuplicado,
  claveDuplicadoExterno,
  claveMovimiento,
  esTablaRevisionesInexistente,
  etiquetaCuenta,
  movimientoSugeridoParaAnular,
  nombrePerfil,
  puedeAnularDuplicado,
  validarRevision,
  vecesPromedio,
  type ResumenDeteccion,
  type RevisionAlerta,
} from '../alertasBancarias';

const resumen: ResumenDeteccion = {
  duplicates: [
    {
      id: claveDuplicado([15, 12]),
      transactionIds: [15, 12],
      amount: 1250000,
      date: '2026-11-05',
      description: 'Consignación cliente',
      count: 2,
      severity: 'medium',
      bankAccountId: 3,
      bankAccountName: 'Banco A ··4321',
      movimientos: [
        { id: 12, fecha: '2026-11-05T15:02:00Z', descripcion: 'Consignación', referencia: '88412', monto: 1250000 },
        { id: 15, fecha: '2026-11-05T15:04:00Z', descripcion: 'Consignación', referencia: '88419', monto: 1250000 },
      ],
    },
  ],
  unusualAmounts: [
    {
      id: claveMovimiento('unusual_amount', 40),
      type: 'unusual_amount',
      severity: 'high',
      transactionId: 40,
      amount: 9400000,
      date: '2026-11-02T14:00:00Z',
      description: 'x',
      expectedValue: 1500000,
      actualValue: 9400000,
      bankAccountId: 4,
    },
  ],
  suspiciousPatterns: [
    { id: claveMovimiento('unusual_time', 41), type: 'unusual_time', severity: 'low', transactionId: 41, amount: 50000, date: '2026-11-01T04:00:00Z', description: 'y' },
  ],
  balanceDiscrepancies: [
    {
      id: claveDiferenciaSaldo(3, 40000),
      bankAccountId: 3,
      bankAccountName: 'Banco A ··4321',
      localBalance: 1040000,
      calculatedBalance: 1000000,
      realBalance: 1000000,
      difference: 40000,
      severity: 'high',
    },
  ],
};

const revision = (clave: string, extra: Partial<RevisionAlerta> = {}): RevisionAlerta => ({
  clave,
  tipo: 'duplicate',
  resultado: 'revisada',
  motivo: 'Son dos pagos distintos',
  revisadoPor: 'u-1',
  revisadoPorNombre: 'Persona de prueba',
  revisadoEn: '2026-11-06T10:00:00Z',
  movimientoAnuladoId: null,
  ...extra,
});

describe('claves estables', () => {
  it('el duplicado no depende del orden en que llegan los movimientos', () => {
    expect(claveDuplicado([15, 12])).toBe('dup:12,15');
    expect(claveDuplicado([12, 15])).toBe(claveDuplicado([15, 12]));
  });

  it('un tercer duplicado cambia la clave: la alerta vuelve a abrirse', () => {
    expect(claveDuplicado([12, 15, 18])).not.toBe(claveDuplicado([12, 15]));
  });

  it('una diferencia de saldo distinta es otra alerta', () => {
    expect(claveDiferenciaSaldo(3, 40000)).toBe('disc:3:40000.00');
    expect(claveDiferenciaSaldo(3, 40000.004)).toBe('disc:3:40000.00');
    expect(claveDiferenciaSaldo(3, 41000)).not.toBe(claveDiferenciaSaldo(3, 40000));
  });

  it('movimiento y duplicado externo llevan su prefijo', () => {
    expect(claveMovimiento('weekend_high_amount', 9)).toBe('weekend_high_amount:9');
    expect(claveDuplicadoExterno('EXT-1')).toBe('dup-of:EXT-1');
  });
});

describe('aplanarAlertas y cifras', () => {
  it('una fila por alerta, abiertas primero y por severidad', () => {
    const filas = aplanarAlertas(resumen, [revision('dup:12,15')]);
    expect(filas.map((f) => f.tipo)).toEqual(['unusual_amount', 'balance_discrepancy', 'unusual_time', 'duplicate']);
    // La alta de mayor monto primero entre las abiertas.
    expect(filas[0].monto).toBe(9400000);
    expect(filas[3].revision?.revisadoPorNombre).toBe('Persona de prueba');
  });

  it('el detalle de un monto inusual trae las veces el promedio', () => {
    const fila = aplanarAlertas(resumen).find((f) => f.tipo === 'unusual_amount');
    expect(fila?.datos.veces).toBe(6.3);
    expect(fila?.fecha).toEqual({ tipo: 'instante', valor: '2026-11-02T14:00:00Z' });
  });

  it('el duplicado se fecha con el día del negocio, sin convertir', () => {
    const fila = aplanarAlertas(resumen).find((f) => f.tipo === 'duplicate');
    expect(fila?.fecha).toEqual({ tipo: 'dia', valor: '2026-11-05' });
    expect(fila?.cuentaNombre).toBe('Banco A ··4321');
  });

  it('las cifras solo cuentan las abiertas', () => {
    const sinRevisar = cifrasAlertas(aplanarAlertas(resumen));
    expect(sinRevisar).toEqual({ abiertas: 4, severidadAlta: 2, posiblesDuplicados: 1, diferenciasSaldo: 1 });
    const conRevision = cifrasAlertas(aplanarAlertas(resumen, [revision('dup:12,15'), revision('disc:3:40000.00', { tipo: 'balance_discrepancy' })]));
    expect(conRevision).toEqual({ abiertas: 2, severidadAlta: 1, posiblesDuplicados: 0, diferenciasSaldo: 0 });
  });

  it('sin resumen no hay filas', () => {
    expect(aplanarAlertas(null)).toEqual([]);
  });

  it('vecesPromedio sin promedio no inventa una cifra', () => {
    expect(vecesPromedio(100, 0)).toBeNull();
    expect(vecesPromedio(undefined, 10)).toBeNull();
  });
});

describe('«Es un duplicado: anular uno»', () => {
  it('solo en duplicados abiertos con dos o más movimientos', () => {
    const [dup] = aplanarAlertas(resumen).filter((f) => f.tipo === 'duplicate');
    expect(puedeAnularDuplicado(dup)).toBe(true);
    expect(puedeAnularDuplicado({ ...dup, revision: revision(dup.clave) })).toBe(false);
    expect(puedeAnularDuplicado({ ...dup, movimientos: dup.movimientos.slice(0, 1) })).toBe(false);
    const [saldo] = aplanarAlertas(resumen).filter((f) => f.tipo === 'balance_discrepancy');
    expect(puedeAnularDuplicado(saldo)).toBe(false);
  });

  it('propone anular el último registrado y conservar el primero', () => {
    expect(movimientoSugeridoParaAnular(resumen.duplicates[0].movimientos ?? [])).toBe(15);
    expect(movimientoSugeridoParaAnular([])).toBeNull();
  });
});

describe('validarRevision', () => {
  const base = { clave: 'dup:12,15', tipo: 'duplicate', motivo: '  Son dos   pagos distintos ' };

  it('limpia el motivo y deja «revisada» por defecto', () => {
    const r = validarRevision(base);
    expect(r).toEqual({
      valido: true,
      entrada: { clave: 'dup:12,15', tipo: 'duplicate', motivo: 'Son dos pagos distintos', resultado: 'revisada', cuentaId: null, movimientoAnuladoId: null },
    });
  });

  it('acepta los nombres viejos del body (anomalyId, resolution)', () => {
    const r = validarRevision({ anomalyId: 'unusual_amount:40', tipo: 'unusual_amount', resolution: 'Pago de nómina anual' });
    expect(r.valido && r.entrada.clave).toBe('unusual_amount:40');
  });

  it('el motivo es obligatorio y tiene mínimo y máximo', () => {
    expect(validarRevision({ ...base, motivo: '   ' })).toEqual({ valido: false, error: 'motivo_vacio' });
    expect(validarRevision({ ...base, motivo: 'ok' })).toEqual({ valido: false, error: 'motivo_corto' });
    expect(validarRevision({ ...base, motivo: 'x'.repeat(501) })).toEqual({ valido: false, error: 'motivo_largo' });
  });

  it('rechaza clave, tipo y resultado inválidos', () => {
    expect(validarRevision({ ...base, clave: '' })).toEqual({ valido: false, error: 'clave_invalida' });
    expect(validarRevision({ ...base, tipo: 'otro' })).toEqual({ valido: false, error: 'tipo_invalido' });
    expect(validarRevision({ ...base, resultado: 'borrado' })).toEqual({ valido: false, error: 'resultado_invalido' });
    expect(validarRevision(null)).toEqual({ valido: false, error: 'clave_invalida' });
  });

  it('«duplicado_anulado» exige el movimiento anulado y solo en duplicados', () => {
    expect(validarRevision({ ...base, resultado: 'duplicado_anulado' })).toEqual({ valido: false, error: 'movimiento_requerido' });
    expect(validarRevision({ ...base, tipo: 'unusual_amount', resultado: 'duplicado_anulado', movimientoAnuladoId: 15 })).toEqual({
      valido: false,
      error: 'movimiento_requerido',
    });
    const r = validarRevision({ ...base, resultado: 'duplicado_anulado', movimientoAnuladoId: '15', cuentaId: 3 });
    expect(r.valido && r.entrada).toMatchObject({ resultado: 'duplicado_anulado', movimientoAnuladoId: 15, cuentaId: 3 });
  });

  it('el movimiento anulado solo viaja con «duplicado_anulado»', () => {
    const r = validarRevision({ ...base, movimientoAnuladoId: 15 });
    expect(r.valido && r.entrada.movimientoAnuladoId).toBeNull();
  });
});

describe('utilidades', () => {
  it('reconoce la tabla de revisiones sin crear', () => {
    expect(esTablaRevisionesInexistente({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(esTablaRevisionesInexistente({ code: 'PGRST205', message: "Could not find the table 'public.bank_alert_reviews'" })).toBe(true);
    expect(esTablaRevisionesInexistente({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(esTablaRevisionesInexistente(null)).toBe(false);
  });

  it('etiqueta de cuenta y nombre de perfil', () => {
    expect(etiquetaCuenta('Banco A', '000123454321')).toBe('Banco A ··4321');
    expect(etiquetaCuenta('Caja principal', null)).toBe('Caja principal');
    expect(etiquetaCuenta('Banco A ··4321', '4321')).toBe('Banco A ··4321');
    expect(etiquetaCuenta(null, null)).toBeNull();
    expect(nombrePerfil({ first_name: 'Persona', last_name: ' de prueba ' })).toBe('Persona de prueba');
    expect(nombrePerfil({ first_name: null, last_name: null, email: 'p@ejemplo.test' })).toBe('p@ejemplo.test');
    expect(nombrePerfil(null)).toBeNull();
  });
});
