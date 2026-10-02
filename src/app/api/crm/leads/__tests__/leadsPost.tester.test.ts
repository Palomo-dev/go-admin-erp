/// <reference types="jest" />
/**
 * F1 (cierre) — TESTER: contrato de `POST /api/crm/leads` con asignación
 * automática, ejecutando el manejador real sobre el doble de Supabase de
 * `leadAssignmentFake` (filtros y escrituras de verdad, señuelos de la 121).
 *
 *  - Regla 5: `organization_id` ajeno en el body o en la query → 403 y NADA
 *    se escribe (ni cliente ni lead).
 *  - 201 con `assignment` documentado (`assigned` | `explicit` | `skipped` |
 *    `unassigned`) y `data.owner_id` coherente.
 *  - `salesperson_id` explícito ajeno sigue siendo 400 (no se «corrige»).
 *
 * CRM ola 1 (D2, 2026-09-29): el lead ES el cliente. `data` es la ficha
 * (`lifecycle_stage='lead'`, `lead_source`, `owner_id`) y NO se escribe
 * ninguna oportunidad.
 */
const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import {
  fakeSupabase, makeDb, seed, type FakeDb,
  ORG, OTHER, U, TEAM, VENDEDOR_A, VENDEDOR_B, VENDEDOR_121,
} from '@/lib/services/crm/__tests__/leadAssignmentFake';

let db: FakeDb;

jest.mock('@/lib/services/avisos/despacho.server', () => ({
  programarDespachoAvisos: jest.fn(),
}));

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: U(200), supabase: fakeSupabase(db) })),
  // La ruta exige crm.leads.create en el servidor; aquí se concede (el 403 se prueba aparte).
  hasOrgAdminOrPermission: jest.fn(async () => true),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const peticion = (body: unknown, url = 'http://localhost/api/crm/leads') =>
  new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  name: 'Lead por API',
  new_customer: { first_name: 'Ana', email: `ana-${Math.random()}@example.com` },
  ...extra,
});
const escrituras = () => db.writes.filter((w) => w.op === 'insert').map((w) => w.table);

beforeEach(() => {
  db = makeDb(seed());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/crm/leads · regla 5', () => {
  it.each([
    ['organization_id', { organization_id: OTHER }],
    ['organizationId', { organizationId: String(OTHER) }],
    ['orgId', { orgId: OTHER }],
    ['org_id', { org_id: OTHER }],
  ])('%s ajeno en el body → 403 FOREIGN_ORGANIZATION y sin escrituras', async (_k, extra) => {
    const res = await POST(peticion(cuerpo(extra)));
    expect(res.status).toBe(403);
    expect(escrituras()).toEqual([]);
  });

  it('organization_id ajeno en la query → 403 aunque el body esté limpio', async () => {
    const res = await POST(peticion(cuerpo(), `http://localhost/api/crm/leads?organization_id=${OTHER}`));
    expect(res.status).toBe(403);
    expect(escrituras()).toEqual([]);
  });

  it('la organización de la sesión en el body no es ataque: 201', async () => {
    const res = await POST(peticion(cuerpo({ organization_id: ORG })));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/crm/leads · respuesta 201 con assignment', () => {
  it('sin salesperson_id → assigned por round_robin, data.salesperson_id = vendedor', async () => {
    const res = await POST(peticion(cuerpo()));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      success: true,
      created_customer_id: expect.any(String),
      assignment: { status: 'assigned', user_id: VENDEDOR_A, strategy: 'round_robin', team_id: TEAM, reason: expect.any(String) },
    });
    expect(json.data.owner_id).toBe(VENDEDOR_A);
    expect(json.data.lifecycle_stage).toBe('lead');
    expect(json.data.lead_source).toBe('manual');
    expect(db.writes.filter((w) => w.table === 'opportunities')).toEqual([]); // D2: ninguna oportunidad 'lead'
  });

  it('salesperson_id explícito propio → explicit; ajeno → 400 sin lead ni cliente huérfano', async () => {
    const ok = await POST(peticion(cuerpo({ salesperson_id: VENDEDOR_B })));
    expect(ok.status).toBe(201);
    expect((await ok.json()).assignment).toEqual({ status: 'explicit', user_id: VENDEDOR_B });

    const antes = db.tables.customers.length;
    const mal = await POST(peticion(cuerpo({ salesperson_id: VENDEDOR_121 })));
    expect(mal.status).toBe(400);
    expect((await mal.json()).error).toMatch(/no es miembro/);
    expect(db.writes.filter((w) => w.table === 'opportunities')).toEqual([]);
    // Ola 1: el responsable se valida ANTES de crear la ficha → sin cliente huérfano.
    expect(db.tables.customers.length).toBe(antes);
  });

  it('sin equipos → 201, assignment.unassigned con motivo, owner_id null', async () => {
    db.tables.sales_teams = db.tables.sales_teams.filter((t) => t.organization_id !== ORG);
    const res = await POST(peticion(cuerpo()));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.assignment).toEqual({ status: 'unassigned', reason: expect.stringMatching(/equipo/i) });
    expect(json.data.owner_id).toBeNull();
  });

  it('asignación desactivada → skipped', async () => {
    db.tables.organization_settings.push({ id: U(500), organization_id: ORG, key: 'crm_lead_assignment', settings: { enabled: false } });
    const json = await (await POST(peticion(cuerpo()))).json();
    expect(json.assignment).toEqual({ status: 'skipped', reason: expect.any(String) });
  });
});

describe('POST /api/crm/leads · permiso crm.leads.create', () => {
  it('sin el permiso → 403 y NADA se escribe (ni cliente ni lead)', async () => {
    const { hasOrgAdminOrPermission } = jest.requireMock('@/lib/utils/orgContext') as { hasOrgAdminOrPermission: jest.Mock };
    hasOrgAdminOrPermission.mockResolvedValueOnce(false);
    const res = await POST(peticion(cuerpo()));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
    expect(hasOrgAdminOrPermission).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: ORG }), 'crm.leads.create');
    expect(escrituras()).toEqual([]);
  });
});
