/// <reference types="jest" />
/**
 * CRM ola 1 — lógica pura y contratos de datos de los servicios nuevos:
 * origen del lead contra el CHECK, SQLSTATE → HTTP, plantilla → RPC de
 * pipeline, esquema del alta de oportunidad (D2/D4/D8), el alta de lead sobre
 * una ficha EXISTENTE (D2: no degrada su etapa ni crea oportunidad) y la
 * política de migraciones de la ola (cada `.sql` con su rollback).
 */

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  hasOrgAdminOrPermission: jest.fn(async () => true),
}));
jest.mock('@/lib/services/crm/leadAutoAssign', () => ({
  autoAssignLead: jest.fn(async () => ({ status: 'unassigned', reason: 'sin equipo (prueba)' })),
}));

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { LEAD_SOURCES } from '@/lib/crm/enums';
import { estadoDeSqlState } from '../crmRouteSupport';
import { createLeadWithCustomer, normalizarOrigenLead } from '../leadCreateService';
import { datosDePipeline } from '../pipelineWriteService';
import { getPipelineTemplateById } from '../pipelineTemplates';
import { oportunidadAltaSchema, oportunidadEdicionSchema } from '../opportunityWriteService';
import { fakeSupabase, makeDb, ORG, U, YO } from '@/app/api/crm/__tests__/ola1Fake';

describe('normalizarOrigenLead: texto libre → catálogo de customers.lead_source', () => {
  it.each([
    [undefined, 'manual'],
    ['manual_erp', 'manual'],
    ['website', 'web_form'],
    ['Referido', 'referral'],
    ['importacion', 'import'],
    ['llamada_entrante', 'inbound_call'],
    ['whatsapp', 'whatsapp'],
    ['algo raro', 'other'],
  ])('%s → %s', (entrada, salida) => {
    expect(normalizarOrigenLead(entrada)).toBe(salida);
    expect(LEAD_SOURCES).toContain(normalizarOrigenLead(entrada));
  });
});

describe('estadoDeSqlState', () => {
  it.each([
    ['42501', 403], ['P0002', 404], ['P0001', 409], ['40001', 409], ['23505', 409],
    ['22023', 400], ['22P02', 400], ['23514', 400], ['XX000', null], ['PGRST116', null],
  ])('%s → %s', (code, status) => expect(estadoDeSqlState(code)).toBe(status));
});

describe('datosDePipeline: plantilla → cuerpo de crm_create_pipeline_with_stages', () => {
  it('toma nombre, tipo y etapas ordenadas de la plantilla; lo explícito manda', () => {
    const ventas = getPipelineTemplateById('sales');
    const d = datosDePipeline({ goal_currency: 'usd' }, ventas)!;
    expect(d).toMatchObject({ name: 'Ventas', pipeline_type: 'sales', is_default: false, goal_currency: 'USD' });
    expect(d.stages.map((s) => s.name)[0]).toBe('Lead nuevo');
    const propio = datosDePipeline({ name: 'Mío', stages: [{ name: 'A' }, { name: 'G', is_won: true }] }, ventas)!;
    expect(propio.stages).toHaveLength(2);
  });

  it('sin nombre o sin etapas → null (la ruta responde 400)', () => {
    expect(datosDePipeline({}, null)).toBeNull();
    expect(datosDePipeline({ name: 'X' }, getPipelineTemplateById('blank'))).toBeNull();
  });
});

describe('esquemas de oportunidad', () => {
  it('el alta exige nombre y rechaza record_type, status, etapa de cierre y claves desconocidas', () => {
    expect(oportunidadAltaSchema.safeParse({ name: 'X' }).success).toBe(true);
    for (const extra of [{ record_type: 'deal' }, { status: 'won' }, { win_data: {} }, { foo: 1 }, { origen: 'pos' }]) {
      expect(oportunidadAltaSchema.safeParse({ name: 'X', ...extra }).success).toBe(false);
    }
  });

  it('la edición no acepta pipeline ni etapa (van por …/stage)', () => {
    expect(oportunidadEdicionSchema.safeParse({ amount: 1 }).success).toBe(true);
    expect(oportunidadEdicionSchema.safeParse({ pipeline_id: U(1) }).success).toBe(false);
    expect(oportunidadEdicionSchema.safeParse({ stage_id: U(1) }).success).toBe(false);
  });
});

