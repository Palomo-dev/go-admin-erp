/**
 * Receta por RPC (docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §2.4): quienes
 * antes leían la receta desde el navegador ahora llaman al servidor, que usa un
 * solo resolutor y un solo cálculo. Dobles de supabase.rpc.
 */
const rpc = jest.fn();
const from = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 134 }));

import { limpiarBusqueda, normalizarCosto, recipeService } from '../recipeService';
import { resultadoNecesidades, validateCompositeStock } from '../compositeStockValidation';
import { stockMovementService } from '../stockMovementService';

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('costo de la receta', () => {
  it('pide fn_receta_costo con el borrador y normaliza los numéricos', async () => {
    rpc.mockResolvedValue({
      data: {
        permitido: true, rinde: '1', costo_tanda: '5100.0000', costo_unidad: '5100', completo: false,
        lineas_sin_costo: 1, lineas_con_error: 0,
        lineas: [{ orden: 1, ingredient_product_id: 11, cantidad: '0.150000', factor: '0.001', costo_unitario: '26000.00', costo_linea: '3900', fuente: 'promedio_sucursal', error: null }],
      },
      error: null,
    });
    const receta = { name: null, yield_qty: 1, yield_unit_code: 'UN', notes: null, ingredientes: [] };
    const c = await recipeService.costo(134, 109, receta);
    expect(rpc).toHaveBeenCalledWith('fn_receta_costo', { p_organization_id: 134, p_branch_id: 109, p_receta: receta });
    expect(c.costo_tanda).toBe(5100);
    expect(c.lineas[0]).toMatchObject({ cantidad: 0.15, factor: 0.001, costo_unitario: 26000, costo_linea: 3900 });
  });
  it('sin permiso de costos: importes en null', () => {
    const c = normalizarCosto({ permitido: false, costo_tanda: null, lineas: [{ orden: 1, costo_linea: null, costo_unitario: null }] });
    expect(c.permitido).toBe(false);
    expect(c.costo_tanda).toBeNull();
    expect(c.lineas[0].costo_linea).toBeNull();
  });
});

describe('pantalla Recetas: crear y editar pasan por fn_receta_guardar (una transacción)', () => {
  it('crear manda la receta completa y relee la versión creada', async () => {
    rpc.mockResolvedValueOnce({ data: { recipe_id: 90, version: 2, cambio: true }, error: null });
    const getById = jest.spyOn(recipeService, 'getRecipeById').mockResolvedValue({ id: 90 } as never);
    await recipeService.createRecipe({
      organization_id: 134, product_id: 500, name: 'Base', yield_qty: 12, yield_unit_code: 'UN  ',
      ingredients: [{ ingredient_product_id: 11, quantity: 150, unit_code: 'GR  ', is_optional: false, notes: '' }],
    });
    expect(rpc).toHaveBeenCalledWith('fn_receta_guardar', {
      p_organization_id: 134,
      p_product_id: 500,
      p_receta: {
        name: 'Base', yield_qty: 12, yield_unit_code: 'UN', notes: null,
        ingredientes: [{ ingredient_product_id: 11, quantity: 150, unit_code: 'GR', waste_pct: 0, is_optional: false, notes: null }],
      },
    });
    expect(getById).toHaveBeenCalledWith(90);
    getById.mockRestore();
  });
  it('editar crea la versión N+1 con lo que no cambió tomado de la actual', async () => {
    const actual = {
      id: 7, organization_id: 134, product_id: 500, name: 'Base', yield_qty: 1, yield_unit_code: 'UN', notes: 'n', is_active: true, version: 1,
      ingredients: [{ ingredient_product_id: 11, quantity: 150, unit_code: 'GR', is_optional: true, notes: null }],
    };
    const getById = jest.spyOn(recipeService, 'getRecipeById').mockResolvedValue(actual as never);
    rpc.mockResolvedValueOnce({ data: { recipe_id: 8, version: 2, cambio: true }, error: null });
    await recipeService.updateRecipe(7, { name: 'Nueva' });
    expect(rpc.mock.calls[0][1].p_receta).toMatchObject({ name: 'Nueva', notes: 'n', ingredientes: [{ ingredient_product_id: 11, is_optional: true }] });
    getById.mockRestore();
  });
});

