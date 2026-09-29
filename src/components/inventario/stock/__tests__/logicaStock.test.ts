/**
 * Bloque B1: lógica pura de Stock/Movimientos/Lotes y las fachadas de RPC
 * (normalización de respuestas, parámetros que se envían, errores).
 */
import {
  TONO_ESTADO_STOCK,
  diferenciaCantidad,
  existenciaEn,
  filasCsvStock,
  nombreArchivo,
  sucursalesDeFila,
  tonoFilaStock,
  validarMovimiento,
  type FormMovimiento,
} from '../logica';
import { claveErrorB1 } from '../errores';
import { aRespuestaStock, guardarMinimos, listarMovimientos, listarStock, registrarMovimiento, type StockFila } from '@/lib/services/stockService';
import { aRespuestaLotes, ajustarLote, eliminarLote, guardarLote, listarLotes, lotesDeProducto } from '../../lotes/LotesService';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn() } }));

function clienteQueDevuelve(data: unknown, error: unknown = null) {
  const rpc = jest.fn().mockResolvedValue({ data, error });
  return { rpc };
}

const fila = (parcial: Partial<StockFila> = {}): StockFila => ({
  product_id: 1,
  nombre: 'Crema hidratante 200 ml',
  sku: 'CRE-0200',
  barcode: null,
  parent_id: null,
  atributos: null,
  categoria: 'Cuidado personal',
  unidad: 'UN',
  con_lotes: true,
  con_seriales: false,
  sigue_stock: true,
  variantes: 0,
  sin_asignar_fila: false,
  existencia: 14,
  reservado: 0,
  disponible: 14,
  minimo: 24,
  lotes: 1,
  sin_asignar: 0,
  estado: 'bajo_minimo',
  costo_promedio: 18500,
  valor: 259000,
  por_sucursal: [
    { branch_id: 1, sucursal: 'Principal', existencia: 14, reservado: 0, disponible: 14, minimo: 24, negativo: false, sin_asignar: 0 },
    { branch_id: 2, sucursal: 'Norte', existencia: 0, reservado: 0, disponible: 0, minimo: 0, negativo: false, sin_asignar: 0 },
  ],
  ...parcial,
});

const form = (parcial: Partial<FormMovimiento> = {}): FormMovimiento => ({
  direccion: 'in',
  productoId: 1,
  sucursalId: 1,
  cantidad: 5,
  costo: 1000,
  motivo: 'compra_sin_orden',
  motivoOtro: '',
  loteId: null,
  conLotes: false,
  conSeriales: false,
  disponible: null,
  ...parcial,
});

