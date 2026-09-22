/// <reference types="jest" />
/**
 * F1 (cierre) — asignación automática al crear un lead.
 *
 * `createLeadWithCustomer` debe invocar `assignmentService` (una sola
 * implementación, regla dura 7) cuando el cuerpo no trae `salesperson_id`:
 * con equipo round-robin se asigna en orden y saltando inactivos; sin equipo o
 * sin miembros el lead se crea SIN asignar (la asignación nunca tumba el alta);
 * `salesperson_id` explícito se respeta sin consultar equipos; y un equipo de
 * otra organización (señuelo 121) jamás recibe el lead.
 *
 * La configuración vive en `organization_settings` (clave `crm_lead_assignment`):
 * sin fila → round_robin sobre el primer equipo activo.
 */
import { createLeadWithCustomer, type LeadCreateContext } from '@/lib/services/crm/leadCreateService';
import { autoAssignLead } from '@/lib/services/crm/leadAutoAssign';
import { LEAD_ASSIGNMENT_SETTINGS_KEY, parseLeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';
import {
  fakeSupabase, makeDb, seed, type FakeDb,
  ORG, OTHER, U, TEAM, TEAM_OTHER, VENDEDOR_A, VENDEDOR_B, VENDEDOR_INACTIVO, VENDEDOR_121,
} from './leadAssignmentFake';

let db: FakeDb;
const ctx = (): LeadCreateContext => ({ organizationId: ORG, userId: U(200), supabase: fakeSupabase(db) as never });
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  name: 'Lead de prueba',
  new_customer: { first_name: 'Ana', email: `ana${db.seq}@example.com` },
  ...extra,
});
const config = (settings: Record<string, unknown>) =>
  db.tables.organization_settings.push({ id: U(500), organization_id: ORG, key: LEAD_ASSIGNMENT_SETTINGS_KEY, settings });
const leadInserts = () => db.writes.filter((w) => w.table === 'opportunities' && w.op === 'insert');

