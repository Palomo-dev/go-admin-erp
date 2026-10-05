/// <reference types="jest" />
/**
 * CRM ola 3A — rutas de lectura que alimentan las pantallas: feed de
 * actividades de la organización (con `editable` resuelto en el servidor),
 * sus KPI, el resumen de Leads y los permisos de la sesión.
 *
 * Mismo doble de Supabase que la ola 1: la organización sale de la sesión y
 * los señuelos de la 121 nunca aparecen.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db, type Row } from './ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;
let rol = 4;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: rol, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
  isOrgAdminContext: jest.fn((ctx: { roleId: number }) => ctx.roleId === 1 || ctx.roleId === 2),
}));

import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { GET as feedGet } from '../activities/route';
import { GET as kpisGet } from '../activities/resumen/route';
import { GET as resumenLeadsGet } from '../leads/resumen/route';
import { GET as permisosGet } from '../permisos/route';
import { codificarCursor } from '@/lib/services/crm/actividadesOrgService';

const req = (url: string) => new NextRequest(`http://localhost${url}`);
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

/** Semilla de la ola 1 + línea de tiempo con instantes, relaciones y señuelos. */
function semilla(): Record<string, Row[]> {
  const s = seed();
  s.activities = [
    { id: U(601), organization_id: ORG, user_id: YO, activity_type: 'call', notes: 'Pide cotización', occurred_at: '2026-09-23T14:40:00.123456+00:00', related_type: 'customer', related_id: U(10), outcome: 'answered', duration_seconds: 252, metadata: { direction: 'outbound' } },
    { id: U(602), organization_id: ORG, user_id: OTRO_VENDEDOR, activity_type: 'email', notes: 'Cotización', occurred_at: '2026-09-22T21:30:00+00:00', related_type: 'opportunity', related_id: U(1), metadata: {} },
    { id: U(603), organization_id: ORG, user_id: null, activity_type: 'system', notes: 'Oportunidad creada desde lead', occurred_at: '2026-09-22T13:50:00+00:00', related_type: 'customer', related_id: U(11), metadata: {} },
    { id: U(604), organization_id: ORG, user_id: YO, activity_type: 'whatsapp', notes: 'Seguimiento', occurred_at: '2026-09-23T14:40:00.123456+00:00', related_type: 'customer', related_id: U(11), metadata: {} },
    { id: U(609), organization_id: OTRA, user_id: YO, activity_type: 'call', notes: 'señuelo', occurred_at: '2026-09-23T15:00:00+00:00', related_type: 'customer', related_id: U(91), metadata: {} },
  ];
  s.notes = [
    { id: U(701), organization_id: ORG, user_id: OTRO_VENDEDOR, body: '<p>Prefiere factura electrónica</p>', created_at: '2026-09-22T16:02:00+00:00', related_type: 'customer', related_id: U(10), is_pinned: true },
    { id: U(709), organization_id: OTRA, user_id: YO, body: 'señuelo', created_at: '2026-09-23T00:00:00+00:00', related_type: 'customer', related_id: U(91), is_pinned: false },
  ];
  s.tasks = [
    { id: U(801), organization_id: ORG, title: 'Enviar cotización firmada', assigned_to: YO, created_at: '2026-09-22T14:00:00+00:00', status: 'open', priority: 'high', related_to_type: 'opportunity', related_to_id: U(1), customer_id: U(10) },
    { id: U(802), organization_id: ORG, title: 'Tarea de proyecto', assigned_to: YO, created_at: '2026-09-22T14:30:00+00:00', status: 'open', priority: 'med', related_to_type: null, related_to_id: null },
  ];
  s.profiles = [
    { id: YO, first_name: 'Carlos', last_name: 'Ruiz' },
    { id: OTRO_VENDEDOR, first_name: 'Laura', last_name: 'Pérez' },
  ];
  s.pipelines = [{ id: U(40), organization_id: ORG, pipeline_type: 'sales' }];
  s.opportunities.push({ id: U(5), organization_id: ORG, name: 'Calificada', customer_id: U(10), created_at: '2026-09-15T10:00:00Z', 'metadata->>origen': 'lead' });
  return s;
}

const EMPLEADO = ['crm.leads.view', 'crm.opportunities.view', 'crm.opportunities.create'];

