/**
 * Kit · cobro y documento: estados del botón con importe, reparto de los
 * métodos de pago de la organización, líneas del documento (impuestos,
 * recepción) y validación del diálogo único de pago. Nada de esto calcula
 * el negocio: solo decide qué se ve y qué se deja enviar.
 */
import { ArrowLeftRight, Banknote, CreditCard, Landmark, QrCode, Smartphone, WalletCards } from 'lucide-react';
import { contextoMoneda } from '@/lib/utils/moneda';
import { vistaBotonImporte } from '../botonImporteLogica';
import { atajoMetodo, elegidoEnResto, iconoMetodoPago, repartirMetodos } from '../metodosPago';
import { decimalesCantidad, limitesRecepcion, resumenRecepcion, simboloMoneda, textoImpuestosLinea } from '../documento/documentoLineasLogica';
import { cambioEfectivo, montosRapidos, pagoInicial, pagoLimpio, validarPago } from '../documento/pago';

describe('BotonImporte: los 5 estados de Figma', () => {
  test('listo y sin caja se pueden pulsar; sin caja va en tinte y sin importe', () => {
    expect(vistaBotonImporte('listo')).toMatchObject({ deshabilitado: false, variante: 'primario', mostrarImporte: true });
    expect(vistaBotonImporte('sinCaja')).toMatchObject({ deshabilitado: false, variante: 'tinte', mostrarImporte: false });
  });

  test('falta y deshabilitado muestran el motivo; procesando gira', () => {
    expect(vistaBotonImporte('falta')).toMatchObject({ deshabilitado: true, mostrarMotivo: true, ocupado: false });
    expect(vistaBotonImporte('deshabilitado')).toMatchObject({ deshabilitado: true, mostrarMotivo: true });
    expect(vistaBotonImporte('procesando')).toMatchObject({ deshabilitado: true, ocupado: true, mostrarMotivo: false });
  });
});

describe('métodos de pago de la organización', () => {
  const m = (codigo: string) => ({ codigo, nombre: codigo.toUpperCase() });

  test('caben todos: sin «Otro»', () => {
    const r = repartirMetodos([m('cash'), m('card'), m('transfer')], 4);
    expect(r.visibles.map((x) => x.codigo)).toEqual(['cash', 'card', 'transfer']);
    expect(r.resto).toEqual([]);
  });

  test('no caben: N−1 botones y el resto en «Otro», en el orden de la organización', () => {
    const r = repartirMetodos([m('cash'), m('card'), m('transfer'), m('wompi'), m('nequi')], 4);
    expect(r.visibles.map((x) => x.codigo)).toEqual(['cash', 'card', 'transfer']);
    expect(r.resto.map((x) => x.codigo)).toEqual(['wompi', 'nequi']);
    expect(elegidoEnResto(r.resto, 'nequi')?.codigo).toBe('nequi');
    expect(elegidoEnResto(r.resto, 'cash')).toBeNull();
  });

  test('atajos Alt+1…9 por posición', () => {
    expect(atajoMetodo(0)).toBe('Alt+1');
    expect(atajoMetodo(3)).toBe('Alt+4');
    expect(atajoMetodo(9)).toBeUndefined();
  });

  test('icono de respaldo por código', () => {
    expect(iconoMetodoPago('cash')).toBe(Banknote);
    expect(iconoMetodoPago('Efectivo')).toBe(Banknote);
    expect(iconoMetodoPago('card')).toBe(CreditCard);
    expect(iconoMetodoPago('credit_note')).toBe(Landmark);
    expect(iconoMetodoPago('transfer')).toBe(ArrowLeftRight);
    expect(iconoMetodoPago('wompi')).toBe(QrCode);
    expect(iconoMetodoPago('nequi')).toBe(Smartphone);
    expect(iconoMetodoPago('001')).toBe(WalletCards);
    expect(iconoMetodoPago(null)).toBe(WalletCards);
  });
});

