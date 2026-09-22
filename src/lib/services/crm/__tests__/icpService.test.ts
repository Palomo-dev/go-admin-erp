/// <reference types="jest" />
/**
 * F1 — `icpService`: motor de evaluación ICP (bandas A/B/C).
 *
 * Motor puro (`evaluateICPCriteria`): operadores del catálogo, pesos,
 * `is_required`, entradas inválidas (field_key fuera del catálogo, operador
 * desconocido, valores nulos) que se ignoran sin lanzar. Y con el doble de
 * Supabase (`leadAssignmentFake`): `evaluateICP` ordena por fit_score y jamás
 * ve perfiles ni criterios de la organización 121 (señuelos), `assignICPBand`
 * elige la banda con mejor encaje que pase los obligatorios y solo escribe en
 * oportunidades de la organización de la sesión.
 */
import {
  ALLOWED_FIELD_KEYS, ALLOWED_OPERATORS, assignICPBand, createICPCriterion, evaluateICP,
  evaluateICPCriteria, getICPProfiles, updateICPCriterion, type ICPCriterion,
} from '@/lib/services/crm/icpService';
import { fakeSupabase, makeDb, ORG, OTHER, U, type FakeDb, type Row } from './leadAssignmentFake';

const crit = (field_key: string, operator: string, value: unknown, extra: Partial<ICPCriterion> = {}): ICPCriterion => ({
  id: `c-${field_key}-${operator}`, organization_id: ORG, icp_profile_id: 'p', field_key,
  operator: operator as ICPCriterion['operator'], value, weight: 1, is_required: false,
  created_at: '', updated_at: '', ...extra,
});
const cliente = { company_size: 'Mediana', branches_count: 4, current_software: 'Excel y papel', lifecycle_stage: 'lead', city: 'Bogotá', vertical_id: U(7) };
const oportunidad = { amount: 5_000_000, currency: 'COP', deal_type: 'new' };

describe('evaluateICPCriteria · operadores del catálogo', () => {
  it.each([
    ['customers.company_size', 'eq', 'mediana', true],
    ['customers.company_size', 'eq', 'grande', false],
    ['customers.current_software', 'neq', 'sap', true],
    ['customers.branches_count', 'gt', 3, true],
    ['customers.branches_count', 'gte', '4', true],
    ['customers.branches_count', 'lt', 4, false],
    ['customers.branches_count', 'lte', 4, true],
    ['customers.city', 'in', ['Medellín', 'bogotá'], true],
    ['customers.city', 'not_in', ['Bogotá'], false],
    ['customers.current_software', 'contains', 'excel', true],
    ['customers.current_software', 'starts_with', 'Excel', true],
    ['customers.current_software', 'starts_with', 'papel', false],
    ['customers.vertical_id', 'eq', U(7), true],
    ['opportunities.amount', 'gte', 1_000_000, true],
    ['opportunities.currency', 'in', ['USD', 'COP'], true],
    ['opportunities.deal_type', 'eq', 'renewal', false],
  ])('%s %s %j → %s', (field, op, value, esperado) => {
    const r = evaluateICPCriteria([crit(field, op, value)], cliente, oportunidad);
    expect(r.details[0].passed).toBe(esperado);
    expect(r.fit_score).toBe(esperado ? 100 : 0);
  });

  it('el fit_score pondera por peso y redondea a entero', () => {
    const r = evaluateICPCriteria(
      [crit('customers.company_size', 'eq', 'mediana', { weight: 2 }), crit('customers.city', 'eq', 'Cali', { weight: 1 })],
      cliente, oportunidad,
    );
    expect(r.fit_score).toBe(67);
    expect(r.matched).toBe(true);
  });

  it('un criterio obligatorio que falla deja matched=false aunque el fit sea alto', () => {
    const r = evaluateICPCriteria(
      [crit('customers.company_size', 'eq', 'mediana', { weight: 9 }), crit('customers.city', 'eq', 'Cali', { is_required: true })],
      cliente, oportunidad,
    );
    expect(r.fit_score).toBe(90);
    expect(r.matched).toBe(false);
    expect(r.failed_required).toEqual(['customers.city']);
  });
});

describe('evaluateICPCriteria · entradas inválidas', () => {
  it('sin criterios → fit 0 y sin match', () => {
    expect(evaluateICPCriteria([], cliente, oportunidad)).toEqual({ fit_score: 0, matched: false, failed_required: [], details: [] });
  });

  it('field_key fuera del catálogo y operador desconocido se ignoran (ni cuentan ni lanzan)', () => {
    const r = evaluateICPCriteria(
      [crit('customers.password', 'eq', 'x'), crit('customers.city', 'regex', '.*'), crit('customers.city', 'eq', 'Bogotá')],
      cliente, oportunidad,
    );
    expect(r.details).toHaveLength(1);
    expect(r.fit_score).toBe(100);
  });

  it('valor real nulo nunca pasa, ni con neq ni con not_in', () => {
    const r = evaluateICPCriteria(
      [crit('customers.company_size', 'neq', 'x'), crit('customers.city', 'not_in', ['x']), crit('opportunities.amount', 'gte', 0)],
      {}, {},
    );
    expect(r.details.map((d) => d.passed)).toEqual([false, false, false]);
    expect(r.matched).toBe(false);
  });

  it('comparación numérica con texto no numérico no pasa', () => {
    const r = evaluateICPCriteria([crit('customers.branches_count', 'gt', 'muchas')], cliente, oportunidad);
    expect(r.details[0].passed).toBe(false);
  });

  it('el catálogo de campos y operadores es el de FASE-01 §2.2', () => {
    expect(ALLOWED_FIELD_KEYS).toHaveLength(9);
    expect(ALLOWED_OPERATORS).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'starts_with']);
  });
});

