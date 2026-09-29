/**
 * B7 — acciones masivas del catálogo por RPC (INVENTARIO-PLAN §5.8) y P11.
 *
 * - El servicio ya no escribe `product_prices`, `product_costs`, `products`
 *   ni `stock_levels` desde el navegador: todo va por las RPC de la migración
 *   20260929160100 y la organización viaja explícita (el servidor la valida).
 * - Precio y costo: una expansión para toda la selección y lotes sin repetir.
 * - El resumen de la RPC se traduce a los códigos de `productos.masivas.errores`.
 * - Contrato de las migraciones: regla de vigencia única, sin tocar
 *   `avg_cost`, permisos en el servidor, sin anon; P11 con rastro y rollback.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { LOTE_PRECIOS, resultadoVacio, sumarResumenCatalogo, sumarResumenPrecios, errorDeRpc } from '../resumenMasivo';

const rpc = jest.fn();
const from = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const servicio = require('../bulkService') as typeof import('../bulkService');

const raiz = process.cwd();
const leer = (...partes: string[]) => readFileSync(join(raiz, ...partes), 'utf8');

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('resumen de fn_productos_precio_masivo', () => {
  it('cambiados y sin cambio cuentan como hechos; «ya tenía comparación» también', () => {
    const r = sumarResumenPrecios(resultadoVacio(), { cambiados: 3, sin_cambio: 2, omitidos: { ya_tiene_comparacion: 4 } });
    expect(r).toEqual({ exitosos: 9, fallidos: 0, errores: [] });
  });

  it('sin precio, sin costo y sin costo previo son fallos con su código', () => {
    const r = sumarResumenPrecios(resultadoVacio(), {
      cambiados: 1,
      omitidos: { sin_precio: 2, sin_costo: 1, sin_costo_previo: 5 },
      ejemplos: { sin_precio: [11, 12], sin_costo: [20] },
    });
    expect(r.exitosos).toBe(1);
    expect(r.fallidos).toBe(8);
    expect(r.errores).toEqual([
      { codigo: 'sinCostoPrevio', valores: { count: 5, n: 5 } },
      { codigo: 'sinPrecio', valores: { producto: 11 } },
      { codigo: 'sinCosto', valores: { producto: 20 } },
    ]);
  });

  it('«sin comparación que redondear» no es un fallo (se omite como antes)', () => {
    expect(sumarResumenPrecios(resultadoVacio(), { omitidos: { sin_comparacion: 7 } })).toEqual(resultadoVacio());
  });

  it('productos de otra organización o eliminados se informan', () => {
    const r = sumarResumenPrecios(resultadoVacio(), { cambiados: 1, no_encontrados: 2 });
    expect(r.errores).toEqual([{ codigo: 'noEncontrados', valores: { count: 2, n: 2 } }]);
  });
});

describe('resumen de estado y categoría masivos', () => {
  it('suma seleccionados y variantes arrastradas', () => {
    expect(sumarResumenCatalogo(resultadoVacio(), { actualizados: 5, seleccionados: 2, variantes: 7 })).toEqual({
      exitosos: 9,
      fallidos: 0,
      errores: [],
    });
  });
  it('42501 → sin permiso', () => {
    expect(errorDeRpc({ code: '42501', message: 'sin_permiso' }, 0, 10)).toEqual({ codigo: 'sinPermiso' });
    expect(errorDeRpc({ code: 'XX000', message: 'boom' }, 0, 10)).toEqual({ codigo: 'lote', valores: { desde: 0, hasta: 10, detalle: 'boom' } });
  });
});

describe('bulkService — solo RPC', () => {
  it('precio: expande una vez en el servidor y parte en lotes sin repetir', async () => {
    const alcance = Array.from({ length: LOTE_PRECIOS + 10 }, (_, i) => i + 1);
    rpc.mockImplementation((nombre: string, args: Record<string, unknown>) => {
      if (nombre === 'fn_productos_masivo_alcance') return Promise.resolve({ data: alcance, error: null });
      return Promise.resolve({ data: { cambiados: (args.p_product_ids as number[]).length, sin_cambio: 0 }, error: null });
    });
    const r = await servicio.bulkUpdatePrices(7, [1, 1, 2], 'venta', 'porcentaje', 10);
    expect(rpc).toHaveBeenNthCalledWith(1, 'fn_productos_masivo_alcance', { p_organization_id: 7, p_product_ids: [1, 2] });
    const lotes = rpc.mock.calls.filter((c) => c[0] === 'fn_productos_precio_masivo').map((c) => c[1].p_product_ids as number[]);
    expect(lotes).toHaveLength(2);
    expect(lotes.flat()).toEqual(alcance);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_organization_id: 7, p_tipo: 'venta', p_operacion: 'ajustar', p_opciones: { modo: 'porcentaje', cantidad: 10 } });
    expect(r.exitosos).toBe(alcance.length);
    expect(from).not.toHaveBeenCalled();
  });

  it('redondeo y copia a comparación pasan su operación', async () => {
    rpc.mockImplementation((nombre: string) =>
      Promise.resolve({ data: nombre === 'fn_productos_masivo_alcance' ? [5] : { cambiados: 1 }, error: null }),
    );
    await servicio.bulkRoundPrices(3, [5], 'compra', 'digitos', 0, 3, '990');
    expect(rpc).toHaveBeenLastCalledWith('fn_productos_precio_masivo', {
      p_organization_id: 3,
      p_product_ids: [5],
      p_tipo: 'compra',
      p_operacion: 'redondear',
      p_opciones: { modo: 'digitos', multiplo: 0, digitos: 3, valor: '990' },
    });
    await servicio.bulkCopyPriceToCompare(3, [5], true);
    expect(rpc).toHaveBeenLastCalledWith('fn_productos_precio_masivo', expect.objectContaining({ p_operacion: 'copiar_a_comparacion', p_opciones: { sobrescribir: true } }));
  });

  it('sin permiso en el alcance no sigue', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_permiso' } });
    const r = await servicio.bulkUpdatePrices(7, [1, 2], 'compra', 'fijo', 100);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ exitosos: 0, fallidos: 2, errores: [{ codigo: 'sinPermiso' }] });
  });

  it('estado, eliminar y categoría: una RPC por lote con la organización', async () => {
    rpc.mockResolvedValue({ data: { actualizados: 3, seleccionados: 2, variantes: 1, no_encontrados: 0 }, error: null });
    await servicio.bulkUpdateStatus(4, [1, 2], 'inactive');
    expect(rpc).toHaveBeenLastCalledWith('fn_productos_estado_masivo', { p_organization_id: 4, p_product_ids: [1, 2], p_status: 'inactive' });
    const r = await servicio.bulkDelete(4, [1, 2]);
    expect(rpc).toHaveBeenLastCalledWith('fn_productos_estado_masivo', { p_organization_id: 4, p_product_ids: [1, 2], p_status: 'deleted' });
    expect(r.exitosos).toBe(3);
    await servicio.bulkAssignCategory(4, [1, 2], 9);
    expect(rpc).toHaveBeenLastCalledWith('fn_productos_categoria_masiva', { p_organization_id: 4, p_product_ids: [1, 2], p_category_id: 9 });
    expect(from).not.toHaveBeenCalled();
  });

  it('el archivo ya no escribe tablas desde el navegador', () => {
    const fuente = leer('src', 'components', 'inventario', 'productos', 'bulk', 'bulkService.ts');
    expect(fuente).not.toMatch(/\.from\(['"](product_prices|product_costs|products|stock_levels)['"]\)/);
    expect(fuente).not.toContain('soft_delete_product');
  });
});

describe('migración 20260929160100 — acciones masivas', () => {
  const sql = leer('supabase', 'migrations', '20260929160100_inv_b7_2_acciones_masivas.sql');
  const rollback = leer('supabase', 'rollbacks', '20260929160100_inv_b7_2_acciones_masivas_rollback.sql');

  it('fija cada producto con la regla única de vigencia y no toca avg_cost', () => {
    expect(sql).toContain('public.fn_producto_int_fijar_precio(v_id');
    expect(sql).toContain('public.fn_producto_int_fijar_costo(v_id');
    expect(sql).not.toMatch(/insert\s+into\s+public\.product_(prices|costs)/i);
    expect(sql).not.toMatch(/(update|insert\s+into)\s+public\.stock_levels/i);
    expect(sql).toContain('order by effective_from desc, id desc limit 1');
  });

  it('permiso en el servidor, eliminar con su propio permiso, sin anon', () => {
    expect(sql).toMatch(/if p_status = 'deleted' then\s+perform public\.fn_productos_exigir_permiso\(p_organization_id,\s+array\['inventory\.delete'/);
    for (const fn of ['fn_productos_masivo_alcance', 'fn_productos_precio_masivo', 'fn_productos_estado_masivo', 'fn_productos_categoria_masiva']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`));
      expect(rollback).toContain(`drop function if exists public.${fn}(`);
    }
    expect(sql).toMatch(/revoke all on function public\.fn_productos_int_con_variantes\([^)]*\) from public, anon, authenticated;/);
  });

  it('las variantes eliminadas no reviven y la categoría es de la organización', () => {
    expect(sql).toMatch(/fn_productos_int_con_variantes[\s\S]*coalesce\(c\.status, 'active'\) <> 'deleted'/);
    expect(sql).toMatch(/c\.id = p_category_id and c\.organization_id = p_organization_id/);
  });
});

describe('migración 20260929160000 — P11 vigencias duplicadas', () => {
  const sql = leer('supabase', 'migrations', '20260929160000_inv_b7_1_vigencias_duplicadas.sql');
  const rollback = leer('supabase', 'rollbacks', '20260929160000_inv_b7_1_vigencias_duplicadas_rollback.sql');

  it('deja abierta la más reciente ya iniciada y cierra en el inicio de la siguiente', () => {
    expect(sql.match(/order by p[pc]\.effective_from desc, p[pc]\.id desc\) as rk/g)).toHaveLength(2);
    expect(sql.match(/lead\(p[pc]\.effective_from\) over \(partition by p[pc]\.product_id order by p[pc]\.effective_from, p[pc]\.id\)/g)).toHaveLength(2);
    expect(sql).toMatch(/effective_from <= now\(\)/);
    expect(sql).toContain("raise exception 'inv_b7_1: quedan vigencias duplicadas");
  });

  it('guarda el rastro y el rollback reabre solo lo que cerró', () => {
    expect(sql).toContain('private.inv_b7_vigencias_cerradas');
    expect(sql).toMatch(/revoke all on private\.inv_b7_vigencias_cerradas from public, anon, authenticated;/);
    expect(rollback).toMatch(/set effective_to = null[\s\S]*pp\.effective_to = r\.cerrada_en/);
    expect(rollback).toMatch(/pc\.effective_to = r\.cerrada_en/);
  });
});