describe('logica de stock', () => {
  it('tonos de estado (Figma 582:277572)', () => {
    expect(TONO_ESTADO_STOCK).toEqual({ disponible: 'exito', bajo_minimo: 'advertencia', agotado: 'peligro', negativo: 'peligro' });
    expect(tonoFilaStock({ estado: 'negativo' })).toBe('peligro');
    expect(tonoFilaStock({ estado: 'agotado' })).toBeUndefined();
  });

  it('sucursales visibles y resto', () => {
    const f = fila();
    expect(sucursalesDeFila(f, 1)).toEqual({ visibles: [f.por_sucursal[0]], resto: 1 });
    expect(existenciaEn(f, 2)?.existencia).toBe(0);
    expect(existenciaEn(f, 99)).toBeNull();
    expect(existenciaEn(f, null)).toBeNull();
  });

  it('valida la entrada: costo obligatorio y no negativo', () => {
    expect(validarMovimiento(form())).toEqual({});
    expect(validarMovimiento(form({ costo: null }))).toEqual({ costo: 'requerido' });
    expect(validarMovimiento(form({ costo: -1 }))).toEqual({ costo: 'noNegativo' });
    expect(validarMovimiento(form({ cantidad: 0 }))).toEqual({ cantidad: 'mayorQueCero' });
    expect(validarMovimiento(form({ productoId: null, sucursalId: null }))).toEqual({ producto: 'requerido', sucursal: 'requerido' });
  });

  it('valida la salida: no supera lo disponible y no pide costo', () => {
    expect(validarMovimiento(form({ direccion: 'out', costo: null, disponible: 14, cantidad: 14 }))).toEqual({});
    expect(validarMovimiento(form({ direccion: 'out', costo: null, disponible: 14, cantidad: 15 }))).toEqual({ cantidad: 'superaDisponible' });
  });

  it('lote obligatorio si el producto maneja lotes; motivo «otro» con texto; seriales a Ajustes', () => {
    expect(validarMovimiento(form({ conLotes: true }))).toEqual({ lote: 'requerido' });
    expect(validarMovimiento(form({ conLotes: true, loteId: 7 }))).toEqual({});
    expect(validarMovimiento(form({ motivo: 'otro', motivoOtro: '  ' }))).toEqual({ motivo: 'requerido' });
    expect(validarMovimiento(form({ conSeriales: true }))).toEqual({ producto: 'conSeriales' });
  });

  it('diferencia del ajuste de lote con 3 decimales', () => {
    expect(diferenciaCantidad(36, 30)).toBe(-6);
    expect(diferenciaCantidad(0.1, 0.3)).toBe(0.2);
    expect(diferenciaCantidad(5, null)).toBeNull();
  });

  it('CSV y nombre de archivo con el día de la organización', () => {
    const filas = filasCsvStock([fila()], { estado: (e) => `E:${e}`, cantidad: (n) => String(n), moneda: (n) => `$${n}` });
    expect(filas[0]).toEqual(['Crema hidratante 200 ml', 'CRE-0200', '', 'Cuidado personal', 'Principal: 14 | Norte: 0', 14, 0, 14, 24, '$18500', '$259000', 'E:bajo_minimo']);
    expect(nombreArchivo('stock', '2026-09-29')).toBe('stock_2026-09-29.csv');
  });
});

describe('errores de B1', () => {
  it('códigos propios, 23505 y los del núcleo', () => {
    expect(claveErrorB1({ message: 'lote_requerido' })).toEqual({ espacio: 'b1', clave: 'lote_requerido' });
    expect(claveErrorB1({ message: 'duplicate key', code: '23505' })).toEqual({ espacio: 'b1', clave: 'lote_repetido' });
    expect(claveErrorB1({ message: 'stock_insuficiente', code: '23514' })).toEqual({ espacio: 'nucleo', clave: 'stock_insuficiente' });
    expect(claveErrorB1({ message: 'sin_permiso', code: '42501' })).toEqual({ espacio: 'nucleo', clave: 'sin_permiso' });
    expect(claveErrorB1({ message: 'algo raro' })).toEqual({ espacio: 'nucleo', clave: 'desconocido' });
  });
});

