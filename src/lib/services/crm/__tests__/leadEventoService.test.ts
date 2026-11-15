/**
 * `contextoEventoLead` (GET /api/crm/leads/[id]/evento): la sede sale de la
 * metadata leída en el servidor y toda consulta filtra por la organización de
 * la sesión.
 */
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  hasOrgAdminOrPermission: jest.fn(async () => true),
}));

import { contextoEventoLead } from '../leadEventoService';
import { CrmHttpError, type CrmSesion } from '../crmRouteSupport';

type Filtro = [string, string, unknown];
interface Consulta {
  tabla: string;
  filtros: Filtro[];
}

function falsoSupabase(respuestas: Record<string, { data: unknown; count?: number; error?: unknown }>) {
  const consultas: Consulta[] = [];
  const from = (tabla: string) => {
    const c: Consulta = { tabla, filtros: [] };
    consultas.push(c);
    const r = respuestas[tabla] ?? { data: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) b[m] = () => b;
    b.eq = (col: string, v: unknown) => (c.filtros.push(['eq', col, v]), b);
    b.in = (col: string, v: unknown) => (c.filtros.push(['in', col, v]), b);
    b.maybeSingle = async () => ({ data: r.data, error: r.error ?? null });
    b.then = (ok: (x: unknown) => unknown) => Promise.resolve({ data: r.data, count: r.count ?? null, error: r.error ?? null }).then(ok);
    return b;
  };
  return { supabase: { from } as unknown as CrmSesion['supabase'], consultas };
}

const ID = '00000000-0000-4000-8000-000000000010';
const sesion = (supabase: CrmSesion['supabase']): CrmSesion => ({ userId: 'u1', organizationId: 120, roleId: 2, isSuperAdmin: false, supabase });

test('sede de la última solicitud e inasistencias, todo filtrado por la organización', async () => {
  const { supabase, consultas } = falsoSupabase({
    customers: { data: { id: ID, metadata_lead: { capturas: [{ form: 'private_events', branch_id: 115, details: { guests: 25 } }] } } },
    restaurant_reservations: { data: [{ reservation_date: '2026-10-03', branch_id: 115 }], count: 2 },
    branches: { data: [{ id: 115, name: 'Sede Norte' }] },
  });
  const r = await contextoEventoLead(sesion(supabase), ID);
  expect(r).toEqual({ sede: { id: 115, nombre: 'Sede Norte' }, inasistencias: { total: 2, ultima: { fecha: '2026-10-03', sede: 'Sede Norte' } } });
  for (const c of consultas) expect(c.filtros).toContainEqual(['eq', 'organization_id', 120]);
  expect(consultas.find((c) => c.tabla === 'restaurant_reservations')?.filtros).toEqual(
    expect.arrayContaining([['eq', 'customer_id', ID], ['eq', 'status', 'no_show']]),
  );
});

test('lead sin evento y sin inasistencias: no consulta sedes', async () => {
  const { supabase, consultas } = falsoSupabase({
    customers: { data: { id: ID, metadata_lead: null } },
    restaurant_reservations: { data: [], count: 0 },
  });
  expect(await contextoEventoLead(sesion(supabase), ID)).toEqual({ sede: null, inasistencias: { total: 0, ultima: null } });
  expect(consultas.some((c) => c.tabla === 'branches')).toBe(false);
});

test('sede que ya no es de la organización: null (no se inventa nombre)', async () => {
  const { supabase } = falsoSupabase({
    customers: { data: { id: ID, metadata_lead: { capturas: [{ form: 'private_events', branch_id: 999 }] } } },
    restaurant_reservations: { data: [], count: 0 },
    branches: { data: [] },
  });
  expect((await contextoEventoLead(sesion(supabase), ID)).sede).toBeNull();
});

test('cliente de otra organización: 404', async () => {
  const { supabase } = falsoSupabase({ customers: { data: null } });
  await expect(contextoEventoLead(sesion(supabase), ID)).rejects.toBeInstanceOf(CrmHttpError);
  await expect(contextoEventoLead(sesion(supabase), ID)).rejects.toMatchObject({ status: 404 });
});