describe('líneas del documento', () => {
  test('símbolo de la moneda del documento, nunca pesos por defecto', () => {
    expect(simboloMoneda(contextoMoneda('USD', { locale: 'en-US' }))).toBe('$');
    expect(simboloMoneda(contextoMoneda('EUR', { locale: 'es-ES' }))).toBe('€');
    expect(simboloMoneda(contextoMoneda('XYZ', { locale: 'es-CO' }))).toBe('XYZ');
  });

  test('decimales de cantidad según las líneas (kilos)', () => {
    expect(decimalesCantidad([{ cantidad: 2 }, { cantidad: 1 }])).toBe(0);
    expect(decimalesCantidad([{ cantidad: 1.25 }, { cantidad: 3 }])).toBe(2);
    expect(decimalesCantidad([{ cantidad: 0.12345 }])).toBe(3);
  });

  test('impuestos de la línea: nombre y tarifa, incluido o adicional', () => {
    const f = (x: number | null | undefined) => (typeof x === 'number' ? `${x} %` : null);
    expect(textoImpuestosLinea([{ nombre: 'IVA', tarifa: 19, incluido: true }], f)).toEqual({ texto: 'IVA 19 %', incluido: true });
    expect(textoImpuestosLinea([{ nombre: 'IVA', tarifa: 19 }, { nombre: 'INC', tarifa: 8 }], f)).toEqual({ texto: 'IVA 19 % · INC 8 %', incluido: false });
    expect(textoImpuestosLinea([{ nombre: 'IVA', tarifa: 19, incluido: true }, { nombre: 'INC', tarifa: 8 }], f).incluido).toBeNull();
    expect(textoImpuestosLinea([], f)).toEqual({ texto: '', incluido: null });
  });

  test('recepción: de 0 a lo pendiente; resumen de líneas', () => {
    expect(limitesRecepcion({ cantidad: 10, cantidadPendiente: 4 })).toEqual({ minimo: 0, maximo: 4 });
    expect(limitesRecepcion({ cantidad: 10 })).toEqual({ minimo: 0, maximo: 10 });
    expect(limitesRecepcion({ cantidad: 10, cantidadPendiente: -2 })).toEqual({ minimo: 0, maximo: 0 });
    expect(
      resumenRecepcion([
        { cantidad: 10, cantidadPendiente: 4, cantidadRecibida: 4 },
        { cantidad: 5, cantidadPendiente: 5, cantidadRecibida: 2 },
        { cantidad: 3, cantidadPendiente: 3, cantidadRecibida: 0 },
        { cantidad: 2, cantidadPendiente: 0 },
      ]),
    ).toEqual({ completas: 2, parciales: 1, sinRecibir: 1 });
  });
});

describe('diálogo único de pago: validación', () => {
  const hoy = '2026-09-24';
  const base = { ...pagoInicial(100000, hoy), metodo: 'cash' };

  test('abre con el saldo y el día de la organización', () => {
    expect(pagoInicial(100000, hoy)).toMatchObject({ monto: 100000, fecha: hoy, metodo: null });
    expect(pagoInicial(0, hoy).monto).toBeNull();
  });

  test('un pago válido no tiene errores', () => {
    expect(validarPago(base, { saldo: 100000, hoy })).toEqual({});
  });

  test('monto vacío, cero o por encima del saldo', () => {
    expect(validarPago({ ...base, monto: null }, { saldo: 100000, hoy }).monto).toBe('montoVacio');
    expect(validarPago({ ...base, monto: 0 }, { saldo: 100000, hoy }).monto).toBe('montoCero');
    expect(validarPago({ ...base, monto: 100001 }, { saldo: 100000, hoy }).monto).toBe('montoExcede');
    expect(validarPago({ ...base, monto: 100001 }, { saldo: 100000, hoy, permitirExcedente: true }).monto).toBeUndefined();
  });

  test('método, fecha futura y referencia exigida', () => {
    expect(validarPago({ ...base, metodo: null }, { saldo: 100000, hoy }).metodo).toBe('metodoVacio');
    expect(validarPago({ ...base, fecha: '2026-09-25' }, { saldo: 100000, hoy }).fecha).toBe('fechaFutura');
    expect(validarPago({ ...base, fecha: '' }, { saldo: 100000, hoy }).fecha).toBe('fechaVacia');
    expect(validarPago({ ...base, referencia: '  ' }, { saldo: 100000, hoy, exigeReferencia: true }).referencia).toBe('referenciaVacia');
  });

  test('efectivo: lo recibido debe cubrir el monto; el cambio nunca es negativo', () => {
    expect(validarPago({ ...base, recibido: 50000 }, { saldo: 100000, hoy, esEfectivo: true }).recibido).toBe('recibidoInsuficiente');
    expect(cambioEfectivo(120000, 100000)).toBe(20000);
    expect(cambioEfectivo(90000, 100000)).toBe(0);
    expect(cambioEfectivo(null, 100000)).toBeNull();
  });

  test('montos rápidos con los decimales de la moneda', () => {
    expect(montosRapidos(100001, 0)).toEqual([
      { clave: 'saldo', monto: 100001 },
      { clave: 'mitad', monto: 50001 },
    ]);
    expect(montosRapidos(10.1, 2)[1]).toEqual({ clave: 'mitad', monto: 5.05 });
    expect(montosRapidos(3, 0)[1]).toEqual({ clave: 'mitad', monto: 2 });
    expect(montosRapidos(0)).toEqual([]);
  });

  test('lo que se envía va sin espacios sobrantes', () => {
    expect(pagoLimpio({ ...base, referencia: ' 123 ', notas: ' ok ' })).toMatchObject({ referencia: '123', notas: 'ok' });
  });
});