beforeEach(() => {
  db = makeDb(semilla());
  permisos = new Set(EMPLEADO);
  rol = 4;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

type Entrada = { id: string; fuente: string; tipo: string; editable: boolean; autor: string | null; cliente: { id: string; nombre: string | null } | null; oportunidad: { nombre: string | null } | null };
const datos = (b: Record<string, unknown>) => b.data as Entrada[];

describe('GET /api/crm/activities — línea de tiempo de la organización', () => {
  it('mezcla actividades, notas y tareas del CRM de la organización de la sesión, de la más reciente a la más antigua', async () => {
    const { status, body } = await json(await feedGet(req('/api/crm/activities')));
    expect(status).toBe(200);
    const ids = datos(body).map((e) => e.id);
    expect(ids).toEqual([U(604), U(601), U(602), U(701), U(801), U(603)]);
    expect(ids).not.toContain(U(609));
    expect(ids).not.toContain(U(709));
    expect(ids).not.toContain(U(802)); // tarea del PM sin relación CRM
    expect(body.total).toBe(6);
    expect(body.next_cursor).toBeNull();
  });

  it('editable lo decide el servidor: lo propio sí, lo ajeno no (Empleado), sistema y tareas nunca', async () => {
    const e = Object.fromEntries(datos((await json(await feedGet(req('/api/crm/activities')))).body).map((x) => [x.id, x.editable]));
    expect(e[U(601)]).toBe(true);
    expect(e[U(602)]).toBe(false);
    expect(e[U(701)]).toBe(false);
    expect(e[U(603)]).toBe(false);
    expect(e[U(801)]).toBe(false);
  });

  it('con crm.activities.edit_any lo ajeno también es editable; lo de sistema sigue sin serlo', async () => {
    permisos.add('crm.activities.edit_any');
    const e = Object.fromEntries(datos((await json(await feedGet(req('/api/crm/activities')))).body).map((x) => [x.id, x.editable]));
    expect(e[U(602)]).toBe(true);
    expect(e[U(701)]).toBe(true);
    expect(e[U(603)]).toBe(false);
  });

  it('reunión de calendario no ofrece el menú genérico; las manuales conservan edición', async () => {
    db.t.activities.push({ id: U(605), organization_id: ORG, user_id: YO, activity_type: 'meeting', occurred_at: '2026-09-23T15:00:00Z', related_type: 'customer', related_id: U(10), metadata: { event_id: U(606) } });
    db.t.activities.push({ id: U(607), organization_id: ORG, user_id: YO, activity_type: 'meeting', occurred_at: '2026-09-23T14:55:00Z', related_type: 'customer', related_id: U(10), metadata: {} });
    for (const permiso of [false, true]) {
      if (permiso) permisos.add('crm.activities.edit_any');
      const e = Object.fromEntries(datos((await json(await feedGet(req('/api/crm/activities')))).body).map(x => [x.id, x.editable]));
      expect(e[U(605)]).toBe(false);
      expect(e[U(607)]).toBe(true);
    }
  });
  it('llamadas vinculadas usan su ficha; llamadas manuales sin registro mantienen edición', async () => {
    db.t.activities.push({ id: U(605), organization_id: ORG, user_id: YO, activity_type: 'call', occurred_at: '2026-09-23T15:00:00Z', related_type: 'customer', related_id: U(10), call_id: U(606), metadata: {} });
    db.t.activities.push({ id: U(607), organization_id: ORG, user_id: YO, activity_type: 'ai_call', occurred_at: '2026-09-23T14:55:00Z', related_type: 'customer', related_id: U(10), metadata: { call_id: U(606) } });
    db.t.activities.push({ id: U(608), organization_id: ORG, user_id: YO, activity_type: 'call', occurred_at: '2026-09-23T14:50:00Z', related_type: 'customer', related_id: U(10), call_id: null, metadata: {} });
    for (const permiso of [false, true]) {
      if (permiso) permisos.add('crm.activities.edit_any');
      const e = Object.fromEntries(datos((await json(await feedGet(req('/api/crm/activities')))).body).map(x => [x.id, x.editable]));
      expect(e[U(605)]).toBe(false);
      expect(e[U(607)]).toBe(false);
      expect(e[U(608)]).toBe(true);
    }
  });
  it('hidrata autor, cliente y oportunidad (la oportunidad trae a su cliente)', async () => {
    const [primera, , correo] = datos((await json(await feedGet(req('/api/crm/activities')))).body);
    expect(primera.autor).toBe('Carlos Ruiz');
    expect(correo.oportunidad?.nombre).toBe('Mía');
    expect(correo.cliente?.nombre).toBe('Lead uno');
  });

  it('cursor estable con el instante crudo (microsegundos y empate por id): sin repetir ni saltar', async () => {
    const p1 = await json(await feedGet(req('/api/crm/activities?limit=2')));
    expect(datos(p1.body).map((e) => e.id)).toEqual([U(604), U(601)]);
    expect(p1.body.total).toBe(6);
    const p2 = await json(await feedGet(req(`/api/crm/activities?limit=2&cursor=${p1.body.next_cursor}`)));
    expect(datos(p2.body).map((e) => e.id)).toEqual([U(602), U(701)]);
    expect(p2.body.total).toBeNull();
    const p3 = await json(await feedGet(req(`/api/crm/activities?limit=2&cursor=${p2.body.next_cursor}`)));
    expect(datos(p3.body).map((e) => e.id)).toEqual([U(801), U(603)]);
    expect(p3.body.next_cursor).toBeNull();
  });

  it('filtros: tipo nota suma la tabla notes; cliente incluye lo de sus oportunidades; responsable', async () => {
    const notas = datos((await json(await feedGet(req('/api/crm/activities?types=note')))).body);
    expect(notas.map((e) => e.fuente)).toEqual(['note']);
    const cliente = datos((await json(await feedGet(req(`/api/crm/activities?customer_id=${U(10)}`)))).body).map((e) => e.id);
    expect(cliente.sort()).toEqual([U(601), U(602), U(701), U(801)].sort());
    const mias = datos((await json(await feedGet(req(`/api/crm/activities?user_id=${YO}&types=call,whatsapp`)))).body).map((e) => e.id);
    expect(mias).toEqual([U(604), U(601)]);
  });

  it('400 con cursor o uuid inválidos; 401 sin sesión', async () => {
    expect((await feedGet(req('/api/crm/activities?cursor=nope'))).status).toBe(400);
    expect((await feedGet(req(`/api/crm/activities?cursor=${codificarCursor('no-es-fecha', U(1))}`))).status).toBe(400);
    expect((await feedGet(req('/api/crm/activities?customer_id=1;drop'))).status).toBe(400);
    (getServerOrgContext as jest.Mock).mockRejectedValueOnce(new RealOrgContextError('No autenticado', 401));
    expect((await feedGet(req('/api/crm/activities'))).status).toBe(401);
  });
});

describe('GET /api/crm/activities/resumen — 7 KPI', () => {
  it('cuenta por tipo en la organización de la sesión (notas de las dos tablas, tareas abiertas del CRM)', async () => {
    const { status, body } = await json(await kpisGet(req('/api/crm/activities/resumen')));
    expect(status).toBe(200);
    expect(body.data).toEqual({ total: 5, llamadas: 1, correos: 1, whatsapp: 1, reuniones: 0, notas: 1, tareasAbiertas: 1 });
  });
});

describe('GET /api/crm/leads/resumen — KPI de Leads y sin colocar', () => {
  const q = '?mes_desde=2026-09-01T05:00:00.000Z&siete_desde=2026-09-24T05:00:00.000Z';

  it('cuenta leads con origen, sin descartar, de la sesión; calificados = oportunidades con origen lead', async () => {
    const { status, body } = await json(await resumenLeadsGet(req(`/api/crm/leads/resumen${q}`)));
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ total: 2, sin_responsable: 0, calificados_mes: 1, hay_embudo_ventas: true, sin_colocar: 0 });
  });

  it('sin pipeline de ventas, los leads del formulario web quedan «sin colocar»', async () => {
    db.t.pipelines = [];
    const { body } = await json(await resumenLeadsGet(req(`/api/crm/leads/resumen${q}`)));
    expect(body.data).toMatchObject({ hay_embudo_ventas: false, sin_colocar: 1 });
  });

  it('403 sin crm.leads.view; 400 sin los instantes', async () => {
    expect((await resumenLeadsGet(req('/api/crm/leads/resumen'))).status).toBe(400);
    permisos.delete('crm.leads.view');
    expect((await resumenLeadsGet(req(`/api/crm/leads/resumen${q}`))).status).toBe(403);
  });
});

describe('GET /api/crm/permisos — resueltos en el servidor', () => {
  it('Empleado: los códigos de get_user_permission_codes para el usuario de la sesión', async () => {
    db.rpc.get_user_permission_codes = { data: ['crm.leads.view', 'crm.opportunities.create'] };
    const { status, body } = await json(await permisosGet(req('/api/crm/permisos')));
    expect(status).toBe(200);
    const d = body.data as { usuario_id: string; permisos: Record<string, boolean> };
    expect(d.usuario_id).toBe(YO);
    expect(d.permisos['crm.leads.view']).toBe(true);
    expect(d.permisos['crm.leads.assign']).toBe(false);
    expect(db.rpcCalls[0]).toEqual({ fn: 'get_user_permission_codes', args: { p_user_id: YO, p_organization_id: ORG } });
  });

  it('administrador de la organización (rol por id): todo, sin consultar', async () => {
    rol = 2;
    const d = (await json(await permisosGet(req('/api/crm/permisos')))).body.data as { permisos: Record<string, boolean> };
    expect(Object.values(d.permisos).every(Boolean)).toBe(true);
    expect(db.rpcCalls).toEqual([]);
  });
});
