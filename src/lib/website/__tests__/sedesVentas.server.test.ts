/**
 * Escrituras del área «ventas» en el servidor:
 * - guardarSedesWeb: usa la RPC transaccional si existe; sin ella, no libera
 *   slugs de más y, si un update falla a mitad, restaura lo ya tocado (una
 *   sede publicada no se queda sin dirección).
 * - alternarReservasWeb: solo toca sedes activas.
 * - moderarResenaTienda: exige website.sites.edit.
 * Organización ficticia; sin datos reales.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: jest.fn() }));
jest.mock('@/lib/navigation/navegacionServidor', () => ({ seccionesVisiblesServidor: jest.fn() }));
jest.mock('@/components/sitio-web/seoanalitica/seo.server', () => ({ direccionDelSitio: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn() }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn() }));
jest.mock('@/lib/organizacion/slugSede', () => ({ slugChocaConPagina: jest.fn() }));

import { getServiceClient } from '@/lib/supabase/server-service';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { slugChocaConPagina } from '@/lib/organizacion/slugSede';
import { guardarSedesWeb } from '../sedesWeb.server';
import { alternarReservasWeb } from '../ventasSitio.server';
import { moderarResenaTienda } from '../tiendaSitio.server';

type Op = { tabla: string; tipo: 'select' | 'update'; valores?: Record<string, unknown>; filtros: [string, string, unknown][] };
type Resp = { data?: unknown; error?: { code?: string; message?: string } | null };

/** Cliente falso: registra cada operación y responde con `responder(op)`. */
function clienteFalso(responder: (op: Op) => Resp) {
  const ops: Op[] = [];
  const from = (tabla: string) => {
    const op: Op = { tabla, tipo: 'select', filtros: [] };
    const b: Record<string, unknown> = {};
    const filtro = (nombre: string) => (col: string, v: unknown) => {
      op.filtros.push([nombre, col, v]);
      return b;
    };
    Object.assign(b, {
      select: () => b,
      update: (valores: Record<string, unknown>) => {
        op.tipo = 'update';
        op.valores = valores;
        return b;
      },
      eq: filtro('eq'),
      in: filtro('in'),
      is: filtro('is'),
      or: (expr: string) => filtro('or')('', expr),
      maybeSingle: () => b,
      then: (ok: (r: Resp) => unknown, ko?: (e: unknown) => unknown) => {
        ops.push(op);
        return Promise.resolve({ error: null, ...responder(op) }).then(ok, ko);
      },
    });
    return b;
  };
  return { ops, cliente: { from } };
}

const ctx = (rpc: jest.Mock) => ({ organizationId: 120, userId: 'u-1', memberId: 1, supabase: { rpc } as never });

beforeEach(() => {
  (permisosSitio as jest.Mock).mockResolvedValue({ editar: true, publicar: true });
  (slugChocaConPagina as jest.Mock).mockReset().mockResolvedValue(false);
});

