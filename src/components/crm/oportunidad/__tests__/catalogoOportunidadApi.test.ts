/// <reference types="jest" />
/**
 * Catálogo de «Agregar a la oportunidad» por el servidor (ola 3B, guardarraíl
 * 36): el navegador solo llama `GET /api/crm/catalogo-oportunidad` sin
 * organización; el servidor filtra por la organización de la sesión y valida
 * cada parámetro.
 */
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  hasOrgAdminOrPermission: jest.fn(async () => true),
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from '@/lib/services/crm/crmRouteSupport';
import { idsDesdeQuery, resolverCatalogo } from '@/lib/services/crm/catalogoOportunidad.server';
import { buscarCatalogo, contarCatalogo, stockPorProducto, totalHospedaje } from '../lineas/catalogoOportunidad';

type Llamada = { tabla: string; ops: [string, unknown[]][] };

/** Cliente falso: registra cada cadena de PostgREST y responde `filas`. */
function clienteFalso(filas: Record<string, unknown>) {
  const llamadas: Llamada[] = [];
  const cliente = {
    from(tabla: string) {
      const llamada: Llamada = { tabla, ops: [] };
      llamadas.push(llamada);
      const cadena: Record<string, unknown> = {};
      const registrar = (nombre: string) => (...args: unknown[]) => {
        llamada.ops.push([nombre, args]);
        return cadena;
      };
      for (const n of ['select', 'eq', 'in', 'limit', 'order', 'is', 'or', 'not', 'gte', 'lt', 'gt', 'neq']) cadena[n] = registrar(n);
      cadena.maybeSingle = async () => ({ data: filas[tabla] ?? null, error: null });
      cadena.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: filas[tabla] ?? [], error: null }).then(ok);
      return cadena;
    },
    rpc: jest.fn(async () => ({ data: [], error: null })),
  };
  return { cliente: cliente as unknown as SupabaseClient, llamadas, rpc: cliente.rpc };
}

const ORG = 120;
const ctxDe = (supabase: SupabaseClient) => ({ organizationId: ORG, supabase });
const sp = (q: Record<string, string>) => new URLSearchParams(q);
const TIPO = '7b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';