describe('createLeadWithCustomer sobre una ficha existente (D2)', () => {
  const ctx = (db: ReturnType<typeof makeDb>) => ({ organizationId: ORG, userId: YO, supabase: fakeSupabase(db) as never });

  it('un cliente que ya es «customer» no baja a lead, conserva su responsable y no nace oportunidad', async () => {
    const db = makeDb({
      customers: [{ id: U(13), organization_id: ORG, lifecycle_stage: 'customer', lead_source: null, owner_id: U(201), metadata: { otra: 1 }, tags: ['vip'] }],
    });
    const r = await createLeadWithCustomer(ctx(db), { customer_id: U(13), source: 'referido', amount: 500, currency: 'cop', temperature: 'hot' });
    expect(r.status).toBe(201);
    const ficha = db.t.customers[0];
    expect(ficha).toMatchObject({ lifecycle_stage: 'customer', lead_source: 'referral', owner_id: U(201), tags: ['vip'] });
    expect(ficha.metadata).toMatchObject({ otra: 1, lead: { valor_estimado: { monto: 500, moneda: 'COP' }, temperatura: 'hot' } });
    expect(db.writes.some((w) => w.table === 'opportunities')).toBe(false);
  });

  it('un lead descartado que vuelve a entrar se reactiva y conserva su origen', async () => {
    const db = makeDb({
      customers: [{ id: U(10), organization_id: ORG, lifecycle_stage: 'lead', lead_source: 'web_form', owner_id: null, lead_discarded_at: '2026-09-01T00:00:00Z', lead_discard_reason: 'x', metadata: {} }],
    });
    const r = await createLeadWithCustomer(ctx(db), { customer_id: U(10), source: 'manual' });
    expect(r.status).toBe(201);
    expect(db.t.customers[0]).toMatchObject({ lead_source: 'web_form', lead_discarded_at: null, lead_discard_reason: null });
  });

  it('validación antes de escribir: temperatura, moneda y monto', async () => {
    const db = makeDb({ customers: [{ id: U(10), organization_id: ORG, lifecycle_stage: 'lead', metadata: {} }] });
    for (const b of [{ temperature: 'tibia' }, { currency: 'pesos' }, { amount: -1 }]) {
      expect((await createLeadWithCustomer(ctx(db), { customer_id: U(10), ...b })).status).toBe(400);
    }
    expect(db.writes).toEqual([]);
  });
});

describe('migraciones de la ola 1: cada .sql con su rollback (docs/POLITICA-MIGRACIONES.md)', () => {
  const raiz = process.cwd();
  const migraciones = readdirSync(join(raiz, 'supabase', 'migrations')).filter((f) => /^2026093016\d{4}_crm_ola1_.*\.sql$/.test(f));
  const rollbacks = new Set(readdirSync(join(raiz, 'supabase', 'rollbacks')));

  it('son ocho y todas tienen rollback', () => {
    expect(migraciones).toHaveLength(8);
    for (const m of migraciones) expect(rollbacks.has(m.replace(/\.sql$/, '_rollback.sql'))).toBe(true);
  });

  it('M6 respeta el «por defecto» por organización del índice existente y no crea uno por tipo', () => {
    const sql = readFileSync(join(raiz, 'supabase', 'migrations', '20260930160700_crm_ola1_pipeline_rpc.sql'), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/create\s+unique\s+index/i);
    expect(sql).toMatch(/fn_crm_exigir_permiso\(p_org, array\['crm\.pipelines\.manage'\]\)/);
  });

  it('web_capture_lead ya no inserta oportunidades y mantiene EXECUTE solo para service_role', () => {
    const sql = readFileSync(join(raiz, 'supabase', 'migrations', '20260930160800_crm_ola1_web_capture_lead_cliente.sql'), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/insert\s+into\s+public\.opportunities/i);
    expect(sql).toMatch(/lead_source = coalesce\(c\.lead_source, 'web_form'\)/);
    expect(sql).toMatch(/revoke all on function public\.web_capture_lead\([^)]*\) from public, anon, authenticated/);
  });

  it('ningún .sql de la ola nombra una organización cliente: solo ids', () => {
    for (const m of migraciones) {
      const sql = readFileSync(join(raiz, 'supabase', 'migrations', m), 'utf8');
      expect(sql).not.toMatch(/S\.A\.S\.|\bLtda\b/i);
    }
  });
});
