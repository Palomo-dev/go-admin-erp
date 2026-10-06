/**
 * Guardado del detalle de una carta con su pestaña «Por sede» en UNA transacción
 * (`guardar_carta_y_sedes`) y su respaldo mientras la migración no esté aplicada.
 * Datos ficticios (org 120).
 */
jest.mock('@/lib/services/website/cartaSedeService', () => ({
  prepararFilasCartaSede: jest.fn(async (_ctx: unknown, e: { branch_id: number; cambios: { product_id: number; is_listed?: boolean }[] }) =>
    e.cambios.map((c) => ({ organization_id: 120, branch_id: e.branch_id, product_id: c.product_id, is_listed: c.is_listed ?? true, web_price: null, is_sold_out: false, sold_out_until: null })),
  ),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.mock('@/components/sitio-web/seoanalitica/seo.server', () => ({ direccionDelSitio: jest.fn() }));
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: jest.fn() }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn() }));

import { guardarCartaYSedes } from '../carta.server';

const MENU = '11111111-1111-4111-8111-111111111111';

function ctxFalso(rpcError: { code: string } | null) {
  const rpc = jest.fn(async () => ({ data: { ok: true }, error: rpcError }));
  const upsert = jest.fn(async () => ({ error: null }));
  const from = jest.fn(() => ({ upsert }));
  return { ctx: { organizationId: 120, userId: 'u', supabase: { rpc, from } } as never, rpc, upsert, from };
}

const porSede = [
  { branch_id: 7, cambios: [{ product_id: 1, is_listed: false }] },
  { branch_id: 8, cambios: [{ product_id: 1 }, { product_id: 2 }] },
  { branch_id: 7, cambios: [{ product_id: 1, is_listed: true }] },
];

describe('guardarCartaYSedes', () => {
  test('carta y sedes van en una sola llamada transaccional, una fila por sede y producto', async () => {
    const f = ctxFalso(null);
    await guardarCartaYSedes(f.ctx, MENU, { name: 'Almuerzo' } as never, porSede as never);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = f.rpc.mock.calls[0] as unknown as [string, { p_org: number; p_menu: string; p_filas: { branch_id: number; product_id: number; is_listed: boolean }[] }];
    expect(nombre).toBe('guardar_carta_y_sedes');
    expect(args.p_org).toBe(120);
    expect(args.p_menu).toBe(MENU);
    expect(args.p_filas).toHaveLength(3);
    // El último lote gana para la misma sede y producto.
    expect(args.p_filas.find((x) => x.branch_id === 7 && x.product_id === 1)?.is_listed).toBe(true);
    expect(f.upsert).not.toHaveBeenCalled();
  });

  test('sin la RPC (migración pendiente) las sedes van en un solo upsert', async () => {
    const f = ctxFalso({ code: 'PGRST202' });
    await guardarCartaYSedes(f.ctx, 'principal', {} as never, porSede as never);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.upsert).toHaveBeenCalledTimes(1);
  });

  test('la carta implícita no guarda datos de carta', async () => {
    const f = ctxFalso(null);
    await expect(guardarCartaYSedes(f.ctx, 'principal', { name: 'X' } as never, [] as never)).rejects.toMatchObject({ codigo: 'pendiente_migracion' });
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