describe('servidor: resolverCatalogo', () => {
  it('rechaza una operación desconocida o parámetros mal formados con 400', async () => {
    const { cliente } = clienteFalso({});
    await expect(resolverCatalogo(ctxDe(cliente), sp({ op: 'borrar' }))).rejects.toBeInstanceOf(CrmHttpError);
    await expect(resolverCatalogo(ctxDe(cliente), sp({ op: 'buscar', pestana: 'otra' }))).rejects.toMatchObject({ status: 400 });
    await expect(resolverCatalogo(ctxDe(cliente), sp({ op: 'planes-tarifa', space_type_id: '1 or 1=1' }))).rejects.toMatchObject({ status: 400 });
    await expect(resolverCatalogo(ctxDe(cliente), sp({ op: 'disponibilidad', entrada: 'ayer', salida: '2026-12-02', space_type_id: TIPO, branch_id: '3' }))).rejects.toMatchObject({ status: 400 });
  });

  it('idsDesdeQuery: enteros positivos únicos; nada raro', () => {
    expect(idsDesdeQuery('3,3, 7')).toEqual([3, 7]);
    expect(idsDesdeQuery('')).toEqual([]);
    expect(() => idsDesdeQuery('1,-2')).toThrow(CrmHttpError);
    expect(() => idsDesdeQuery('1,abc')).toThrow(CrmHttpError);
  });

  it('el stock se acota a las sucursales de la organización de la sesión, aunque la query traiga otra', async () => {
    const { cliente, llamadas } = clienteFalso({ stock_levels: [{ product_id: 5, branch_id: 1, qty_on_hand: '2' }, { product_id: 5, branch_id: 1, qty_on_hand: 3 }] });
    const data = await resolverCatalogo(ctxDe(cliente), sp({ op: 'stock', ids: '5', org: '999', organization_id: '999' }));
    expect(data).toEqual([{ product_id: 5, sucursales: [{ branch_id: 1, cantidad: 5 }] }]);
    expect(llamadas[0].ops).toContainEqual(['eq', ['sucursal.organization_id', ORG]]);
    expect(JSON.stringify(llamadas)).not.toContain('999');
  });

  it('padre de variante y plan de membresía filtran por organization_id', async () => {
    const { cliente, llamadas } = clienteFalso({ products: { padre: { id: 1, name: 'Camisa', sku: null } }, membership_plans: null });
    expect(await resolverCatalogo(ctxDe(cliente), sp({ op: 'padre', product_id: '9' }))).toEqual({ id: 1, nombre: 'Camisa', sku: null });
    expect(await resolverCatalogo(ctxDe(cliente), sp({ op: 'membresia', product_id: '9' }))).toBeNull();
    for (const l of llamadas) expect(l.ops).toContainEqual(['eq', ['organization_id', ORG]]);
  });

  it('disponibilidad: 404 si la sucursal no es de la organización, sin llamar a fn_availability', async () => {
    const { cliente, rpc } = clienteFalso({ branches: null, space_types: { id: TIPO } });
    await expect(resolverCatalogo(ctxDe(cliente), sp({ op: 'disponibilidad', entrada: '2026-12-01', salida: '2026-12-03', space_type_id: TIPO, branch_id: '3' }))).rejects.toMatchObject({ status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('total del hospedaje: la RPC recibe la organización de la sesión', async () => {
    const { cliente, rpc } = clienteFalso({ space_types: { id: TIPO } });
    await resolverCatalogo(ctxDe(cliente), sp({ op: 'total-hospedaje', space_type_id: TIPO, entrada: '2026-12-01', salida: '2026-12-03', plan: '' }));
    expect(rpc).toHaveBeenCalledWith('calculate_reservation_total', expect.objectContaining({ p_organization_id: ORG, p_plan: null }));
  });
});

describe('navegador: catalogoOportunidad.ts solo llama a la ruta', () => {
  const fetchOriginal = global.fetch;
  let urls: string[];
  let inits: RequestInit[];
  const responder = (data: unknown) => {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(url));
      inits.push(init ?? {});
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    }) as typeof fetch;
  };
  beforeEach(() => {
    urls = [];
    inits = [];
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  it('no envía la organización y pasa la señal', async () => {
    responder({ productos: 2, servicios: 1 });
    const c = new AbortController();
    expect(await contarCatalogo(ORG, c.signal)).toEqual({ productos: 2, servicios: 1 });
    expect(urls[0]).toBe('/api/crm/catalogo-oportunidad?op=contar');
    expect(inits[0].signal).toBe(c.signal);
    responder([]);
    await buscarCatalogo(ORG, { texto: 'a&b', pestana: 'servicios' });
    expect(urls[1]).not.toMatch(/org/);
    expect(new URL(urls[1], 'http://x').searchParams.get('texto')).toBe('a&b');
  });

  it('stockPorProducto rehace el Map y no llama si no hay ids', async () => {
    responder([{ product_id: 5, sucursales: [{ branch_id: 1, cantidad: 4 }] }]);
    expect(await stockPorProducto([])).toEqual(new Map());
    expect(urls).toHaveLength(0);
    const m = await stockPorProducto([5, 5]);
    expect(m.get(5)).toEqual([{ branch_id: 1, cantidad: 4 }]);
    expect(urls[0]).toContain('ids=5');
  });

  it('totalHospedaje sin plan no envía el parámetro', async () => {
    responder(null);
    expect(await totalHospedaje(ORG, TIPO, '2026-12-01', '2026-12-03', null)).toBeNull();
    expect(urls[0]).not.toContain('plan=');
  });
});
