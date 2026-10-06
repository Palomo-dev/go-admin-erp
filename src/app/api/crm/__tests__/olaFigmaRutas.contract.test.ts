/// <reference types="jest" />
/**
 * CRM «Figma a código» — contrato de las rutas nuevas de llamadas, campaña de
 * voz, prueba del agente, segmentos, campañas unificadas y objeciones.
 *
 * Mismo doble de Supabase que la ola 1: la organización sale de la SESIÓN (las
 * RPC reciben `p_org = 120` aunque el cliente pida otra), una organización
 * ajena en el body o la query da 403 sin tocar nada y los permisos se
 * resuelven en el servidor.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db } from './ola1Fake';

let db: Ola1Db;
let permisos: Set<string>;
let admin = false;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: admin ? 2 : 4, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permisos.has(code)),
  isOrgAdminContext: jest.fn(() => admin),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));
jest.mock('@/lib/services/crm/voiceAgentTestService', () => ({ probarAgenteVoz: jest.fn(async () => ({ respuesta: 'ok' })) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ InsufficientCreditsError: class extends Error { code = 'INSUFFICIENT_CREDITS'; } }));

import { NextRequest } from 'next/server';
import { GET as callsGet } from '../calls/route';
import { GET as campanaVozGet } from '../voice-agents/campaigns/[id]/route';
import { POST as pruebaAgentePost } from '../voice-agents/test/route';
import { POST as previewPost } from '../segments/preview/route';
import { POST as recountPost } from '../segments/[id]/recount/route';
import { GET as unificadasGet } from '../campaigns/unified/route';
import { GET as frecuenciaGet } from '../objections/frequency/route';
import { probarAgenteVoz } from '@/lib/services/crm/voiceAgentTestService';

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });
const rpc = (fn: string) => db.rpcCalls.filter((c) => c.fn === fn);

beforeEach(() => {
  db = makeDb(seed());
  permisos = new Set(['crm.opportunities.view', 'crm.customers.view']);
  admin = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/calls', () => {
  beforeEach(() => {
    db.rpc.crm_calls_list = { data: { data: [], count: 0, stats: { totalToday: 2 }, canViewAll: false } };
  });

  it('la organización y la zona salen del servidor; los días se convierten a instantes de Bogotá', async () => {
    const r = await json(await callsGet(req('/api/crm/calls?from_date=2026-10-01&to_date=2026-10-06')));
    expect(r.status).toBe(200);
    const [llamada] = rpc('crm_calls_list');
    expect(llamada.args.p_org).toBe(ORG);
    const f = llamada.args.p_filters as Record<string, unknown>;
    expect(f.from_date).toBe('2026-10-01T05:00:00.000Z');
    expect(f.to_date).toBe('2026-10-07T05:00:00.000Z');
    expect(f.to_date_exclusive).toBe(true);
    // Sin `crm.calls.view_all` solo las propias.
    expect(f.user_id).toBe(YO);
  });

  it('pedir las de otro sin view_all → 403 sin consultar', async () => {
    const r = await json(await callsGet(req(`/api/crm/calls?user_id=${OTRO_VENDEDOR}`)));
    expect(r.status).toBe(403);
    expect(rpc('crm_calls_list')).toHaveLength(0);
  });

  it('con view_all sí puede filtrar por otro vendedor', async () => {
    permisos.add('crm.calls.view_all');
    await callsGet(req(`/api/crm/calls?user_id=${OTRO_VENDEDOR}`));
    expect((rpc('crm_calls_list')[0].args.p_filters as Record<string, unknown>).user_id).toBe(OTRO_VENDEDOR);
  });

  it('organización ajena en la query → 403', async () => {
    const r = await callsGet(req(`/api/crm/calls?organization_id=${OTRA}`));
    expect(r.status).toBe(403);
    expect(rpc('crm_calls_list')).toHaveLength(0);
  });
});

describe('GET /api/crm/voice-agents/campaigns/[id]', () => {
  it('lee el detalle con la organización de la sesión y «hoy» null si la migración no está aplicada', async () => {
    db.rpc.crm_voice_campaign_detail = { data: { campaign: { id: U(70), name: 'Reactivación' }, stats: { targets: 10, attempts: 4 }, active: [], history: [], page: 1, timezone: 'America/Bogota' } };
    const r = await json(await campanaVozGet(req(`/api/crm/voice-agents/campaigns/${U(70)}`), params(U(70))));
    expect(r.status).toBe(200);
    expect(rpc('crm_voice_campaign_detail')[0].args).toMatchObject({ p_org: ORG, p_campaign: U(70), p_page: 1 });
    expect((r.body.data as { hoy: unknown }).hoy).toBeNull();
    expect((r.body.data as { stats: { targets: number } }).stats.targets).toBe(10);
  });

  it('id inválido → 400; permiso denegado por la base → 403', async () => {
    expect((await campanaVozGet(req('/api/crm/voice-agents/campaigns/x'), params('x'))).status).toBe(400);
    db.rpc.crm_voice_campaign_detail = { error: { code: '42501', message: 'sin_permiso' } };
    expect((await campanaVozGet(req(`/api/crm/voice-agents/campaigns/${U(70)}`), params(U(70)))).status).toBe(403);
  });
});

describe('POST /api/crm/voice-agents/test', () => {
  it('sin crm.campaigns.manage → 403 sin llamar al modelo', async () => {
    const r = await pruebaAgentePost(req('/api/crm/voice-agents/test', 'POST', { message: 'hola' }));
    expect(r.status).toBe(403);
    expect(probarAgenteVoz).not.toHaveBeenCalled();
  });

  it('organización ajena en el body → 403; con permiso, el body llega sin claves de organización', async () => {
    permisos.add('crm.campaigns.manage');
    expect((await pruebaAgentePost(req('/api/crm/voice-agents/test', 'POST', { organization_id: OTRA, message: 'hola' }))).status).toBe(403);
    const r = await pruebaAgentePost(req('/api/crm/voice-agents/test', 'POST', { organization_id: ORG, message: 'hola' }));
    expect(r.status).toBe(200);
    expect((probarAgenteVoz as jest.Mock).mock.calls.at(-1)?.[1]).toEqual({ message: 'hola' });
  });
});

describe('segmentos: conteo en vivo y recálculo en el servidor', () => {
  const conteo = { base: 3964, coinciden: 120, desglose: { telefono: 100, no_llamar: 3, correo: 80, whatsapp: 40, estimado: false, sobre: 120 }, muestra: [], calculado_en: '2026-10-06T15:00:00Z' };

  it('preview: grupos O con la organización de la sesión', async () => {
    db.rpc.crm_segment_preview = { data: conteo };
    const filtro = { grupos: [[{ field: 'city', operator: 'equals', value: 'Medellín' }], [{ field: 'tags', operator: 'contains', value: 'vip' }]] };
    const r = await json(await previewPost(req('/api/crm/segments/preview', 'POST', { filter_json: filtro })));
    expect(r.status).toBe(200);
    expect(rpc('crm_segment_preview')[0].args).toMatchObject({ p_org: ORG, p_filter: filtro });
    expect((r.body.data as { coinciden: number }).coinciden).toBe(120);
  });

  it('preview: filtro irreconocible → 400 sin consultar; migración sin aplicar → 503', async () => {
    expect((await previewPost(req('/api/crm/segments/preview', 'POST', { filter_json: 'todos' }))).status).toBe(400);
    expect(rpc('crm_segment_preview')).toHaveLength(0);
    const r = await json(await previewPost(req('/api/crm/segments/preview', 'POST', { filter_json: [] })));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('conteo_no_disponible');
  });

  it('preview: sin crm.customers.view → 403', async () => {
    permisos.delete('crm.customers.view');
    expect((await previewPost(req('/api/crm/segments/preview', 'POST', { filter_json: [] }))).status).toBe(403);
  });

  it('recount: exige crm.segments.manage y escribe el conteo solo en el segmento de la organización', async () => {
    db.t.segments = [
      { id: U(80), organization_id: ORG, filter_json: [{ field: 'city', operator: 'equals', value: 'Cali' }], customer_count: 0 },
      { id: U(81), organization_id: OTRA, filter_json: [], customer_count: 7 },
    ];
    db.rpc.crm_segment_preview = { data: conteo };
    expect((await recountPost(req(`/api/crm/segments/${U(80)}/recount`, 'POST', {}), params(U(80)))).status).toBe(403);
    permisos.add('crm.segments.manage');
    const r = await json(await recountPost(req(`/api/crm/segments/${U(80)}/recount`, 'POST', {}), params(U(80))));
    expect(r.status).toBe(200);
    expect(db.t.segments[0].customer_count).toBe(120);
    expect((await recountPost(req(`/api/crm/segments/${U(81)}/recount`, 'POST', {}), params(U(81)))).status).toBe(404);
    expect(db.t.segments[1].customer_count).toBe(7);
  });
});

describe('GET /api/crm/campaigns/unified', () => {
  const filas = [
    { id: U(1), name: 'Reactivación', source: 'voice', channel: 'voice', status: 'running', created_at: '2026-10-05', scheduled_at: null, stats: null, segment_name: 'Leads fríos', content_name: 'Ana', emergency_stop: false, stopped_reason: null, voice_counts: { completed: 3, failed: 1, in_progress: 1, queued: 5 } },
    { id: U(2), name: 'Boletín', source: 'message', channel: 'email', status: 'sent', created_at: '2026-10-01', scheduled_at: null, stats: { total_contacts: 10, counts: { sent: 9, failed: 1, skipped: 0, delivered: 8, read: 5, replied: 1 } }, segment_name: 'Activos', content_name: 'boletin', emergency_stop: false, stopped_reason: null, voice_counts: {} },
  ];

  it('una sola RPC con la organización de la sesión, filtro por canal y conteos por canal', async () => {
    db.rpc.crm_campaigns_unificadas = { data: filas };
    const r = await json(await unificadasGet(req('/api/crm/campaigns/unified?channel=voice')));
    expect(r.status).toBe(200);
    expect(rpc('crm_campaigns_unificadas')[0].args).toEqual({ p_org: ORG });
    const data = r.body.data as { rows: { id: string; progress: { done: number; total: number } }[]; porCanal: Record<string, number>; canManage: boolean };
    expect(data.rows.map((x) => x.id)).toEqual([U(1)]);
    expect(data.rows[0].progress).toMatchObject({ done: 4, total: 10 });
    expect(data.porCanal).toEqual({ all: 2, voice: 1, messages: 1 });
    expect(data.canManage).toBe(false);
  });

  it('canal desconocido → 400; organización ajena → 403', async () => {
    expect((await unificadasGet(req('/api/crm/campaigns/unified?channel=fax'))).status).toBe(400);
    expect((await unificadasGet(req(`/api/crm/campaigns/unified?organization_id=${OTRA}`))).status).toBe(403);
    expect(rpc('crm_campaigns_unificadas')).toHaveLength(0);
  });
});

describe('GET /api/crm/objections/frequency', () => {
  it('ventana de 90 días en la zona de la organización y respuesta validada', async () => {
    db.rpc.crm_objection_frequency = { data: { frequencies: [{ objection_id: U(5), call_count: 3, advanced_count: 1, opportunity_count: 2, advanced_opportunity_count: 1 }], weeks: [], calls: [], responses: [] } };
    const r = await json(await frecuenciaGet(req('/api/crm/objections/frequency')));
    expect(r.status).toBe(200);
    const args = rpc('crm_objection_frequency')[0].args;
    expect(args).toMatchObject({ p_org: ORG, p_timezone: 'America/Bogota', p_objection: null });
    expect(String(args.p_since)).toMatch(/T00:00:00(\.000)?-05:00$/);
    expect((r.body.data as { dias: number }).dias).toBe(90);
  });

  it('id de objeción inválido → 400 sin consultar', async () => {
    expect((await frecuenciaGet(req('/api/crm/objections/frequency?id=abc'))).status).toBe(400);
    expect(rpc('crm_objection_frequency')).toHaveLength(0);
  });
});
