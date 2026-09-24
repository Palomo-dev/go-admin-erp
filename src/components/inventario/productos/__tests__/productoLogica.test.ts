jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import {
  calcularMargen,
  costoDesdeMargen,
  descuentoComparacion,
  tonoMargen,
  variacionPorcentual,
} from '../logica/margen';
import { estadoStockSucursal, totalesStock, totalesStockInicial, valorInventario } from '../logica/stock';
import {
  claveAtributos,
  combinacionesNuevas,
  combinacionesRepetidas,
  combinarAtributos,
  nombreVariante,
  resumenAtributos,
  segmentoSku,
  skuVariante,
} from '../logica/variantes';
import {
  cupoSeriales,
  estadoGarantia,
  insertarToken,
  parsearListaSeriales,
  patronTieneConsecutivo,
  previsualizarSerial,
  transicionesComunes,
  transicionesSerial,
  validarPatron,
} from '../logica/seriales';
import { aErrorProducto } from '@/lib/services/productoService';
import { textoANumero } from '@/components/kit/campoNumeroLogica';
import { alternarValorMulti, filtrarOpcionesMulti } from '@/components/kit/multiSelectLogica';

describe('margen', () => {
  it('calcula el margen sobre el precio de venta', () => {
    expect(calcularMargen(189900, 128000)).toBe(32.6);
    expect(calcularMargen(100, 100)).toBe(0);
    expect(calcularMargen(100, 150)).toBe(-50);
  });
  it('sin precio o sin costo no hay margen', () => {
    expect(calcularMargen(0, 10)).toBeNull();
    expect(calcularMargen(null, 10)).toBeNull();
    expect(calcularMargen(100, null)).toBeNull();
  });
  it('el costo se deriva del margen y vuelve al mismo margen', () => {
    expect(costoDesdeMargen(200, 25)).toBe(150);
    expect(calcularMargen(200, costoDesdeMargen(200, 25))).toBe(25);
    expect(costoDesdeMargen(200, 100)).toBeNull();
  });
  it('descuento de comparación y tono del margen', () => {
    expect(descuentoComparacion(189900, 229900)).toBe(17);
    expect(descuentoComparacion(100, 90)).toBeNull();
    expect(tonoMargen(32)).toBe('exito');
    expect(tonoMargen(12)).toBe('advertencia');
    expect(tonoMargen(3)).toBe('peligro');
    expect(tonoMargen(null)).toBe('neutro');
    expect(variacionPorcentual(100, 105)).toBe(5);
    expect(variacionPorcentual(0, 5)).toBeNull();
  });
});

describe('stock por sucursal', () => {
  const filas = [
    { branch_id: 1, qty_on_hand: 25, qty_reserved: 4, min_level: 5, con_registro: true },
    { branch_id: 2, qty_on_hand: 6, qty_reserved: 0, min_level: 10, con_registro: true },
    { branch_id: 3, qty_on_hand: 0, qty_reserved: 0, min_level: 0, con_registro: true },
    { branch_id: 4, qty_on_hand: 0, qty_reserved: 0, min_level: 0, con_registro: false },
  ];
  it('estado frente al mínimo (sobre el disponible)', () => {
    expect(filas.map(estadoStockSucursal)).toEqual(['disponible', 'bajo_minimo', 'agotado', 'sin_registro']);
    expect(estadoStockSucursal({ branch_id: 1, qty_on_hand: 8, qty_reserved: 3, min_level: 5 })).toBe('bajo_minimo');
  });
  it('totales de todas o de la sucursal activa', () => {
    expect(totalesStock(filas)).toMatchObject({ enExistencia: 31, reservado: 4, disponible: 27, bajoMinimo: 1, agotadas: 1, sucursales: 4 });
    expect(totalesStock(filas, 2)).toMatchObject({ enExistencia: 6, disponible: 6, sucursales: 1 });
  });
  it('valor del inventario y del stock inicial', () => {
    expect(valorInventario(3, 120000.5)).toBe(360001.5);
    expect(
      totalesStockInicial(
        [
          { qty: 25, unit_cost: 120000 },
          { qty: 12, unit_cost: null },
          { qty: null, unit_cost: 5 },
        ],
        100000,
      ),
    ).toEqual({ unidades: 37, valor: 4200000 });
  });
});

