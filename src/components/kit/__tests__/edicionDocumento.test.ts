/**
 * Kit · lógica de las piezas de edición del documento (venta, compra, OC):
 * impuestos por línea, «Agregar productos», formularios rápidos e ítem
 * manual. Sin React.
 */
import {
  alternarImpuesto,
  cambiarTipoPersona,
  coincidenciaExacta,
  contarAgregados,
  estadoStock,
  idsDesdeCodigo,
  impuestosElegidos,
  nombreTerceroRapido,
  productoRapidoInicial,
  seleccionInicial,
  tarifaSeleccion,
  terceroRapidoInicial,
  textoSeleccionImpuestos,
  textoSinHtml,
  validarItemManual,
  validarProductoRapido,
  validarTerceroRapido,
  type OpcionImpuesto,
} from '../documento/edicionDocumentoLogica';
import { tonoLinea } from '../documento/documentoLineasLogica';
import { opcionCliente, opcionProveedor } from '../selectorEntidadLogica';
import { vigente } from '@/lib/services/documentos/vigencia';

const IVA: OpcionImpuesto = { id: 'a', codigo: 'IVA_19', nombre: 'IVA', tarifa: 19, predeterminado: true };
const ULTRA: OpcionImpuesto = { id: 'b', codigo: null, nombre: 'Ultraprocesados', tarifa: 20 };
const INC: OpcionImpuesto = { id: 'c', codigo: 'INC_8', nombre: 'INC 8 %', tarifa: 8 };
const opciones = [IVA, ULTRA, INC];
const pct = (x: number) => `${x} %`;