// ─── Con doble de Supabase: bandas A/B/C y señuelos de la 121 ────────────────

const PERFIL_A = U(801);
const PERFIL_B = U(802);
const PERFIL_C = U(803);
const PERFIL_121 = U(891);
const CLIENTE = U(1);
const CLIENTE_121 = U(91);

function semilla(): Record<string, Row[]> {
  const perfil = (id: string, band: string, priority: number, org = ORG): Row => ({
    id, organization_id: org, name: `ICP ${band}`, band, priority, color: '#000', sla_first_contact_hours: 24, is_active: true,
  });
  const c = (id: number, profile: string, field_key: string, operator: string, value: unknown, extra: Row = {}): Row => ({
    id: U(id), organization_id: ORG, icp_profile_id: profile, field_key, operator, value, weight: 1, is_required: false, created_at: `2026-01-0${id % 9}`, ...extra,
  });
  return {
    icp_profiles: [perfil(PERFIL_C, 'C', 90), perfil(PERFIL_A, 'A', 10), perfil(PERFIL_B, 'B', 50), perfil(PERFIL_121, 'A', 1, OTHER)],
    icp_criteria: [
      c(1, PERFIL_A, 'customers.company_size', 'in', ['mediana', 'grande'], { is_required: true }),
      c(2, PERFIL_A, 'customers.branches_count', 'gte', 3),
      c(3, PERFIL_A, 'opportunities.amount', 'gte', 3_000_000),
      c(4, PERFIL_B, 'customers.company_size', 'in', ['pequeña', 'mediana']),
      c(5, PERFIL_B, 'customers.city', 'in', ['Bogotá', 'Medellín']),
      c(6, PERFIL_C, 'customers.lifecycle_stage', 'eq', 'lead'),
      // Señuelo: criterio de la org 121 que apunta a un perfil de la 120 (solo posible sin RLS).
      { ...c(7, PERFIL_A, 'customers.city', 'eq', 'Nunca', { is_required: true }), organization_id: OTHER },
      c(8, PERFIL_121, 'customers.city', 'eq', 'Bogotá'),
    ],
    customers: [
      { id: CLIENTE, organization_id: ORG, ...cliente },
      { id: CLIENTE_121, organization_id: OTHER, ...cliente },
    ],
    opportunities: [
      { id: U(30), organization_id: ORG, customer_id: CLIENTE, status: 'open', amount: 5_000_000, currency: 'COP', deal_type: 'new', created_at: '2026-09-01' },
      { id: U(31), organization_id: ORG, customer_id: CLIENTE, status: 'lost', amount: 1, currency: 'COP', deal_type: 'new', created_at: '2026-08-01' },
      { id: U(94), organization_id: OTHER, customer_id: CLIENTE_121, status: 'open', amount: 5_000_000, currency: 'COP', deal_type: 'new', created_at: '2026-09-01' },
    ],
  };
}

