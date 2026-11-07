/**
 * Finanzas, ronda 2 · frente E: cuadre de la plantilla de asiento (F3), validación de
 * «Usar plantilla» (F4) y estado de un movimiento anulado (G2). Datos inventados.
 */
import {
  hayErroresUso,
  importeLinea,
  lineasUtiles,
  totalesPlantilla,
  validarPlantilla,
  validarUsoPlantilla,
} from '@/lib/finanzas/contabilidad/plantillaAsiento';
import {
  accionesPermitidas,
  esConceptoReverso,
  estadoMovimiento,
  motivoDeNotas,
  nombrePersona,
} from '@/lib/finanzas/anulacionMovimiento';

const arriendo = [
  { account_code: '51200501', debit: 3000000, credit: 0 },
  { account_code: '23652001', debit: 0, credit: 105000 },
  { account_code: '23359501', debit: 0, credit: 2895000 },
];

describe('plantilla de asiento: cuadre', () => {
  test('débitos y créditos iguales cuadran', () => {
    expect(totalesPlantilla(arriendo)).toEqual({ debitos: 3000000, creditos: 3000000, diferencia: 0, cuadra: true });
    expect(validarPlantilla('Arriendo mensual', arriendo)).toBeNull();
  });

  test('una diferencia, aunque sea de un peso, no cuadra y bloquea el guardado', () => {
    const descuadrada = [...arriendo.slice(0, 2), { account_code: '23359501', debit: 0, credit: 2894999 }];
    const t = totalesPlantilla(descuadrada);
    expect(t.cuadra).toBe(false);
    expect(t.diferencia).toBe(1);
    expect(validarPlantilla('Arriendo mensual', descuadrada)).toBe('descuadre');
  });

  test('compara a centavos como la base (round(…, 2)): 0,1 + 0,2 cuadra con 0,3', () => {
    const lineas = [
      { account_code: 'A', debit: 0.1, credit: 0 },
      { account_code: 'B', debit: 0.2, credit: 0 },
      { account_code: 'C', debit: 0, credit: 0.3 },
    ];
    expect(totalesPlantilla(lineas).cuadra).toBe(true);
  });

  test('sin importes no «cuadra»: cero contra cero no es una plantilla', () => {
    expect(totalesPlantilla([{ account_code: 'A', debit: '', credit: '' }]).cuadra).toBe(false);
  });

  test('las líneas sin cuenta o sin importe no cuentan', () => {
    const lineas = [...arriendo, { account_code: '', debit: 500, credit: 0 }, { account_code: '1105', debit: '', credit: '' }];
    expect(lineasUtiles(lineas)).toHaveLength(3);
    expect(totalesPlantilla(lineas).cuadra).toBe(true);
  });

  test('el orden de los errores: nombre, líneas, línea inválida, descuadre', () => {
    expect(validarPlantilla('  ', arriendo)).toBe('nombre');
    expect(validarPlantilla('X', arriendo.slice(0, 1))).toBe('lineasInsuficientes');
    expect(validarPlantilla('X', [{ account_code: 'A', debit: 10, credit: 10 }, { account_code: 'B', debit: 0, credit: 0.5 }])).toBe('lineaInvalida');
    expect(validarPlantilla('X', [{ account_code: 'A', debit: -10, credit: 0 }, { account_code: 'B', debit: 0, credit: -10 }])).toBe('lineaInvalida');
  });

  test('importes escritos con coma decimal', () => {
    expect(importeLinea('1500,5')).toBe(1500.5);
    expect(importeLinea('abc')).toBe(0);
    expect(importeLinea(null)).toBe(0);
  });
});

describe('usar plantilla: fecha y sucursal obligatorias', () => {
  test('sin sucursal ni fecha, cada campo tiene su error', () => {
    const e = validarUsoPlantilla({ fecha: '', sucursalId: null });
    expect(e).toEqual({ fecha: 'requerida', sucursal: 'requerida' });
    expect(hayErroresUso(e)).toBe(true);
  });

  test('con las dos, no hay errores', () => {
    const e = validarUsoPlantilla({ fecha: '2026-11-01', sucursalId: 3 });
    expect(e).toEqual({});
    expect(hayErroresUso(e)).toBe(false);
  });

  test('una fecha mal formada o una sucursal 0 no pasan', () => {
    expect(validarUsoPlantilla({ fecha: '01/11/2026', sucursalId: 0 })).toEqual({ fecha: 'requerida', sucursal: 'requerida' });
  });
});

describe('movimiento anulado: el estado sale del dato', () => {
  const anulacion = { fecha: '2026-11-04T15:00:00Z', motivo: 'Se registró dos veces', autor: 'Persona de prueba' };

  test('sin reverso: confirmado, se puede anular y duplicar', () => {
    const estado = estadoMovimiento({ anulacion: null });
    expect(estado).toBe('confirmado');
    expect(accionesPermitidas(estado)).toEqual({ anular: true, duplicar: true });
  });

  test('con reverso: anulado, sin «Anular» ni «Duplicar»', () => {
    const estado = estadoMovimiento({ anulacion });
    expect(estado).toBe('anulado');
    expect(accionesPermitidas(estado)).toEqual({ anular: false, duplicar: false });
  });

  test('el propio reverso no se anula ni se duplica', () => {
    const estado = estadoMovimiento({ anulacion: null, esReverso: true });
    expect(estado).toBe('reverso');
    expect(accionesPermitidas(estado)).toEqual({ anular: false, duplicar: false });
    expect(esConceptoReverso('ANULACIÓN: Arriendo noviembre')).toBe(true);
    expect(esConceptoReverso('Arriendo noviembre')).toBe(false);
  });

  test('motivo: sin la coletilla de caja cerrada ni el texto automático', () => {
    expect(motivoDeNotas('Se registró dos veces · Caja original #12 cerrada: reverso en la caja #15 de la misma sucursal')).toBe('Se registró dos veces');
    expect(motivoDeNotas('Anulación del movimiento #482')).toBeNull();
    expect(motivoDeNotas('Anulación del movimiento #482 · Caja original #12 cerrada: reverso en la caja #15 de la misma sucursal')).toBeNull();
    expect(motivoDeNotas(null)).toBeNull();
  });

  test('autor: nombre y apellido, o el correo si no hay nombre', () => {
    expect(nombrePersona({ first_name: 'Ana', last_name: 'Prueba' })).toBe('Ana Prueba');
    expect(nombrePersona({ first_name: '', last_name: null, email: 'ana@ejemplo.test' })).toBe('ana@ejemplo.test');
    expect(nombrePersona(null)).toBeNull();
  });
});