describe('matriz de variantes', () => {
  it('producto cartesiano sin tipos vacíos ni valores repetidos', () => {
    const c = combinarAtributos([
      { nombre: 'Talla', valores: ['40', '41', ' 40 '] },
      { nombre: 'Color', valores: ['Negro', 'Blanco'] },
      { nombre: 'Material', valores: [] },
    ]);
    expect(c).toHaveLength(4);
    expect(c[0]).toEqual({ Talla: '40', Color: 'Negro' });
    expect(c[3]).toEqual({ Talla: '41', Color: 'Blanco' });
    expect(combinarAtributos([])).toEqual([]);
  });
  it('clave estable sin tildes ni orden y combinaciones nuevas', () => {
    expect(claveAtributos({ Color: 'Azúl', Talla: 'M' })).toBe(claveAtributos({ talla: 'm', color: 'azul' }));
    const nuevas = combinacionesNuevas(
      [
        { nombre: 'Talla', valores: ['S', 'M'] },
        { nombre: 'Color', valores: ['Rojo'] },
      ],
      [{ Talla: 'S', Color: 'Rojo' }],
    );
    expect(nuevas).toEqual([{ Talla: 'M', Color: 'Rojo' }]);
    expect(combinacionesRepetidas([{ attributes: { a: '1' } }, { attributes: { A: '1' } }, { attributes: { a: '2' } }])).toHaveLength(1);
  });
  it('SKU de variante sin tildes y sin chocar', () => {
    expect(segmentoSku('Azul marino')).toBe('AZULMA');
    expect(segmentoSku('Ñandú')).toBe('NANDU');
    expect(skuVariante('ZAP-0042', { Talla: '40', Color: 'Negro' })).toBe('ZAP-0042-40-NEGRO');
    expect(skuVariante('ZAP', { Talla: '40' }, new Set(['zap-40', 'ZAP-40-2']))).toBe('ZAP-40-3');
  });
  it('nombre legible y resumen de atributos', () => {
    expect(nombreVariante('Camiseta', { Talla: 'M', Color: 'Azul' })).toBe('Camiseta (M, Azul)');
    expect(nombreVariante('Camiseta', {})).toBe('Camiseta');
    expect(
      resumenAtributos([
        { attributes: { Talla: '40', Color: 'Negro' } },
        { variant_data: { Talla: '41', Color: 'negro' } },
        { attributes: null },
      ]),
    ).toEqual([
      { nombre: 'Talla', valores: ['40', '41'] },
      { nombre: 'Color', valores: ['Negro'] },
    ]);
  });
});

describe('patrón de seriales', () => {
  it('previsualiza con el mismo orden de reemplazo del servidor', () => {
    expect(previsualizarSerial('ZAP-{YYYY}-{SEQ}', { sku: 'X', fecha: '2026-09-21', secuencia: 1 })).toBe('ZAP-2026-000001');
    expect(previsualizarSerial('{PROD}-{YY}{MM}{DD}-{####}', { sku: 'ZAP-42', fecha: '2026-01-05', secuencia: 37 })).toBe(
      'ZAP-42-260105-0037',
    );
    expect(previsualizarSerial('S{###}{##}', { sku: '', fecha: '2026-01-05', secuencia: 7 })).toBe('S00707');
  });
  it('exige un consecutivo', () => {
    expect(validarPatron('')).toBe('patron_requerido');
    expect(validarPatron('ZAP-{YYYY}')).toBe('patron_sin_consecutivo');
    expect(validarPatron('ZAP-{##}')).toBeNull();
    expect(patronTieneConsecutivo('A{SEQ}')).toBe(true);
  });
  it('inserta tokens en el cursor', () => {
    expect(insertarToken('ZAP-', '{SEQ}')).toEqual({ patron: 'ZAP-{SEQ}', cursor: 9 });
    expect(insertarToken('AB', '{YY}', 1)).toEqual({ patron: 'A{YY}B', cursor: 5 });
  });
  it('transiciones manuales iguales a las del servidor', () => {
    expect(transicionesSerial('in_stock')).toEqual(['damaged', 'rma']);
    expect(transicionesSerial('sold')).toEqual(['returned']);
    expect(transicionesSerial('desconocido')).toEqual([]);
    expect(transicionesComunes(['in_stock', 'damaged'])).toEqual(['rma']);
    expect(transicionesComunes([])).toEqual([]);
  });
  it('cupo, lista pegada y garantía', () => {
    expect(cupoSeriales(45.5, 42)).toBe(3);
    expect(cupoSeriales(2, 5)).toBe(0);
    expect(parsearListaSeriales('A1\nA2, A1;A3\t\n  ')).toEqual(['A1', 'A2', 'A3']);
    expect(estadoGarantia('2027-09-18', '2026-09-18')).toEqual({ estado: 'vigente', dias: 365 });
    expect(estadoGarantia('2026-09-10', '2026-09-18')).toEqual({ estado: 'vencida', dias: 8 });
    expect(estadoGarantia(null, '2026-09-18')).toEqual({ estado: 'sin_garantia', dias: 0 });
  });
});

describe('errores de la RPC y campos del kit', () => {
  it('traduce el código de negocio', () => {
    expect(aErrorProducto({ message: 'sku_duplicado', details: 'ZAP' }).codigo).toBe('sku_duplicado');
    expect(aErrorProducto({ message: 'Acceso denegado a la organización', code: '42501' }).codigo).toBe('sin_permiso');
    expect(aErrorProducto({ message: 'Entrada 0: cantidad 3 sin costo.' }).codigo).toBe('stock_sin_costo');
    expect(aErrorProducto({ message: 'boom' }).codigo).toBe('desconocido');
  });
  it('CampoNumero: coma decimal, vacío y rango', () => {
    expect(textoANumero('1.234,5'.replace('.', ''))).toBe(1234.5);
    expect(textoANumero('')).toBeNull();
    expect(textoANumero('12.345', { decimales: 0 })).toBe(12);
    expect(textoANumero('-3', { minimo: 0 })).toBe(0);
  });
  it('MultiSelect: filtra sin tildes y alterna conservando el orden', () => {
    const ops = [{ valor: '1', etiqueta: 'Calzado' }, { valor: '2', etiqueta: 'Camisetas', descripcion: 'Algodón' }];
    expect(filtrarOpcionesMulti(ops, 'algodon').map((o) => o.valor)).toEqual(['2']);
    expect(alternarValorMulti(['1'], '2')).toEqual(['1', '2']);
    expect(alternarValorMulti(['1', '2'], '1')).toEqual(['2']);
  });
});