describe('fachadas de RPC', () => {
  it('listarStock manda los filtros sin vacíos y normaliza numeric en texto', async () => {
    const c = clienteQueDevuelve({
      total: '1',
      costos: false,
      sucursales: [1],
      kpis: { productos: '3', con_existencias: 2, valor: null, bajo_minimo: 1, agotados: 0, negativos: 0, sin_asignar: 0 },
      filas: [{ product_id: 1, nombre: 'X', existencia: '14.000', reservado: '0', disponible: '14', estado: 'raro', unidad: 'UN  ', por_sucursal: [] }],
    });
    const r = await listarStock(12, { busqueda: '', estados: [], agrupar: true, sucursales: [1] }, 25, 25, c);
    expect(c.rpc).toHaveBeenCalledWith('fn_stock_listado', { p_org: 12, p_filtros: { agrupar: true, sucursales: [1] }, p_desde: 25, p_limite: 25 });
    expect(r.total).toBe(1);
    expect(r.kpis.valor).toBeNull();
    expect(r.filas[0]).toMatchObject({ existencia: 14, disponible: 14, estado: 'disponible', unidad: 'UN', costo_promedio: null });
  });

  it('un error de la RPC se lanza (no se traga)', async () => {
    const c = clienteQueDevuelve(null, { message: 'sin_permiso', code: '42501' });
    await expect(listarStock(12, {}, 0, 25, c)).rejects.toMatchObject({ code: '42501' });
    await expect(listarMovimientos(12, {}, 0, 25, c)).rejects.toMatchObject({ code: '42501' });
    await expect(listarLotes(12, {}, 0, 25, c)).rejects.toMatchObject({ code: '42501' });
  });

  it('registrarMovimiento llama a la RPC del contrato con la nota', async () => {
    const c = clienteQueDevuelve({ ajuste_id: 161, numero: 'AJ-0161' });
    const r = await registrarMovimiento(
      { p_org: 2, p_branch: 2, p_product: 11, p_lot: null, p_direccion: 'in', p_qty: 5, p_costo: 1000, p_motivo: 'Compra sin orden', p_nota: 'x' },
      c,
    );
    expect(c.rpc).toHaveBeenCalledWith('fn_stock_registrar_movimiento', {
      p_org: 2,
      p_branch: 2,
      p_product: 11,
      p_lot: null,
      p_direccion: 'in',
      p_qty: 5,
      p_costo: 1000,
      p_motivo: 'Compra sin orden',
      p_nota: 'x',
    });
    expect(r).toEqual({ ajuste_id: 161, numero: 'AJ-0161' });
  });

  it('guardarMinimos no llama si no hay cambios', async () => {
    const c = clienteQueDevuelve(null);
    await guardarMinimos([], c);
    expect(c.rpc).not.toHaveBeenCalled();
    await guardarMinimos([{ product_id: 1, branch_id: 2, min_level: 3 }], c);
    expect(c.rpc).toHaveBeenCalledWith('update_product_min_stock', { p_items: [{ product_id: 1, branch_id: 2, min_level: 3 }] });
  });

  it('lotes: normaliza, y las escrituras van por sus RPC', async () => {
    const r = aRespuestaLotes({ total: 1, hoy: '2026-09-29', umbral: 30, kpis: {}, filas: [{ lot_id: 10, lot_code: 'L-1', estado: 'por_vencer', dias: '21', qty_on_hand: '12' }] });
    expect(r.filas[0]).toMatchObject({ lot_id: 10, estado: 'por_vencer', dias: 21, qty_on_hand: 12 });
    expect(aRespuestaStock(null).filas).toEqual([]);

    const c = clienteQueDevuelve({ lot_id: 10, lot_code: 'L-1', movimiento: { numero: 'AJ-0162' } });
    await expect(guardarLote(2, { product_id: 11, lot_code: 'L-1', cantidad_inicial: 12, costo_unitario: 900, branch_id: 2 }, c)).resolves.toEqual({
      lot_id: 10,
      lot_code: 'L-1',
      numero: 'AJ-0162',
    });
    expect(c.rpc).toHaveBeenLastCalledWith('fn_lote_guardar', { p_org: 2, p_lote: { product_id: 11, lot_code: 'L-1', cantidad_inicial: 12, costo_unitario: 900, branch_id: 2 } });

    const c2 = clienteQueDevuelve({ sin_cambio: false, numero: 'AJ-0164', diferencia: '-2' });
    await expect(ajustarLote(2, 10, 2, 10, 'Merma por rotura', null, c2)).resolves.toEqual({ sin_cambio: false, numero: 'AJ-0164', diferencia: -2 });
    expect(c2.rpc).toHaveBeenCalledWith('fn_lote_ajustar', { p_org: 2, p_lot: 10, p_branch: 2, p_cantidad: 10, p_motivo: 'Merma por rotura', p_nota: null });

    const c3 = clienteQueDevuelve(null);
    await eliminarLote(2, 10, c3);
    expect(c3.rpc).toHaveBeenCalledWith('fn_lote_eliminar', { p_org: 2, p_lot: 10 });

    const c4 = clienteQueDevuelve([{ lot_id: 1, lot_code: '5001', expiry_date: '2025-07-13', qty_on_hand: '0' }]);
    await expect(lotesDeProducto(2, 11, 2, c4)).resolves.toEqual([{ lot_id: 1, lot_code: '5001', expiry_date: '2025-07-13', qty_on_hand: 0 }]);
  });
});
