/// <reference types="jest" />
/**
 * F11 — contratos de ruta: la organización sale de la sesión (nunca del body
 * ni de la query), `completed_by` sale de la sesión, completar exige todos los
 * pasos (409), los crons son fail-closed con CRON_SECRET y nunca aceptan
 * `organization_id` de un cliente sin secreto.
 */
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, makeDb, writesTo, type FakeDb } from './f11FakeSupabase';

jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('twilio', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: jest.fn() }));

const ctxState: { orgId: number; userId: string; db: FakeDb | null } = { orgId: 120, userId: 'user-session', db: null };
jest.mock('@/lib/utils/orgContext', () => {
  class OrgContextError extends Error {
    statusCode: number;
    constructor(status: number, message: string) { super(message); this.statusCode = status; }
  }
  return {
    OrgContextError,
    getServerOrgContext: jest.fn(async () => {
      if (!ctxState.db) throw new OrgContextError(401, 'sin sesión');
      return { organizationId: ctxState.orgId, userId: ctxState.userId, supabase: createFakeSupabase(ctxState.db) as unknown as SupabaseClient };
    }),
  };
});
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => createFakeSupabase(ctxState.db!) as unknown as SupabaseClient),
}));

import { GET as getInstance, PATCH as patchInstance } from '@/app/api/crm/onboarding/instances/[id]/route';
import { POST as postInstances } from '@/app/api/crm/onboarding/instances/route';
import { PATCH as patchStep } from '@/app/api/crm/onboarding/instances/[id]/steps/[stepId]/route';
import { GET as getByOpportunity } from '@/app/api/crm/onboarding/by-opportunity/[opportunityId]/route';
import { GET as getRenewals, POST as postRenewalsSync } from '@/app/api/crm/renewals/sync/route';
import { POST as postHealthRecalc } from '@/app/api/crm/health/recalculate/route';

const ORG = 120;
const DECOY = ORG + 1;
const SECRET = 'cron-secret-0123456789';

const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

function fixtures(): FakeDb {
  return makeDb({
    onboarding_templates: [
      { id: 'tpl-120', organization_id: ORG, name: 'Estándar', steps: [{ day: 0, owner: 'vendor', title: 'Kickoff' }, { day: 5, owner: 'cs', title: 'Config' }], default_duration_days: 30, is_active: true },
    ],
    opportunities: [
      { id: 'onb-a', organization_id: ORG, status: 'open', customer_id: 'cust-a', parent_opportunity_id: 'won-a', pipeline_id: 'pl-onb', stage_id: 'st-1', metadata: { type: 'onboarding' } },
      { id: 'onb-121', organization_id: DECOY, status: 'open', customer_id: 'cust-121', parent_opportunity_id: null, pipeline_id: 'pl-121', stage_id: 'st-121', metadata: { type: 'onboarding' } },
    ],
    stages: [
      { id: 'st-1', pipeline_id: 'pl-onb', position: 1, is_won: false },
      { id: 'st-won', pipeline_id: 'pl-onb', position: 2, is_won: true },
    ],
    onboarding_instances: [
      { id: 'inst-121', organization_id: DECOY, template_id: null, opportunity_id: 'onb-121', customer_id: 'cust-121', status: 'active', started_at: '2026-09-01T00:00:00Z', completed_at: null },
    ],
    onboarding_steps: [
      { id: 'step-121', organization_id: DECOY, instance_id: 'inst-121', step_number: 1, name: 'x', is_completed: false, completed_at: null, completed_by: null, notes: null },
    ],
    organization_modules: [{ organization_id: ORG, module_code: 'crm', is_active: true }],
    health_score_configs: [],
    health_score_snapshots: [],
    customers: [{ id: 'cust-a', organization_id: ORG, full_name: 'Cliente A' }],
    organizations: [{ id: ORG, timezone: 'America/Bogota' }],
  });
}

