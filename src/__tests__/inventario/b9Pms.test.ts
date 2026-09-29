/**
 * Inventario B9 · PMS (docs/implementacion/INVENTARIO-PLAN.md §5.10):
 *  - el consumo de habitación descuenta stock UNA vez (lo hace addFolioItem);
 *  - borrar un cargo del folio devuelve el stock por fn_folio_item_eliminar
 *    (devolución al costo, con receta), no como una compra al precio de venta.
 */
import fs from 'fs';
import path from 'path';

const rpc = jest.fn(async () => ({ data: { eliminado: true, movimientos: 1 }, error: null }));
const from = jest.fn(() => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'update', 'order']) b[m] = jest.fn(() => b);
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return b;
});
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])), from: (...a: unknown[]) => from(...(a as [])) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 130, getCurrentBranchId: () => 105 }));
const incrementOnPurchase = jest.fn();
jest.mock('@/lib/services/stockMovementService', () => ({
  stockMovementService: { incrementOnPurchase: (...a: unknown[]) => incrementOnPurchase(...a), decrementOnSale: jest.fn(async () => ({ errors: [], skipped: 0 })) },
}));

import FoliosService from '@/lib/services/foliosService';

const SRC = path.resolve(__dirname, '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

beforeEach(() => {
  rpc.mockClear();
  incrementOnPurchase.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('borrar un cargo del folio', () => {
  test('usa fn_folio_item_eliminar con la sucursal actual, nunca incrementOnPurchase', async () => {
    await FoliosService.deleteFolioItem('item-1', 'folio-1');
    expect(rpc).toHaveBeenCalledWith('fn_folio_item_eliminar', { p_item_id: 'item-1', p_branch_id: 105 });
    expect(incrementOnPurchase).not.toHaveBeenCalled();
  });

  test('si la base rechaza, el error sube (no se finge el borrado)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'folio: cargo no encontrado' } } as never);
    await expect(FoliosService.deleteFolioItem('item-x', 'folio-1')).rejects.toBeTruthy();
  });
});

describe('estático', () => {
  test('el consumo de habitación no vuelve a descontar stock (addFolioItem ya lo hace)', () => {
    const s = leer('lib/services/spaceConsumptionService.ts');
    expect(s).not.toMatch(/decrementOnSale\(/);
    expect(leer('lib/services/foliosService.ts')).toMatch(/decrementOnSale\(/);
  });

  test('foliosService ya no devuelve stock como compra', () => {
    expect(leer('lib/services/foliosService.ts')).not.toMatch(/incrementOnPurchase/);
  });
});
