jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
import type { SupabaseClient } from '@supabase/supabase-js';
import { analizarDuplicado, completarDuplicados } from '@/lib/services/productosImportService';
import type { FilaRpc } from '@/lib/inventario/importacion/payload';
import type { ResultadoFila } from '@/lib/inventario/importacion/tipos';

describe('A6 duplicados del importador', () => {
  it('usa el detalle de Postgres cuando viene', () => {
    expect(analizarDuplicado('duplicate key value violates unique constraint "ux_products_org_barcode"', 'Key (organization_id, barcode)=(347, 5059726540791) already exists.')).toEqual({ campo: 'codigo_barras', valor: '5059726540791' });
  });

  it('sin detalle deduce el campo del índice del mensaje', () => {
    expect(analizarDuplicado('duplicate key value violates unique constraint "ux_products_org_barcode"')).toEqual({ campo: 'codigo_barras' });
    expect(analizarDuplicado('duplicate key value violates unique constraint "products_organization_id_sku_key"')).toEqual({ campo: 'sku' });
    expect(analizarDuplicado('duplicate key value violates unique constraint "products_org_scale_plu_uq"')).toEqual({ campo: 'plu' });
    expect(analizarDuplicado('duplicate key value violates unique constraint "raro"')).toEqual({ campo: 'otro' });
  });

  it('completa el valor desde la fila y el SKU del producto existente de la misma org', async () => {
    const llamadas: unknown[][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in']) q[m] = (...a: unknown[]) => (llamadas.push([m, ...a]), q);
    q.limit = async () => ({ data: [{ id: 9, sku: 'GP-SD-11467-BLANCO', barcode: '5059726540791' }], error: null });
    const sb = { from: () => q } as unknown as SupabaseClient;
    const r: ResultadoFila[] = [{ fila: 2, sku: 'NUEVO-1', ok: false, error: 'DUPLICADO', duplicado: { campo: 'codigo_barras' } }];
    const porFila = new Map<number, FilaRpc>([[2, { fila: 2, sku: 'NUEVO-1', nombre: 'X', codigo_barras: '5059726540791' } as FilaRpc]]);
    await completarDuplicados(sb, 347, r, porFila);
    expect(r[0].duplicado).toEqual({ campo: 'codigo_barras', valor: '5059726540791', skuExistente: 'GP-SD-11467-BLANCO' });
    expect(llamadas).toContainEqual(['eq', 'organization_id', 347]);
  });
});