describe('aviso previo del POS: una llamada por carrito', () => {
  it('necesidades con el resolutor del servidor y mensaje de faltantes', async () => {
    rpc.mockResolvedValue({
      data: [
        { product_id: 11, nombre: 'Carne', unidad: 'KG', necesario: '32.311111', disponible: '17.367', faltante: '14.944111', error: null },
        { product_id: 10, nombre: 'Pan', unidad: 'UN', necesario: 100, disponible: 117, faltante: 0, error: null },
      ],
      error: null,
    });
    const r = await validateCompositeStock([{ product_id: 902, quantity: 100 }, { quantity: 1 }, { product_id: 901, quantity: 12 }], 109);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_receta_necesidades', {
      p_organization_id: 134,
      p_branch_id: 109,
      p_items: [{ product_id: 902, quantity: 100 }, { product_id: 901, quantity: 12 }],
    });
    expect(r.ok).toBe(false);
    expect(r.insufficientItems).toEqual([{ productName: 'Carne', needed: 32.311111, available: 17.367, unitCode: 'KG' }]);
    expect(r.message).toContain('necesitas 32.311KG, disponible 17.367KG');
  });
  it('sin ítems con producto no llama', async () => {
    expect(await validateCompositeStock([{ quantity: 2 }], 109)).toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sin faltantes: ok', () => {
    expect(resultadoNecesidades([{ product_id: 1, nombre: 'x', unidad: 'UN', necesario: 1, disponible: 2, faltante: 0, error: null }])).toEqual({ ok: true });
  });
});

describe('reservas de pedidos web', () => {
  // Núcleo B0: la receta la expande el servidor dentro de fn_stock_reservar
  // (mismo resolutor que la venta) y la reserva queda registrada por documento.
  it('una sola RPC: el servidor expande la receta y reserva; el navegador no toca stock_levels', async () => {
    rpc.mockResolvedValue({ data: { ok: true, reservas: [{ product_id: 11, qty: 0.3 }] }, error: null });
    const r = await stockMovementService.reserveStock(134, 109, 'W-1', [{ product_id: 901, quantity: 2 }]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_stock_reservar', {
      p_org: 134, p_branch: 109, p_ref_id: 'W-1', p_items: [{ product_id: 901, quantity: 2 }],
    });
    expect(from).not.toHaveBeenCalled();
    expect(r.success).toBe(true);
  });
  it('liberar devuelve lo reservado por el documento', async () => {
    rpc.mockResolvedValue({ data: { ok: true, items_released: 1 }, error: null });
    const r = await stockMovementService.releaseStockReservation(109, 'W-1', [{ product_id: 901, quantity: 2 }]);
    expect(rpc).toHaveBeenCalledWith('fn_stock_liberar_reserva', {
      p_branch: 109, p_ref_id: 'W-1', p_items: [{ product_id: 901, quantity: 2 }],
    });
    expect(from).not.toHaveBeenCalled();
    expect(r.success).toBe(true);
  });
});

describe('buscador de ingredientes', () => {
  it('limpia el texto para el filtro de PostgREST', () => {
    expect(limpiarBusqueda(' carne, (molida)% ')).toBe('carne molida');
  });
  it('excluye el propio producto, servicios, padres y borrados', async () => {
    const q = {
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), neq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), or: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 11, name: 'Carne', sku: 'C', unit_code: 'KG  ', track_stock: true }], error: null }).then(ok),
    };
    from.mockReturnValue(q);
    const r = await recipeService.buscarIngredientes(134, 'carne', [900, 901]);
    expect(q.neq).toHaveBeenCalledWith('status', 'deleted');
    expect(q.neq).toHaveBeenCalledWith('product_type', 'service');
    expect(q.eq).toHaveBeenCalledWith('is_parent', false);
    expect(q.not).toHaveBeenCalledWith('id', 'in', '(900,901)');
    expect(r).toEqual([{ id: 11, nombre: 'Carne', sku: 'C', unidad: 'KG', trackStock: true }]);
  });
});
