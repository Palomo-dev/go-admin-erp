/// <reference types="jest" />
/**
 * F1 (cierre) — pruebas adversariales del TESTER sobre la asignación
 * automática de leads (`leadCreateService` → `leadAutoAssign` →
 * `assignmentService`). Complementa `leadAutoAssignment.test.ts` (del
 * constructor) con los ataques que esa suite no cubre:
 *
 *  - tenencia: un miembro de equipo cuyo `user_id` NO es miembro de la
 *    organización (la RLS `stm_insert` solo comprueba `organization_id`, y
 *    `sales_team_members.user_id` referencia `profiles`, no
 *    `organization_members`: verificado por MCP el 2026-09-21) jamás recibe
 *    un lead. El camino explícito ya lo rechazaba con 400; el automático
 *    tenía que hacer lo mismo en vez de «corregirlo» en silencio.
 *  - concurrencia: dos altas simultáneas con round-robin (carrera documentada).
 *  - robustez: estrategia desconocida, settings malformados, error al leer la
 *    última oportunidad, territorios vacíos / sin match / con responsable
 *    ajeno, empate en load_balance, equipo configurado inactivo.
 *  - contrato: `salesperson_id` explícito nunca consulta equipos ni
 *    territorios; el lead se inserta una sola vez y sin UPDATE posterior.
 */
import { createLeadWithCustomer, type LeadCreateContext } from '@/lib/services/crm/leadCreateService';
import { autoAssignLead } from '@/lib/services/crm/leadAutoAssign';
import { assignLead, AssignmentError } from '@/lib/services/crm/assignmentService';
import { LEAD_ASSIGNMENT_SETTINGS_KEY, parseLeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';
import {
  fakeSupabase, makeDb, seed, type FakeDb, type Row,
  ORG, OTHER, U, TEAM, VENDEDOR_A, VENDEDOR_B, VENDEDOR_121,
} from './leadAssignmentFake';

let db: FakeDb;
const client = () => fakeSupabase(db) as never;
const ctx = (): LeadCreateContext => ({ organizationId: ORG, userId: U(200), supabase: client() });
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  name: 'Lead adversarial',
  new_customer: { first_name: 'Eva', email: `eva${db.seq}${Math.random()}@example.com` },
  ...extra,
});
const config = (settings: unknown) =>
  db.tables.organization_settings.push({ id: U(500), organization_id: ORG, key: LEAD_ASSIGNMENT_SETTINGS_KEY, settings } as Row);
const leadInserts = () => db.writes.filter((w) => w.table === 'opportunities' && w.op === 'insert');
const salespersonDe = (w: { payload: unknown }) => (w.payload as { salesperson_id: unknown }).salesperson_id;

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