beforeEach(() => {
  ctxState.orgId = ORG;
  ctxState.userId = 'user-session';
  ctxState.db = fixtures();
  ctxState.db.rpc = { fn_customer_health: () => [] };
  process.env.CRON_SECRET = SECRET;
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('onboarding — instancias y pasos', () => {
  it('POST /instances sin template_id crea desde la plantilla por defecto; el organization_id del body igual a la sesión no manda (y otro → 403, r2)', async () => {
    const forbidden = await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-a', organization_id: DECOY } }));
    expect(forbidden.status).toBe(403);
    expect(ctxState.db!.writes).toHaveLength(0);
    const res = await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-a', organization_id: ORG } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toMatchObject({ organization_id: ORG, opportunity_id: 'onb-a', template_id: 'tpl-120' });
    expect(json.data.steps).toHaveLength(2);
    expect(writesTo(ctxState.db!, 'onboarding_instances', 'insert')[0].rows[0].organization_id).toBe(ORG);
  });

  it('POST /instances sobre una oportunidad de otra org → 404 sin escrituras', async () => {
    const res = await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-121' } }));
    expect(res.status).toBe(404);
    expect(ctxState.db!.writes).toHaveLength(0);
  });

  it('GET /by-opportunity devuelve la instancia con pasos + owner de plantilla, o data:null si no hay', async () => {
    const empty = await getByOpportunity(req('/api/crm/onboarding/by-opportunity/onb-a'), params({ opportunityId: 'onb-a' }));
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toBeNull();

    await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-a' } }));
    const res = await getByOpportunity(req('/api/crm/onboarding/by-opportunity/onb-a'), params({ opportunityId: 'onb-a' }));
    const json = await res.json();
    expect(json.data.steps).toHaveLength(2);
    expect(json.data.steps.map((s: { owner: string | null }) => s.owner)).toEqual(['vendor', 'cs']);
    expect(json.data.progress).toEqual({ total: 2, done: 0, pct: 0, allDone: false });

    const decoy = await getByOpportunity(req('/api/crm/onboarding/by-opportunity/onb-121'), params({ opportunityId: 'onb-121' }));
    expect((await decoy.json()).data).toBeNull();
  });

  it('PATCH step: completed_by SIEMPRE es el usuario de la sesión (el body no manda) y el step debe ser de la instancia', async () => {
    const created = await (await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-a' } }))).json();
    const instId = created.data.id as string;
    const stepId = created.data.steps[0].id as string;
    const res = await patchStep(req(`/x/${instId}/steps/${stepId}`, { method: 'PATCH', body: { is_completed: true, completed_by: 'atacante' } }), params({ id: instId, stepId }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ is_completed: true, completed_by: 'user-session' });

    const wrong = await patchStep(req(`/x/inst-121/steps/${stepId}`, { method: 'PATCH', body: { is_completed: false } }), params({ id: 'inst-121', stepId }));
    expect(wrong.status).toBe(404);
    const decoy = await patchStep(req('/x/inst-121/steps/step-121', { method: 'PATCH', body: { is_completed: true } }), params({ id: 'inst-121', stepId: 'step-121' }));
    expect(decoy.status).toBe(404);
    expect(ctxState.db!.rows.onboarding_steps.find((s) => s.id === 'step-121')!.is_completed).toBe(false);
  });

  it('PATCH instancia status=completed → 409 con pasos pendientes; con todos hechos completa y mueve a la etapa is_won', async () => {
    const created = await (await postInstances(req('/api/crm/onboarding/instances', { method: 'POST', body: { opportunity_id: 'onb-a' } }))).json();
    const instId = created.data.id as string;
    const early = await patchInstance(req(`/x/${instId}`, { method: 'PATCH', body: { status: 'completed' } }), params({ id: instId }));
    expect(early.status).toBe(409);
    expect((await early.json()).error).toMatch(/pendientes/);

    for (const s of ctxState.db!.rows.onboarding_steps) if (s.organization_id === ORG) s.is_completed = true;
    const ok = await patchInstance(req(`/x/${instId}`, { method: 'PATCH', body: { status: 'completed' } }), params({ id: instId }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ status: 'completed' });
    expect(ctxState.db!.rows.opportunities.find((o) => o.id === 'onb-a')!.stage_id).toBe('st-won');

    const bad = await patchInstance(req(`/x/${instId}`, { method: 'PATCH', body: { status: 'hacked' } }), params({ id: instId }));
    expect(bad.status).toBe(400);
    const decoy = await getInstance(req('/x/inst-121'), params({ id: 'inst-121' }));
    expect(decoy.status).toBe(404);
  });
});

describe('crons F11 — fail-closed', () => {
  it('POST /health/recalculate y /renewals/sync: 401 sin secreto, sin CRON_SECRET configurado, o con ?token=', async () => {
    expect((await postHealthRecalc(req('/api/crm/health/recalculate', { method: 'POST' }))).status).toBe(401);
    expect((await postRenewalsSync(req(`/api/crm/renewals/sync?token=${SECRET}`, { method: 'POST' }))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await postHealthRecalc(req('/api/crm/health/recalculate', { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }))).status).toBe(401);
    expect(ctxState.db!.writes).toHaveLength(0);
  });

  it('con secreto: recorren las orgs con CRM activo (organization_modules) y devuelven el resultado por org', async () => {
    const h = await postHealthRecalc(req('/api/crm/health/recalculate', { method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }));
    expect(h.status).toBe(200);
    expect((await h.json()).data).toMatchObject({ orgs: 1, processed: 1 });
    const r = await postRenewalsSync(req('/api/crm/renewals/sync', { method: 'POST', headers: { 'x-cron-secret': SECRET } }));
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({ orgs: 1, processed: 1, by_org: [expect.objectContaining({ org_id: ORG, timezone: 'America/Bogota' })] });
  });

  it('con secreto y body.organization_id: solo esa organización', async () => {
    ctxState.db!.rows.organization_modules.push({ organization_id: 130, module_code: 'crm', is_active: true });
    const h = await postHealthRecalc(req('/api/crm/health/recalculate', { method: 'POST', headers: { authorization: `Bearer ${SECRET}` }, body: { organization_id: 130 } }));
    expect((await h.json()).data).toMatchObject({ orgs: 1, by_org: [expect.objectContaining({ org_id: 130 })] });
  });

  it('GET /renewals/sync: la organización sale de la sesión; ?organization_id= de otra org se ignora', async () => {
    ctxState.db!.rows.opportunities.push(
      { id: 'won-120', organization_id: ORG, status: 'won', customer_id: 'cust-a', amount: 10, currency: 'COP', salesperson_id: null, billing_cycle_months: 1, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new' },
      { id: 'won-121', organization_id: DECOY, status: 'won', customer_id: 'cust-121', amount: 99, currency: 'COP', salesperson_id: null, billing_cycle_months: 1, closed_at: '2026-09-01T00:00:00Z', deal_type: 'new' },
    );
    const res = await getRenewals(req(`/api/crm/renewals/sync?days=365&organization_id=${DECOY}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.map((r: { opportunity_id: string }) => r.opportunity_id)).toEqual(['won-120']);
    ctxState.db = null;
    expect((await getRenewals(req('/api/crm/renewals/sync'))).status).toBe(401);
  });
});
