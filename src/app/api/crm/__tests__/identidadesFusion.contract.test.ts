/// <reference types="jest" />
/**
 * Contrato de las lecturas de Identidades (Figma CRM 1436:843123 «Comparar y
 * fusionar», 1436:843665 «Historial y deshacer» y la pestaña «Identidades por
 * canal»): la organización sale de la sesión, una ajena da 403, los permisos
 * se resuelven en el servidor y ninguna de estas rutas escribe.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

const ORG = 120;
const OTRA = 121;
const YO = '00000000-0000-4000-8000-000000000001';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Llamada = { tabla: string; select: string; filtros: [string, string, unknown][]; opciones?: { count?: string; head?: boolean } };
let llamadas: Llamada[];
let escrituras: string[];
let respuestas: (l: Llamada) => { data?: unknown; count?: number | null; error?: unknown };
let permisos: Set<string>;
let rolId = 4;

function fake() {
  return {
    rpc: jest.fn(async () => ({ data: null, error: null })),
    from(tabla: string) {
      const l: Llamada = { tabla, select: '', filtros: [] };
      const b: Record<string, unknown> = {
        select: (s: string, o?: Llamada['opciones']) => ((l.select = s), (l.opciones = o), b),
        eq: (c: string, v: unknown) => (l.filtros.push(['eq', c, v]), b),
        neq: (c: string, v: unknown) => (l.filtros.push(['neq', c, v]), b),
        in: (c: string, v: unknown) => (l.filtros.push(['in', c, v]), b),
        gte: (c: string, v: unknown) => (l.filtros.push(['gte', c, v]), b),
        or: (e: string) => (l.filtros.push(['or', '', e]), b),
        order: () => b,
        limit: () => b,
        insert: () => (escrituras.push(tabla), b),
        update: () => (escrituras.push(tabla), b),
        delete: () => (escrituras.push(tabla), b),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          llamadas.push(l);
          const r = respuestas(l);
          return Promise.resolve({ data: r.data ?? null, count: r.count ?? null, error: r.error ?? null }).then(ok, ko);
        },
      };
      return b;
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: rolId, roleName: 'x', isSuperAdmin: false, supabase: fake() })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
}));

import { NextRequest } from 'next/server';
import { GET as compararGet } from '../customer-merges/compare/route';
import { GET as historialGet } from '../customer-merges/route';
import { GET as identidadesGet } from '../identities/route';

const req = (url: string) => new NextRequest(`http://localhost${url}`);
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const filtro = (l: Llamada, c: string) => l.filtros.find((f) => f[1] === c)?.[2];

beforeEach(() => {
  llamadas = [];
  escrituras = [];
  permisos = new Set(['crm.customers.view']);
  rolId = 4;
  respuestas = () => ({ data: [], count: 0 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const cliente = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  full_name: null,
  first_name: null,
  last_name: null,
  email: null,
  phone: null,
  company_name: null,
  trade_name: null,
  identification_type: 'NIT',
  identification_number: '900555123',
  address: null,
  city: null,
  created_at: '2026-01-01T00:00:00Z',
  customer_type: 'company',
  lead_source: null,
  status: 'active',
  ...extra,
});

describe('GET /api/crm/customer-merges/compare', () => {
  it('organización de la sesión en cada consulta, conteos de lo que se mueve y de lo que se queda, sin escribir', async () => {
    respuestas = (l) => {
      if (l.tabla === 'customers') return { data: [cliente(U(11), { company_name: 'B' }), cliente(U(10), { company_name: 'A' })] };
      if (l.tabla === 'customer_channel_identities' && !l.opciones?.head)
        return { data: [{ customer_id: U(11), identity_value: '+573105550142', channel: { type: 'whatsapp' } }, { customer_id: U(11), identity_value: 'sesion', channel: { type: 'website' } }] };
      if (l.tabla === 'invoice_sales' && filtro(l, 'customer_id') === U(11)) return { count: l.filtros.some((f) => f[0] === 'or') ? 1 : 3 };
      if (l.tabla === 'sales' && filtro(l, 'customer_id') === U(11)) return { count: 7 };
      return { count: 0 };
    };
    const r = await json(await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)},${U(11)}`)));
    expect(r.status).toBe(200);
    expect(llamadas.every((l) => filtro(l, 'organization_id') === ORG)).toBe(true);
    const d = r.body.data as { clientes: { id: string; whatsapp: string[]; conteos: Record<string, number> }[]; puedeFusionar: boolean };
    // El orden es el de la URL (la pantalla propone el primero como principal).
    expect(d.clientes.map((c) => c.id)).toEqual([U(10), U(11)]);
    expect(d.clientes[1].whatsapp).toEqual(['+573105550142']);
    expect(d.clientes[1].conteos).toMatchObject({ facturas: 3, facturasEmitidas: 1, ventas: 7 });
    expect(d.puedeFusionar).toBe(false);
    expect(escrituras).toEqual([]);
  });

  it('un id que no es de la organización → 404; ids repetidos o uno solo → 400', async () => {
    respuestas = (l) => (l.tabla === 'customers' ? { data: [cliente(U(10))] } : { count: 0 });
    expect((await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)},${U(99)}`))).status).toBe(404);
    expect((await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)},${U(10)}`))).status).toBe(400);
    expect((await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)}`))).status).toBe(400);
  });

  it('organización ajena en la URL → 403; sin crm.customers.view → 403', async () => {
    expect((await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)},${U(11)}&organization_id=${OTRA}`))).status).toBe(403);
    permisos.clear();
    expect((await compararGet(req(`/api/crm/customer-merges/compare?ids=${U(10)},${U(11)}`))).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });
});

describe('GET /api/crm/customer-merges (historial)', () => {
  const fila = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    primary_customer_id: U(10),
    secondary_customer_id: U(11),
    merged_by: YO,
    merged_at: new Date().toISOString(),
    undone_at: null,
    reason: 'document',
    depends_on: [],
    p_full_name: null,
    p_company_name: 'Ferretería A',
    s_full_name: null,
    s_company_name: 'Ferreteria a',
    t0: 'conversations',
    n0: [U(1)],
    t2: 'calls',
    n2: [U(2), U(3)],
    ...extra,
  });

  it('exige crm.customers.merge', async () => {
    expect((await historialGet(req('/api/crm/customer-merges'))).status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  it('pide solo rutas pequeñas del snapshot, de los últimos 90 días y de la organización; estado de deshacer por fila', async () => {
    permisos.add('crm.customers.merge');
    rolId = 2;
    const viejo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    respuestas = (l) =>
      l.tabla === 'customer_merges'
        ? { data: [fila(U(71), { depends_on: [U(72)] }), fila(U(72)), fila(U(73), { merged_at: viejo }), fila(U(74), { undone_at: viejo, reason: 'raro' })] }
        : { data: [{ id: YO, first_name: 'Ana', last_name: 'Gómez', email: null }] };
    const r = await json(await historialGet(req('/api/crm/customer-merges')));
    expect(r.status).toBe(200);
    const consulta = llamadas.find((l) => l.tabla === 'customer_merges')!;
    expect(filtro(consulta, 'organization_id')).toBe(ORG);
    expect(consulta.filtros.some((f) => f[0] === 'gte' && f[1] === 'merged_at')).toBe(true);
    // Nunca las copias completas de las filas movidas.
    expect(consulta.select).not.toMatch(/(^|,\s*)moved_rows(\s*,|$)/);
    expect(consulta.select).not.toMatch(/->rows/);
    const d = r.body.data as { fusiones: { id: string; estado: string; motivo: string; quien: string; movidos: { tabla: string; n: number }[]; secundario: { nombre: string } }[] };
    expect(d.fusiones.map((f) => [f.id, f.estado])).toEqual([
      [U(71), 'deshacible'],
      [U(72), 'dependiente'],
      [U(73), 'vencida'],
      [U(74), 'deshecha'],
    ]);
    expect(d.fusiones[0]).toMatchObject({ motivo: 'document', quien: 'Ana Gómez', secundario: { nombre: 'Ferreteria a' }, movidos: [{ tabla: 'conversations', n: 1 }, { tabla: 'calls', n: 2 }] });
    expect(d.fusiones[3].motivo).toBe('manual');
    expect(escrituras).toEqual([]);
  });

  it('quien no es administrador ve «Solo un administrador» en lugar del botón', async () => {
    permisos.add('crm.customers.merge');
    respuestas = (l) => (l.tabla === 'customer_merges' ? { data: [fila(U(71))] } : { data: [] });
    const r = await json(await historialGet(req('/api/crm/customer-merges')));
    expect((r.body.data as { fusiones: { estado: string }[]; puedeDeshacer: boolean }).fusiones[0].estado).toBe('soloAdministrador');
    expect((r.body.data as { puedeDeshacer: boolean }).puedeDeshacer).toBe(false);
  });
});

describe('GET /api/crm/identities', () => {
  it('solo lectura, con la organización de la sesión y filtro de canal', async () => {
    respuestas = () => ({
      data: [{ id: U(1), identity_type: 'widget_identified', identity_value: 'v1', verified: true, last_seen_at: null, created_at: '2026-01-01', customer: { id: U(10), full_name: ' ', company_name: 'Óptica' }, channel: [{ id: U(5), name: 'Web', type: 'website' }] }],
    });
    const r = await json(await identidadesGet(req('/api/crm/identities?canal=website&q=v1')));
    expect(r.status).toBe(200);
    const l = llamadas[0];
    expect(l.tabla).toBe('customer_channel_identities');
    expect(filtro(l, 'organization_id')).toBe(ORG);
    expect(filtro(l, 'channel.type')).toBe('website');
    const d = r.body.data as { identidades: { cliente: { nombre: string }; canal: { tipo: string } }[] };
    expect(d.identidades[0].cliente.nombre).toBe('Óptica');
    expect(d.identidades[0].canal.tipo).toBe('website');
    expect(escrituras).toEqual([]);
  });

  it('canal inválido → 400; sin permiso → 403', async () => {
    expect((await identidadesGet(req('/api/crm/identities?canal=web%27site'))).status).toBe(400);
    permisos.clear();
    expect((await identidadesGet(req('/api/crm/identities'))).status).toBe(403);
  });
});