let db: FakeDb;
const sb = () => fakeSupabase(db) as never;
beforeEach(() => {
  db = makeDb(semilla());
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('getICPProfiles / evaluateICP', () => {
  it('devuelve solo perfiles de la organización, por prioridad, con sus criterios (sin el señuelo de la 121)', async () => {
    const perfiles = await getICPProfiles(ORG, sb());
    expect(perfiles.map((p) => p.band)).toEqual(['A', 'B', 'C']);
    expect(perfiles.find((p) => p.id === PERFIL_121)).toBeUndefined();
    const a = perfiles.find((p) => p.id === PERFIL_A)!;
    expect(a.criteria).toHaveLength(3);
    expect(a.criteria!.some((c) => c.organization_id === OTHER)).toBe(false);
  });

  it('evalúa el cliente contra A/B/C y ordena por fit_score descendente', async () => {
    const ev = await evaluateICP(ORG, CLIENTE, sb());
    expect(ev.map((e) => [e.band, e.fit_score, e.matched])).toEqual([['A', 100, true], ['B', 100, true], ['C', 100, true]]);
  });

  it('usa la oportunidad MÁS RECIENTE del cliente para los campos opportunities.*', async () => {
    db.tables.opportunities.find((o) => o.id === U(30))!.amount = 10;
    const ev = await evaluateICP(ORG, CLIENTE, sb());
    const a = ev.find((e) => e.band === 'A')!;
    expect(a.fit_score).toBe(67);
    expect(a.details.find((d) => d.field_key === 'opportunities.amount')!.actual).toBe(10);
  });

  it('cliente de otra organización → sin evaluaciones (nunca se lee por id suelto)', async () => {
    expect(await evaluateICP(ORG, CLIENTE_121, sb())).toEqual([]);
  });

  it('sin perfiles activos → [] sin consultar al cliente', async () => {
    db.tables.icp_profiles = [];
    expect(await evaluateICP(ORG, CLIENTE, sb())).toEqual([]);
    expect(db.reads.customers).toBeUndefined();
  });
});

describe('assignICPBand', () => {
  it('asigna la banda con mejor encaje que pasa los obligatorios y escribe icp_band/icp_fit_score solo en open/won de la org', async () => {
    const r = await assignICPBand(ORG, CLIENTE, sb());
    expect(r).toMatchObject({ customer_id: CLIENTE, assigned_band: 'A', best_profile_id: PERFIL_A, fit_score: 100 });
    const upd = db.writes.filter((w) => w.table === 'opportunities' && w.op === 'update');
    expect(upd).toHaveLength(1);
    expect(upd[0].filters).toEqual(expect.arrayContaining([
      { kind: 'eq', key: 'organization_id', value: ORG },
      { kind: 'eq', key: 'customer_id', value: CLIENTE },
      { kind: 'in', key: 'status', value: ['open', 'won'] },
    ]));
    expect(db.tables.opportunities.find((o) => o.id === U(30))).toMatchObject({ icp_band: 'A', icp_fit_score: 100 });
    expect(db.tables.opportunities.find((o) => o.id === U(31))!.icp_band).toBeUndefined();
    expect(db.tables.opportunities.find((o) => o.id === U(94))!.icp_band).toBeUndefined();
  });

  it('si A falla un obligatorio y C no encaja, cae a B (mejor fit entre los que pasan)', async () => {
    const c = db.tables.customers.find((x) => x.id === CLIENTE)!;
    c.company_size = 'micro';
    c.lifecycle_stage = 'customer';
    const r = await assignICPBand(ORG, CLIENTE, sb());
    expect(r.assigned_band).toBe('B');
    expect(r.fit_score).toBe(50);
    // Orden por fit_score (A 67 sin obligatorio, B 50, C 0); se elige el primero que encaja.
    expect(r.evaluations.map((e) => [e.band, e.fit_score, e.matched])).toEqual([['A', 67, false], ['B', 50, true], ['C', 0, false]]);
  });

  it('sin ningún match → banda null y ninguna escritura', async () => {
    db.tables.customers.find((c) => c.id === CLIENTE)!.company_size = null;
    db.tables.customers.find((c) => c.id === CLIENTE)!.city = null;
    db.tables.customers.find((c) => c.id === CLIENTE)!.lifecycle_stage = null;
    db.tables.customers.find((c) => c.id === CLIENTE)!.branches_count = null;
    db.tables.opportunities.find((o) => o.id === U(30))!.amount = null;
    const r = await assignICPBand(ORG, CLIENTE, sb());
    expect(r.assigned_band).toBeNull();
    expect(r.best_profile_id).toBeNull();
    expect(db.writes).toHaveLength(0);
  });
});

describe('CRUD de criterios · validación', () => {
  it('createICPCriterion rechaza field_key fuera del catálogo y operador desconocido sin escribir', async () => {
    await expect(createICPCriterion(ORG, PERFIL_A, { field_key: 'customers.email' as never, operator: 'eq', value: 'x' }, sb())).rejects.toThrow(/inválido/);
    await expect(createICPCriterion(ORG, PERFIL_A, { field_key: 'customers.city', operator: 'like' as never, value: 'x' }, sb())).rejects.toThrow(/inválido/);
    expect(db.writes).toHaveLength(0);
  });

  it('createICPCriterion válido escribe con organization_id de la sesión y valores por defecto', async () => {
    await createICPCriterion(ORG, PERFIL_A, { field_key: 'customers.city', operator: 'eq', value: 'Cali' }, sb());
    expect(db.writes[0].payload).toMatchObject({ organization_id: ORG, icp_profile_id: PERFIL_A, weight: 1, is_required: false });
  });

  it('updateICPCriterion rechaza operador inválido y filtra por organización al escribir', async () => {
    await expect(updateICPCriterion(U(1), ORG, { operator: 'like' as never }, sb())).rejects.toThrow(/inválido/);
    await updateICPCriterion(U(1), ORG, { weight: 5 }, sb());
    expect(db.writes[0].filters).toEqual(expect.arrayContaining([{ kind: 'eq', key: 'organization_id', value: ORG }]));
    // El criterio U(7) es de la 121: con el filtro de organización no hay fila que actualizar.
    await expect(updateICPCriterion(U(7), ORG, { weight: 5 }, sb())).rejects.toMatchObject({ code: 'PGRST116' });
  });
});