describe('guardarSedesWeb', () => {
  const sucursales = [
    { id: 1, is_active: true, slug: 'centro', is_web_published: true, is_web_stock_source: true },
    { id: 2, is_active: true, slug: 'norte', is_web_published: true, is_web_stock_source: true },
  ];

  test('con la RPC aplicada, todo va en una sola llamada con el cliente de la sesión', async () => {
    const { ops, cliente } = clienteFalso(() => ({ data: sucursales }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });
    await guardarSedesWeb(ctx(rpc), { sedes: [{ id: 1, publicada: true, slug: 'centro-1', fuenteStock: true }] });
    expect(rpc).toHaveBeenCalledWith('fn_sitio_web_guardar_sedes', expect.objectContaining({ p_org: 120, p_modo: null }));
    expect(ops.filter((o) => o.tipo === 'update')).toHaveLength(0);
  });

  test('una sede no puede publicarse con la dirección de una página del sitio (la regla de Sucursales)', async () => {
    const { ops, cliente } = clienteFalso(() => ({ data: sucursales }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    (slugChocaConPagina as jest.Mock).mockImplementation(async (_c: unknown, _org: number, slug: string) => slug === 'menu');
    const rpc = jest.fn();
    await expect(guardarSedesWeb(ctx(rpc), { sedes: [{ id: 1, publicada: true, slug: 'menu', fuenteStock: true }] })).rejects.toMatchObject({
      codigo: 'slug_es_pagina',
      status: 409,
    });
    expect(slugChocaConPagina).toHaveBeenCalledWith(expect.anything(), 120, 'menu');
    expect(rpc).not.toHaveBeenCalled();
    expect(ops.filter((o) => o.tipo === 'update')).toHaveLength(0);
  });

  test('lo ya publicado con la misma dirección no se vuelve a comprobar', async () => {
    const { cliente } = clienteFalso(() => ({ data: sucursales }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    const rpc = jest.fn().mockResolvedValue({ data: 1, error: null });
    await guardarSedesWeb(ctx(rpc), { sedes: [{ id: 2, publicada: true, slug: 'norte', fuenteStock: false }] });
    expect(slugChocaConPagina).not.toHaveBeenCalled();
  });

  test('sin la RPC: no anula el slug de una sede que solo cambia de dirección', async () => {
    const { ops, cliente } = clienteFalso(() => ({ data: sucursales }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await guardarSedesWeb(ctx(rpc), { sedes: [{ id: 1, publicada: true, slug: 'centro-1', fuenteStock: true }] });
    const updates = ops.filter((o) => o.tipo === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].valores).toMatchObject({ slug: 'centro-1', is_web_published: true });
  });

  test('sin la RPC: si un update falla a mitad, restaura las sedes ya tocadas', async () => {
    let updates = 0;
    const { ops, cliente } = clienteFalso((op) => {
      if (op.tipo === 'select') return { data: sucursales };
      updates += 1;
      // Intercambio de direcciones: 1 libera «centro» (cruce), 1 → «norte», 2 → «centro» falla.
      const esSede2 = op.filtros.some(([f, c, v]) => f === 'eq' && c === 'id' && v === 2);
      if (esSede2 && op.valores?.slug === 'centro') return { error: { code: '57014', message: 'timeout' } };
      return {};
    });
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '42883' } });
    await expect(
      guardarSedesWeb(ctx(rpc), {
        sedes: [
          { id: 1, publicada: true, slug: 'norte', fuenteStock: true },
          { id: 2, publicada: true, slug: 'centro', fuenteStock: true },
        ],
      }),
    ).rejects.toMatchObject({ code: '57014' });
    expect(updates).toBeGreaterThan(3);
    const restauraciones = ops.filter((o) => o.tipo === 'update' && o.valores && 'is_web_published' in o.valores && !('updated_at' in o.valores));
    expect(restauraciones.map((o) => o.valores?.slug).sort()).toEqual(['centro', 'norte']);
  });

  test('sin permiso no escribe', async () => {
    (permisosSitio as jest.Mock).mockResolvedValue({ editar: false, publicar: false });
    const rpc = jest.fn();
    await expect(guardarSedesWeb(ctx(rpc), { sedes: [] })).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('alternarReservasWeb', () => {
  test('solo actualiza las sedes activas (el mismo conjunto que pinta la tarjeta)', async () => {
    const { ops, cliente } = clienteFalso((op) => (op.tabla === 'branches' ? { data: [{ id: 1 }, { id: 3 }] } : { data: [{ id: 'a' }] }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    await alternarReservasWeb(ctx(jest.fn()), true);
    const sedes = ops.find((o) => o.tabla === 'branches');
    expect(sedes?.filtros).toContainEqual(['or', '', 'is_active.is.null,is_active.eq.true']);
    const update = ops.find((o) => o.tabla === 'restaurant_booking_settings');
    expect(update?.filtros).toContainEqual(['in', 'branch_id', [1, 3]]);
    expect(update?.filtros).toContainEqual(['eq', 'organization_id', 120]);
  });
});

describe('moderarResenaTienda', () => {
  test('sin website.sites.edit no modera', async () => {
    (permisosSitio as jest.Mock).mockResolvedValue({ editar: false, publicar: false });
    const { ops, cliente } = clienteFalso(() => ({}));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    await expect(moderarResenaTienda(ctx(jest.fn()), '00000000-0000-4000-8000-000000000001', 'aprobar')).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(ops).toHaveLength(0);
  });

  test('aprobar escribe el estado filtrando por la organización de la sesión', async () => {
    const { ops, cliente } = clienteFalso(() => ({ data: { id: 'r', status: 'approved' } }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    await moderarResenaTienda(ctx(jest.fn()), '00000000-0000-4000-8000-000000000001', 'aprobar');
    expect(ops[0].valores).toMatchObject({ status: 'approved' });
    expect(ops[0].filtros).toContainEqual(['eq', 'organization_id', 120]);
  });

  test('una reseña de otra organización responde no encontrada', async () => {
    const { cliente } = clienteFalso(() => ({ data: null }));
    (getServiceClient as jest.Mock).mockReturnValue(cliente);
    await expect(moderarResenaTienda(ctx(jest.fn()), '00000000-0000-4000-8000-000000000001', 'rechazar')).rejects.toMatchObject({ codigo: 'no_encontrada' });
  });
});