beforeEach(() => {
  db = makeDb(seed());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function crear(extra: Record<string, unknown> = {}) {
  const r = await createLeadWithCustomer(ctx(), cuerpo(extra));
  if (r.status !== 201) throw new Error(`esperaba 201, llegó ${r.status}: ${r.error}`);
  return r;
}

describe('round-robin sin salesperson_id', () => {
  it('asigna en orden de antigüedad y rota: A, B, A; el inactivo nunca', async () => {
    const r1 = await crear();
    const r2 = await crear();
    const r3 = await crear();
    expect(r1.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A, strategy: 'round_robin', team_id: TEAM });
    expect(r2.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_B });
    expect(r3.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
    const asignados = leadInserts().map((w) => (w.payload as { salesperson_id: unknown }).salesperson_id);
    expect(asignados).toEqual([VENDEDOR_A, VENDEDOR_B, VENDEDOR_A]);
    expect(asignados).not.toContain(VENDEDOR_INACTIVO);
  });

  it('el lead nace YA asignado (salesperson_id en el INSERT, no en un UPDATE posterior)', async () => {
    const r = await crear();
    expect(r.data.salesperson_id).toBe(VENDEDOR_A);
    expect(db.writes.filter((w) => w.table === 'opportunities' && w.op === 'update')).toHaveLength(0);
  });

  it('miembro inactivo: si el último asignado fue desactivado, sigue con el primero activo', async () => {
    db.tables.opportunities.push({
      id: U(35), organization_id: ORG, customer_id: U(1), salesperson_id: VENDEDOR_INACTIVO,
      status: 'open', record_type: 'lead', created_at: '2026-09-21T00:00:00.000Z',
    });
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
  });
});

describe('salesperson_id explícito', () => {
  it('se respeta tal cual y NO se consultan equipos', async () => {
    const r = await crear({ salesperson_id: VENDEDOR_B });
    expect(r.assignment).toEqual({ status: 'explicit', user_id: VENDEDOR_B });
    expect(r.data.salesperson_id).toBe(VENDEDOR_B);
    expect(db.reads.sales_teams).toBeUndefined();
    expect(db.reads.sales_team_members).toBeUndefined();
  });

  it('un vendedor de otra organización sigue siendo 400 (no se "corrige" por asignación automática)', async () => {
    const r = await createLeadWithCustomer(ctx(), cuerpo({ salesperson_id: VENDEDOR_121 }));
    expect(r.status).toBe(400);
    expect(leadInserts()).toHaveLength(0);
  });
});

describe('sin equipo o sin miembros: el lead se crea sin asignar', () => {
  it('sin equipos activos en la organización → 201, salesperson_id null, unassigned con motivo', async () => {
    db.tables.sales_teams = db.tables.sales_teams.filter((t) => t.organization_id !== ORG);
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
    expect((r.assignment as { reason: string }).reason).toMatch(/equipo/i);
    expect(r.data.salesperson_id).toBeNull();
    expect((leadInserts()[0].payload as { salesperson_id: unknown }).salesperson_id).toBeNull();
  });

  it('equipo sin miembros activos → 201 sin asignar', async () => {
    for (const m of db.tables.sales_team_members) if (m.organization_id === ORG) m.is_active = false;
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
    expect(r.data.salesperson_id).toBeNull();
  });

  it('equipo inactivo no cuenta como equipo', async () => {
    for (const t of db.tables.sales_teams) if (t.organization_id === ORG) t.is_active = false;
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
  });
});

describe('la asignación nunca tumba el alta', () => {
  it('error de BD al leer miembros → el lead se crea igual, sin asignar', async () => {
    db.errors['sales_team_members:select'] = { message: 'boom' };
    const r = await crear();
    expect(r.status).toBe(201);
    expect(r.assignment.status).toBe('unassigned');
    expect(leadInserts()).toHaveLength(1);
  });

  it('error al leer la configuración → se usa la configuración por defecto y se asigna', async () => {
    db.errors['organization_settings:select'] = { message: 'boom' };
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
  });

  it('error al leer el equipo → 201 sin asignar', async () => {
    db.errors['sales_teams:select'] = { message: 'boom' };
    const r = await crear();
    expect(r.status).toBe(201);
    expect(r.assignment.status).toBe('unassigned');
  });
});

describe('organización ajena (señuelos de la 121)', () => {
  it('config con team_id de otra organización → sin asignar; VENDEDOR_121 jamás recibe el lead', async () => {
    config({ strategy: 'round_robin', team_id: TEAM_OTHER });
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
    expect(r.data.salesperson_id).toBeNull();
    // El id configurado no se cree: la búsqueda del equipo lleva la organización de la sesión.
    const equipos = db.queries.filter((q) => q.table === 'sales_teams');
    expect(equipos.length).toBeGreaterThanOrEqual(1);
    for (const q of equipos) {
      expect(q.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
    }
    // Y con un miembro "huérfano" de la 120 colgado del equipo de la 121, sigue sin asignar.
    db.tables.sales_team_members.push({ id: U(399), organization_id: ORG, sales_team_id: TEAM_OTHER, user_id: VENDEDOR_121, sales_role_id: null, is_active: true, created_at: '2026-01-01T00:00:02.000Z' });
    const r2 = await crear();
    expect(r2.assignment.status).toBe('unassigned');
    expect(r2.data.salesperson_id).toBeNull();
  });

  it('las consultas de equipos y miembros llevan organization_id de la sesión', async () => {
    db.tables.sales_teams = db.tables.sales_teams.filter((t) => t.organization_id !== ORG);
    db.tables.sales_team_members = db.tables.sales_team_members.filter((m) => m.organization_id !== ORG);
    // Sin filtro de organización el "primer equipo activo" sería el de la 121 (created_at anterior).
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
    expect(leadInserts().map((w) => (w.payload as { salesperson_id: unknown }).salesperson_id)).toEqual([null]);
    expect(db.tables.opportunities.some((o) => o.organization_id === OTHER && o.id !== U(94))).toBe(false);
  });

  it('toda lectura de equipos, miembros, oportunidades y configuración lleva organization_id de la sesión', async () => {
    await crear();
    const tablas = ['sales_teams', 'sales_team_members', 'organization_settings', 'opportunities'];
    const lecturas = db.queries.filter((q) => tablas.includes(q.table));
    expect(lecturas.length).toBeGreaterThanOrEqual(4);
    for (const q of lecturas) {
      expect(q.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
    }
  });

  it('autoAssignLead con la organización 121 nunca toca datos de la 120', async () => {
    const out = await autoAssignLead({ organizationId: OTHER, customerId: U(91) }, fakeSupabase(db) as never);
    expect(out.status).toBe('assigned');
    expect((out as { user_id: string }).user_id).toBe(VENDEDOR_121);
  });
});

describe('configuración por organización (organization_settings.crm_lead_assignment)', () => {
  it('enabled=false → skipped y no se consultan equipos', async () => {
    config({ enabled: false });
    const r = await crear();
    expect(r.assignment.status).toBe('skipped');
    expect(r.data.salesperson_id).toBeNull();
    expect(db.reads.sales_teams).toBeUndefined();
  });

  it('strategy=load_balance → el vendedor con menos oportunidades abiertas', async () => {
    config({ strategy: 'load_balance' });
    for (let i = 0; i < 3; i += 1) {
      db.tables.opportunities.push({ id: U(60 + i), organization_id: ORG, salesperson_id: VENDEDOR_A, status: 'open', record_type: 'lead', created_at: '2026-09-01T00:00:00.000Z' });
    }
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_B, strategy: 'load_balance' });
  });

  it('team_id válido de la organización → se usa ese equipo', async () => {
    const otro = U(301);
    db.tables.sales_teams.push({ id: otro, organization_id: ORG, name: 'Equipo B', is_active: true, created_at: '2026-03-01T00:00:00.000Z' });
    db.tables.sales_team_members.push({ id: U(320), organization_id: ORG, sales_team_id: otro, user_id: VENDEDOR_B, sales_role_id: null, is_active: true, created_at: '2026-03-01T00:00:01.000Z' });
    config({ team_id: otro });
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_B, team_id: otro });
  });

  it('parseLeadAssignmentConfig: valores inválidos caen al valor por defecto', () => {
    expect(parseLeadAssignmentConfig(null)).toEqual({ enabled: true, strategy: 'round_robin', team_id: null });
    expect(parseLeadAssignmentConfig({ strategy: 'magia', enabled: 'sí', team_id: 42 })).toEqual({ enabled: true, strategy: 'round_robin', team_id: null });
    expect(parseLeadAssignmentConfig({ strategy: 'territory', enabled: false, team_id: TEAM })).toEqual({ enabled: false, strategy: 'territory', team_id: TEAM });
    expect(parseLeadAssignmentConfig('texto')).toEqual({ enabled: true, strategy: 'round_robin', team_id: null });
  });
});