// ═══════════════════════════════════════════════════════════════════════
// 1. Tenencia: miembro de equipo con user_id ajeno a la organización
// ═══════════════════════════════════════════════════════════════════════
describe('tenencia · miembro de equipo cuyo user_id no pertenece a la organización', () => {
  /** Fila de `sales_team_members` de la org 120 apuntando a un perfil de la 121 (la RLS lo permite). */
  const colarAjeno = (createdAt = '2026-02-01T00:00:00.500Z') =>
    db.tables.sales_team_members.push({
      id: U(313), organization_id: ORG, sales_team_id: TEAM, user_id: VENDEDOR_121,
      sales_role_id: null, is_active: true, created_at: createdAt,
    });

  it('round_robin: el ajeno se salta aunque sea el «siguiente» por antigüedad', async () => {
    colarAjeno(); // queda entre A (…:01) y B (…:02) → sería el índice 1 tras A
    const r1 = await crear();
    const r2 = await crear();
    const r3 = await crear();
    expect([r1, r2, r3].map((r) => (r.assignment as { user_id?: string }).user_id)).toEqual([VENDEDOR_A, VENDEDOR_B, VENDEDOR_A]);
    expect(leadInserts().map(salespersonDe)).not.toContain(VENDEDOR_121);
  });

  it('round_robin: si el ajeno es el ÚNICO miembro activo, el lead queda sin asignar (no se «corrige» con él)', async () => {
    for (const m of db.tables.sales_team_members) if (m.organization_id === ORG) m.is_active = false;
    colarAjeno();
    const r = await crear();
    expect(r.assignment.status).toBe('unassigned');
    expect(r.data.salesperson_id).toBeNull();
  });

  it('load_balance: el ajeno con 0 oportunidades no gana el empate', async () => {
    config({ strategy: 'load_balance' });
    colarAjeno('2026-01-01T00:00:00.000Z'); // el más antiguo: ganaría todo empate
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
  });

  it('territory: un territorio cuyo assigned_user_id es un miembro ajeno no lo asigna (cae a round_robin)', async () => {
    config({ strategy: 'territory' });
    colarAjeno();
    db.tables.territories.push({
      id: U(700), organization_id: ORG, name: 'Bogotá', is_active: true,
      criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Bogotá' }], assigned_user_id: VENDEDOR_121 },
    });
    const r = await crear({ customer_id: U(1), new_customer: undefined });
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
    expect((r.assignment as { reason: string }).reason).toMatch(/sin responsable válido/);
  });

  it('assignLead directo: la lista de miembros se cruza con organization_members de la sesión', async () => {
    colarAjeno();
    // Solo el ajeno está activo → AssignmentError «no hay miembros», no una asignación al ajeno.
    for (const m of db.tables.sales_team_members) if (m.user_id !== VENDEDOR_121) m.is_active = false;
    await expect(assignLead({ organizationId: ORG, customerId: U(1), strategy: 'round_robin', teamId: TEAM }, client()))
      .rejects.toBeInstanceOf(AssignmentError);
    const lecturas = db.queries.filter((q) => q.table === 'organization_members');
    expect(lecturas.length).toBeGreaterThanOrEqual(1);
    for (const q of lecturas) {
      expect(q.filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Concurrencia: dos altas simultáneas con round-robin
// ═══════════════════════════════════════════════════════════════════════
describe('concurrencia · round-robin sin puntero persistido', () => {
  it('DOCUMENTADO: dos altas simultáneas leen la misma «última oportunidad» y reciben el MISMO vendedor', async () => {
    // El puntero se deriva de la última `opportunities.created_at` de un
    // miembro del equipo (lectura + inserción sin RPC ni bloqueo). Dos
    // peticiones intercaladas ven la misma foto y ambas eligen al mismo.
    // Impacto real hoy: 0 filas en sales_team_members en producción; el
    // siguiente lead vuelve a rotar desde ese vendedor (no hay corrupción,
    // solo un reparto desigual puntual).
    const [r1, r2] = await Promise.all([crear(), crear()]);
    const ids = [r1, r2].map((r) => (r.assignment as { user_id: string }).user_id);
    expect(ids).toEqual([VENDEDOR_A, VENDEDOR_A]);
    // Y tras la carrera, la rotación se recupera sola:
    const r3 = await crear();
    expect((r3.assignment as { user_id: string }).user_id).toBe(VENDEDOR_B);
  });

  it('en serie sí rota: A, B, A, B', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push((await crear()).assignment.status === 'assigned' ? (leadInserts().at(-1)!.payload as { salesperson_id: string }).salesperson_id : 'x');
    expect(ids).toEqual([VENDEDOR_A, VENDEDOR_B, VENDEDOR_A, VENDEDOR_B]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Robustez
// ═══════════════════════════════════════════════════════════════════════
describe('robustez · configuración y estrategias', () => {
  it.each([
    ['array', ['round_robin']],
    ['número', 7],
    ['cadena', 'load_balance'],
    ['estrategia desconocida', { strategy: 'random' }],
    ['strategy null', { strategy: null }],
    ['team_id no uuid', { team_id: 'equipo-1' }],
    ['enabled como cadena', { enabled: 'false' }],
  ])('settings malformado (%s) → round_robin activo sobre el primer equipo', async (_n, settings) => {
    config(settings);
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A, strategy: 'round_robin', team_id: TEAM });
  });

  it('parseLeadAssignmentConfig ignora claves extra y un "__proto__" venido del jsonb (propiedad propia, no prototipo)', () => {
    expect(parseLeadAssignmentConfig(JSON.parse('{"strategy":"load_balance","extra":1,"__proto__":{"enabled":false}}')))
      .toEqual({ enabled: true, strategy: 'load_balance', team_id: null });
    expect(parseLeadAssignmentConfig({ team_id: TEAM.toUpperCase() }).team_id).toBe(TEAM.toUpperCase());
  });

  it('team_id configurado pero inactivo → sin asignar con motivo (no cae al primer equipo activo)', async () => {
    const otro = U(301);
    db.tables.sales_teams.push({ id: otro, organization_id: ORG, name: 'Inactivo', is_active: false, created_at: '2026-03-01T00:00:00.000Z' });
    config({ team_id: otro });
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'unassigned' });
    expect((r.assignment as { reason: string }).reason).toMatch(/inactivo|no pertenece|no existe/);
    expect(db.reads.sales_team_members).toBeUndefined();
  });

  it('error al leer la última oportunidad (round_robin) → se asigna al primero, no revienta', async () => {
    db.errors['opportunities:select'] = { message: 'boom' };
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
  });

  it('error al leer territorios → cae a round_robin con motivo', async () => {
    config({ strategy: 'territory' });
    db.errors['territories:select'] = { message: 'boom' };
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A, strategy: 'territory' });
    expect((r.assignment as { reason: string }).reason).toMatch(/^territory: sin territorios → round_robin/);
  });

  it('territory sin territorios / sin match → round_robin con motivo; con match y responsable del equipo → directo', async () => {
    config({ strategy: 'territory' });
    const r0 = await crear({ customer_id: U(1), new_customer: undefined });
    expect((r0.assignment as { reason: string }).reason).toMatch(/sin territorios/);

    db.tables.territories.push({
      id: U(700), organization_id: ORG, name: 'Medellín', is_active: true,
      criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Medellín' }], assigned_user_id: VENDEDOR_B },
    });
    const r1 = await crear({ customer_id: U(1), new_customer: undefined });
    expect((r1.assignment as { reason: string }).reason).toMatch(/sin match/);

    db.tables.territories.push({
      id: U(701), organization_id: ORG, name: 'Bogotá', is_active: true,
      criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Bogotá' }], assigned_user_id: VENDEDOR_B },
    });
    const r2 = await crear({ customer_id: U(1), new_customer: undefined });
    expect(r2.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_B });
    expect((r2.assignment as { reason: string }).reason).toMatch(/"Bogotá".*asignado directamente/);
  });

  it('territory: un territorio de la organización 121 con match perfecto no se evalúa', async () => {
    config({ strategy: 'territory' });
    db.tables.territories.push({
      id: U(790), organization_id: OTHER, name: 'Señuelo', is_active: true,
      criteria: { rules: [{ field_key: 'customers.city', operator: 'eq', value: 'Bogotá' }], assigned_user_id: VENDEDOR_B },
    });
    const r = await crear({ customer_id: U(1), new_customer: undefined });
    expect((r.assignment as { reason: string }).reason).toMatch(/sin territorios/);
  });

  it('load_balance con empate → el miembro más antiguo (orden estable)', async () => {
    config({ strategy: 'load_balance' });
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_A });
    expect((r.assignment as { reason: string }).reason).toBe('load_balance: 0 oportunidades abiertas (menor carga del team)');
  });

  it('load_balance cuenta SOLO oportunidades abiertas de la organización: cerradas y señuelos de la 121 no pesan', async () => {
    config({ strategy: 'load_balance' });
    // A: 1 abierta. B: 2 cerradas + 1 abierta de la 121 → carga real 0 → gana B.
    db.tables.opportunities.push(
      { id: U(59), organization_id: ORG, salesperson_id: VENDEDOR_A, status: 'open', record_type: 'lead', created_at: '2026-09-01T00:00:00.000Z' },
      { id: U(60), organization_id: ORG, salesperson_id: VENDEDOR_B, status: 'won', record_type: 'deal', created_at: '2026-09-01T00:00:00.000Z' },
      { id: U(61), organization_id: ORG, salesperson_id: VENDEDOR_B, status: 'lost', record_type: 'deal', created_at: '2026-09-01T00:00:00.000Z' },
      { id: U(62), organization_id: OTHER, salesperson_id: VENDEDOR_B, status: 'open', record_type: 'lead', created_at: '2026-09-01T00:00:00.000Z' },
    );
    const r = await crear();
    expect(r.assignment).toMatchObject({ status: 'assigned', user_id: VENDEDOR_B });
    expect((r.assignment as { reason: string }).reason).toBe('load_balance: 0 oportunidades abiertas (menor carga del team)');
  });

  it('autoAssignLead nunca lanza: un cliente que revienta en from() produce unassigned con motivo', async () => {
    const roto = { from: () => { throw new Error('conexión caída'); } } as never;
    const out = await autoAssignLead({ organizationId: ORG, customerId: U(1) }, roto);
    expect(out).toEqual({ status: 'unassigned', reason: expect.stringContaining('conexión caída') });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Contrato
// ═══════════════════════════════════════════════════════════════════════
describe('contrato', () => {
  it('salesperson_id explícito: ni equipos, ni miembros, ni territorios, ni configuración', async () => {
    config({ strategy: 'territory' });
    const r = await crear({ salesperson_id: VENDEDOR_A });
    expect(r.assignment).toEqual({ status: 'explicit', user_id: VENDEDOR_A });
    for (const t of ['sales_teams', 'sales_team_members', 'territories', 'organization_settings']) {
      expect(db.reads[t]).toBeUndefined();
    }
  });

  it('salesperson_id explícito con espacios se limpia y se valida contra organization_members', async () => {
    const r = await crear({ salesperson_id: `  ${VENDEDOR_B}  ` });
    expect(r.assignment).toEqual({ status: 'explicit', user_id: VENDEDOR_B });
  });

  it('un solo INSERT en opportunities, ninguna UPDATE, y la respuesta trae salesperson_id', async () => {
    const r = await crear();
    expect(leadInserts()).toHaveLength(1);
    expect(db.writes.filter((w) => w.table === 'opportunities' && w.op === 'update')).toHaveLength(0);
    expect(r.data.salesperson_id).toBe(VENDEDOR_A);
    expect(r.assignment).toEqual({
      status: 'assigned', user_id: VENDEDOR_A, strategy: 'round_robin', team_id: TEAM,
      reason: 'round_robin: índice 0 de 2 miembros',
    });
  });

  it('si el INSERT del lead falla tras asignar, la ficha nueva se revierte y el error sube', async () => {
    db.errors['opportunities:insert'] = { message: 'boom' };
    await expect(createLeadWithCustomer(ctx(), cuerpo())).rejects.toMatchObject({ message: 'boom' });
    expect(db.writes.filter((w) => w.table === 'customers' && w.op === 'delete')).toHaveLength(1);
  });
});