describe('impuestos por línea', () => {
  test('alternar: varios en venta, uno en compra', () => {
    expect(alternarImpuesto(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(alternarImpuesto(['a', 'b'], 'a', true)).toEqual(['b']);
    expect(alternarImpuesto(['a'], 'b', false)).toEqual(['b']);
    expect(alternarImpuesto(['a'], 'a', false)).toEqual([]);
  });

  test('texto, suma de tarifas y orden de la organización', () => {
    expect(textoSeleccionImpuestos(['b', 'a'], opciones, pct)).toBe('IVA 19 % + Ultraprocesados 20 %');
    // El nombre que ya trae la tarifa no la repite.
    expect(textoSeleccionImpuestos(['c'], opciones, pct)).toBe('INC 8 %');
    expect(textoSeleccionImpuestos([], opciones, pct)).toBe('');
    expect(tarifaSeleccion(['a', 'b'], opciones)).toBe(39);
    expect(impuestosElegidos(['zz', 'c'], opciones)).toEqual([INC]);
  });

  test('selección inicial: la de la línea o el predeterminado; ids desde tax_code/tax_rate guardados', () => {
    expect(seleccionInicial(opciones)).toEqual(['a']);
    expect(seleccionInicial(opciones, ['c'])).toEqual(['c']);
    expect(seleccionInicial([ULTRA])).toEqual([]);
    expect(idsDesdeCodigo(opciones, 'inc_8', 8)).toEqual(['c']);
    expect(idsDesdeCodigo(opciones, null, 20)).toEqual(['b']);
    expect(idsDesdeCodigo(opciones, null, 0)).toEqual([]);
  });

  test('tono de la fila: el error manda sobre el aviso', () => {
    expect(tonoLinea({ error: 'x', aviso: 'y' })).toBe('peligro');
    expect(tonoLinea({ aviso: 'Solo hay 3' })).toBe('advertencia');
    expect(tonoLinea({})).toBeUndefined();
  });
});

describe('agregar productos', () => {
  test('estado del stock', () => {
    expect(estadoStock({ stock: 3, controlaStock: true })).toBe('disponible');
    expect(estadoStock({ stock: 0, controlaStock: true })).toBe('sinStock');
    expect(estadoStock({ stock: -2 })).toBe('sinStock');
    expect(estadoStock({ stock: 0, controlaStock: false })).toBe('noControla');
    expect(estadoStock({ stock: null })).toBe('desconocido');
  });

  test('escáner: coincidencia exacta y única por SKU o código de barras', () => {
    const ps = [
      { sku: 'ZAP-42', codigoBarras: '7701234567890' },
      { sku: 'ZAP-43', codigoBarras: null },
    ];
    expect(coincidenciaExacta('zap-42', ps)).toBe(ps[0]);
    expect(coincidenciaExacta(' 7701234567890 ', ps)).toBe(ps[0]);
    expect(coincidenciaExacta('ZAP', ps)).toBeNull();
    expect(coincidenciaExacta('', ps)).toBeNull();
  });

  test('descripciones sin HTML crudo (hallazgo del dueño en compras)', () => {
    expect(textoSinHtml('<p>Zapatilla <strong>urbana</strong>&nbsp;42</p><script>alert(1)</script>')).toBe('Zapatilla urbana 42');
    expect(textoSinHtml('<ul><li>Uno</li><li>Dos &amp; tres</li></ul>')).toBe('Uno Dos & tres');
    expect(textoSinHtml(null)).toBe('');
    expect(textoSinHtml('a'.repeat(500), 10)).toHaveLength(10);
  });

  test('contador de agregados por producto', () => {
    expect([...contarAgregados([1, 2, 1]).entries()]).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  test('precio vigente: dentro de la vigencia y el más reciente; nunca uno futuro', () => {
    const ahora = Date.parse('2026-09-28T12:00:00Z');
    const filas = [
      { price: 1, effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-06-01T00:00:00Z' },
      { price: 2, effective_from: '2026-06-01T00:00:00Z', effective_to: null },
      { price: 3, effective_from: '2026-10-01T00:00:00Z', effective_to: null },
    ];
    expect(vigente(filas, ahora)?.price).toBe(2);
    expect(vigente([], ahora)).toBeNull();
  });
});

describe('formulario rápido de tercero', () => {
  test('lo escrito en el buscador: número → documento, texto → nombre', () => {
    expect(terceroRapidoInicial('cliente', '1.020.304.050')).toEqual(expect.objectContaining({ tipo: 'persona', tipoDocumento: 'cc', numeroDocumento: '1020304050', nombres: '' }));
    expect(terceroRapidoInicial('cliente', 'Laura Gómez Ruiz')).toEqual(expect.objectContaining({ nombres: 'Laura Gómez', apellidos: 'Ruiz' }));
    expect(terceroRapidoInicial('proveedor', 'Distribuidora del Norte')).toEqual(
      expect.objectContaining({ tipo: 'empresa', tipoDocumento: 'nit', razonSocial: 'Distribuidora del Norte', diasCredito: 30 }),
    );
  });

  test('persona ↔ empresa conserva lo escrito', () => {
    const p = terceroRapidoInicial('cliente', 'Laura Gómez');
    const e = cambiarTipoPersona(p, 'empresa');
    expect(e).toEqual(expect.objectContaining({ tipo: 'empresa', tipoDocumento: 'nit', razonSocial: 'Laura Gómez' }));
    expect(nombreTerceroRapido(e)).toBe('Laura Gómez');
    expect(cambiarTipoPersona(e, 'persona')).toEqual(expect.objectContaining({ tipo: 'persona', tipoDocumento: 'cc', nombres: 'Laura', apellidos: 'Gómez' }));
  });

  test('validación: el cliente necesita documento; el proveedor no (documento soporte)', () => {
    const c = terceroRapidoInicial('cliente', 'Laura');
    expect(validarTerceroRapido(c, 'cliente')).toEqual({ numeroDocumento: 'obligatorio' });
    const p = terceroRapidoInicial('proveedor', 'Distribuidora');
    expect(validarTerceroRapido(p, 'proveedor')).toEqual({});
    expect(validarTerceroRapido({ ...p, correo: 'malo', dv: '12', diasCredito: 400, numeroDocumento: '12a' }, 'proveedor')).toEqual({
      correo: 'correo',
      dv: 'dv',
      diasCredito: 'dias',
      numeroDocumento: 'documento',
    });
    expect(validarTerceroRapido({ ...p, razonSocial: ' ' }, 'proveedor')).toEqual({ razonSocial: 'obligatorio' });
  });
});

describe('ítem manual y producto rápido', () => {
  test('ítem manual: descripción, cantidad > 0 y precio ≥ 0', () => {
    expect(validarItemManual({ descripcion: 'Flete', cantidad: 1, precio: 0 })).toEqual({});
    expect(validarItemManual({ descripcion: ' ', cantidad: 0, precio: -1 })).toEqual({ descripcion: 'obligatorio', cantidad: 'mayorQueCero', precio: 'noNegativo' });
  });

  test('producto rápido: lo escrito va a SKU si parece código; el impuesto predeterminado viene marcado', () => {
    expect(productoRapidoInicial('GUA-NIT-42', 'a')).toEqual(expect.objectContaining({ nombre: '', sku: 'GUA-NIT-42', impuestos: ['a'] }));
    expect(productoRapidoInicial('Guante de nitrilo', null)).toEqual(expect.objectContaining({ nombre: 'Guante de nitrilo', sku: '', impuestos: [] }));
    expect(validarProductoRapido({ nombre: 'X', sku: 'X 1', precio: -1, impuestos: [], controlaStock: true })).toEqual({ sku: 'sku', precio: 'noNegativo' });
    expect(validarProductoRapido({ nombre: '', sku: '', precio: null, impuestos: [], controlaStock: true })).toEqual({ nombre: 'obligatorio', sku: 'obligatorio', precio: 'obligatorio' });
  });
});

describe('opciones de tercero en el diálogo del documento', () => {
  test('cliente: insignia de tipo, «Por cobrar» en advertencia o «Al día» en éxito, contacto en la línea', () => {
    const o = opcionCliente({ id: '1', nombre: 'Comercial Andina', documento: 'NIT 900.123.456-7', contacto: 'Ana Ruiz (Compras)', tipo: 'Empresa', saldoPorCobrar: 'Por cobrar $ 1.200.000', alDia: 'Al día' });
    expect(o).toEqual(expect.objectContaining({ etiqueta: 'Empresa', insignia: { texto: 'Por cobrar $ 1.200.000', tono: 'advertencia' }, meta: 'Ana Ruiz (Compras)' }));
    expect(opcionCliente({ id: '2', nombre: 'Luis', alDia: 'Al día' }).insignia).toEqual({ texto: 'Al día', tono: 'exito' });
    expect(opcionCliente({ id: '3', nombre: 'Sin datos' }).insignia).toBeUndefined();
  });

  test('proveedor: sin datos del diálogo se comporta como antes (saldo en la línea secundaria)', () => {
    expect(opcionProveedor({ id: '1', nombre: 'P', contacto: 'Ana', saldoPorPagar: 'Por pagar $ 5' }).meta).toBe('Ana · Por pagar $ 5');
    const nuevo = opcionProveedor({ id: '1', nombre: 'P', contacto: 'Ana', saldoPorPagar: 'Por pagar $ 5', tipo: 'Empresa', alDia: 'Al día' });
    expect(nuevo.meta).toBe('Ana');
    expect(nuevo.insignia).toEqual({ texto: 'Por pagar $ 5', tono: 'advertencia' });
  });
});
