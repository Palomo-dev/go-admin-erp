/**
 * Ajuste masivo de stock por el kardex (decisión del dueño, 2026-09-24).
 *
 * - Modelo de referencia de la RPC: cálculo de la diferencia (set/add, mínimo
 *   0) y expansión padre↔variantes. Los casos de «contrato RPC» son los mismos
 *   que se corrieron contra la BD en una transacción que se deshizo.
 * - Servicio: una sola expansión en el servidor, lotes sin repetir productos y
 *   nunca una escritura directa a stock_levels desde el navegador.
 * - Migración: reutiliza la primitiva del kardex y cierra anon.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  calcularAjuste,
  expandirPadresVariantes,
  LOTE_AJUSTE_STOCK,
  partirEnLotes,
  RESUMEN_VACIO,
  sumarResumen,
  validarAjusteMasivo,
  type ProductoJerarquia,
} from '../ajusteMasivoStock';

const rpc = jest.fn();
const from = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

// Importar después del mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bulkUpdateStock } = require('../bulkService') as typeof import('../bulkService');

describe('calcularAjuste — modo «set» (establecer)', () => {
  it('sube hasta la cantidad indicada con una entrada por la diferencia', () => {
    expect(calcularAjuste(1, 'set', 2)).toEqual({ objetivo: 2, delta: 1, direccion: 'in', cantidadMovimiento: 1 });
  });
  it('baja hasta la cantidad indicada con una salida por la diferencia', () => {
    expect(calcularAjuste(10, 'set', 4)).toEqual({ objetivo: 4, delta: -6, direccion: 'out', cantidadMovimiento: 6 });
  });
  it('sin fila de stock (actual 0) crea la entrada completa', () => {
    expect(calcularAjuste(0, 'set', 2)).toMatchObject({ objetivo: 2, direccion: 'in', cantidadMovimiento: 2 });
  });
  it('una cantidad negativa se lleva a 0 (mínimo 0)', () => {
    expect(calcularAjuste(3, 'set', -5)).toMatchObject({ objetivo: 0, delta: -3, direccion: 'out' });
  });
  it('si ya está en la cantidad no hay movimiento', () => {
    expect(calcularAjuste(7, 'set', 7)).toEqual({ objetivo: 7, delta: 0, direccion: null, cantidadMovimiento: 0 });
  });
});

describe('calcularAjuste — modo «add» (sumar/restar)', () => {
  it('suma a la cantidad actual', () => {
    expect(calcularAjuste(5, 'add', 10)).toMatchObject({ objetivo: 15, delta: 10, direccion: 'in' });
  });
  it('resta con cantidad negativa', () => {
    expect(calcularAjuste(5, 'add', -3)).toMatchObject({ objetivo: 2, delta: -3, direccion: 'out', cantidadMovimiento: 3 });
  });
  it('restar más de lo que hay deja 0 y la salida es solo lo que había', () => {
    expect(calcularAjuste(5, 'add', -100)).toMatchObject({ objetivo: 0, delta: -5, direccion: 'out', cantidadMovimiento: 5 });
  });
  it('sumar 0 no genera movimiento', () => {
    expect(calcularAjuste(5, 'add', 0).direccion).toBeNull();
  });
  it('decimales: la diferencia es exacta sobre la cantidad', () => {
    expect(calcularAjuste(1.5, 'add', 0.25)).toMatchObject({ objetivo: 1.75, delta: 0.25, direccion: 'in' });
  });
});

describe('expandirPadresVariantes', () => {
  const catalogo: ProductoJerarquia[] = [
    { id: 1, is_parent: true, parent_product_id: null },
    { id: 11, is_parent: false, parent_product_id: 1 },
    { id: 12, is_parent: false, parent_product_id: 1 },
    { id: 13, is_parent: false, parent_product_id: 1, status: 'deleted' },
    { id: 2, is_parent: false, parent_product_id: null },
    { id: 3, is_parent: true, parent_product_id: null, status: 'deleted' },
    { id: 31, is_parent: false, parent_product_id: 3 },
  ];

  it('una variante trae a su padre y a sus hermanas (sin las eliminadas)', () => {
    expect(expandirPadresVariantes([11], catalogo)).toEqual([1, 11, 12]);
  });
  it('un padre trae a todas sus variantes vivas', () => {
    expect(expandirPadresVariantes([1], catalogo)).toEqual([1, 11, 12]);
  });
  it('un producto simple queda solo', () => {
    expect(expandirPadresVariantes([2], catalogo)).toEqual([2]);
  });
  it('no repite aunque se seleccionen padre y variante', () => {
    expect(expandirPadresVariantes([1, 11, 12, 2], catalogo)).toEqual([1, 2, 11, 12]);
  });
  it('un padre eliminado no se ajusta, pero su variante viva sí', () => {
    expect(expandirPadresVariantes([31], catalogo)).toEqual([31]);
  });
  it('ignora ids que no existen o están eliminados', () => {
    expect(expandirPadresVariantes([13, 999], catalogo)).toEqual([]);
  });
});

describe('partirEnLotes', () => {
  it('reparte todos los ids una sola vez', () => {
    const ids = Array.from({ length: 1001 }, (_, i) => i + 1);
    const lotes = partirEnLotes(ids, 400);
    expect(lotes.map((l) => l.length)).toEqual([400, 400, 201]);
    expect(lotes.flat()).toEqual(ids);
  });
  it('el lote por defecto cabe en el límite de la RPC (500)', () => {
    expect(LOTE_AJUSTE_STOCK).toBeLessThanOrEqual(500);
  });
  it('rechaza un tamaño inválido', () => {
    expect(() => partirEnLotes([1], 0)).toThrow('tamano_invalido');
  });
});

describe('validarAjusteMasivo', () => {
  it('deduplica ids y normaliza el motivo', () => {
    expect(validarAjusteMasivo({ productIds: [3, 3, 1], branchId: 7, cantidad: 2, modo: 'set', motivo: '  conteo  ' })).toEqual({
      ok: true, productIds: [3, 1], branchId: 7, cantidad: 2, modo: 'set', motivo: 'conteo',
    });
  });
  it('motivo vacío se guarda como null y el largo se recorta a 500', () => {
    const vacio = validarAjusteMasivo({ productIds: [1], branchId: 7, cantidad: 1, modo: 'add', motivo: '   ' });
    expect(vacio.ok && vacio.motivo).toBeNull();
    const largo = validarAjusteMasivo({ productIds: [1], branchId: 7, cantidad: 1, modo: 'add', motivo: 'x'.repeat(900) });
    expect(largo.ok && largo.motivo?.length).toBe(500);
  });
  it.each([
    [{ productIds: [], branchId: 7, cantidad: 1, modo: 'set' as const }, 'productos'],
    [{ productIds: [1], branchId: null, cantidad: 1, modo: 'set' as const }, 'sucursal'],
    [{ productIds: [1], branchId: 7, cantidad: Number.NaN, modo: 'set' as const }, 'cantidad'],
    [{ productIds: [1], branchId: 7, cantidad: 1, modo: 'x' as unknown as 'set' }, 'modo'],
  ])('rechaza entradas inválidas (%#)', (entrada, error) => {
    expect(validarAjusteMasivo(entrada)).toEqual({ ok: false, error });
  });
});

describe('sumarResumen', () => {
  it('acumula los lotes (numéricos que llegan como texto incluidos)', () => {
    const a = sumarResumen(RESUMEN_VACIO, { productos: 5, ajustados: 5, entradas: 5, unidades_entrada: '6.000' });
    const b = sumarResumen(a, { productos: 2, ajustados: 1, sin_cambio: 1, salidas: 1, unidades_salida: 3, sin_costo: 1 });
    expect(b).toEqual({
      productos: 7, ajustados: 6, sin_cambio: 1, sin_rastreo: 0, entradas: 5, salidas: 1,
      unidades_entrada: 6, unidades_salida: 3, sin_costo: 1,
    });
  });
});

describe('bulkUpdateStock — servicio', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('expande una vez en el servidor, ajusta por lotes sin re-expandir y no toca stock_levels', async () => {
    const alcance = Array.from({ length: 450 }, (_, i) => i + 1);
    rpc.mockImplementation((nombre: string, args: Record<string, unknown>) => {
      if (nombre === 'fn_productos_stock_masivo_alcance') return Promise.resolve({ data: alcance, error: null });
      const n = (args.p_product_ids as number[]).length;
      return Promise.resolve({ data: { productos: n, ajustados: n - 1, sin_cambio: 1, entradas: n - 1 }, error: null });
    });

    const r = await bulkUpdateStock(9, [1, 1, 2], 4, -2, 'add', ' conteo ');

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[0]).toEqual(['fn_productos_stock_masivo_alcance', { p_organization_id: 9, p_product_ids: [1, 2] }]);
    const lotes = rpc.mock.calls.slice(1).map(([nombre, args]) => {
      expect(nombre).toBe('fn_productos_ajuste_masivo_stock');
      expect(args).toMatchObject({ p_organization_id: 9, p_branch_id: 4, p_modo: 'add', p_cantidad: -2, p_motivo: 'conteo', p_expandir: false });
      return args.p_product_ids as number[];
    });
    expect(lotes.flat()).toEqual(alcance);
    expect(new Set(lotes.flat()).size).toBe(alcance.length);
    expect(from).not.toHaveBeenCalled();
    expect(r.fallidos).toBe(0);
    expect(r.exitosos).toBe(450);
    expect(r.resumen.ajustados).toBe(448);
  });

  it('un lote que falla cuenta sus productos como fallidos y sigue con el resto', async () => {
    rpc.mockImplementation((nombre: string, args: Record<string, unknown>) => {
      if (nombre === 'fn_productos_stock_masivo_alcance') {
        return Promise.resolve({ data: Array.from({ length: 500 }, (_, i) => i + 1), error: null });
      }
      const ids = args.p_product_ids as number[];
      if (ids[0] === 1) return Promise.resolve({ data: null, error: { message: 'sin_permiso' } });
      return Promise.resolve({ data: { productos: ids.length, ajustados: ids.length }, error: null });
    });

    const r = await bulkUpdateStock(9, [1], 4, 3, 'set');
    expect(r.fallidos).toBe(LOTE_AJUSTE_STOCK);
    expect(r.exitosos).toBe(500 - LOTE_AJUSTE_STOCK);
    expect(r.errores).toEqual(['sin_permiso']);
  });

  it('sin sucursal no llama al servidor', async () => {
    const r = await bulkUpdateStock(9, [1], 0, 3, 'set');
    expect(rpc).not.toHaveBeenCalled();
    expect(r.errores).toEqual(['sucursal']);
  });

  it('el servicio ya no escribe stock_levels desde el navegador', () => {
    const fuente = readFileSync(join(__dirname, '..', 'bulkService.ts'), 'utf8');
    const cuerpo = fuente.slice(fuente.indexOf('export async function bulkUpdateStock'), fuente.indexOf('export async function bulkUpdateStatus'));
    expect(cuerpo).not.toMatch(/from\(['"]stock_levels['"]\)/);
    expect(cuerpo).toContain('fn_productos_ajuste_masivo_stock');
  });
});

describe('migración 20260924190000 — contrato de la RPC', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260924190000_ajuste_masivo_stock_por_kardex.sql'),
    'utf8',
  );

  it('reutiliza la primitiva del kardex y el costo vigente (sin duplicar la escritura)', () => {
    expect(sql).toContain('public.fn_producto_int_ajustar_stock(');
    expect(sql).toContain('public.fn_costo_unitario_producto(');
    expect(sql).not.toMatch(/insert\s+into\s+public\.stock_(levels|movements)/i);
    expect(sql).not.toMatch(/on\s+conflict/i);
  });

  it('respeta el mínimo 0 y los dos modos', () => {
    expect(sql).toMatch(/greatest\(0, case when p_modo = 'set' then p_cantidad else v_actual \+ p_cantidad end\)/);
    expect(sql).toContain("p_modo not in ('set', 'add')");
  });

  it('permiso en el servidor y sin anon', () => {
    expect(sql).toMatch(/fn_productos_exigir_permiso\(p_organization_id,\s*array\['inventory\.adjust', 'inventory_management'\]\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_productos_ajuste_masivo_stock\([^)]*\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.fn_productos_int_expandir_variantes\([^)]*\) from public, anon, authenticated;/);
  });
});
