/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-parte C) — integración sobre cuatro rutas representativas con
 * `getServerOrgContext` doblado (sesión de la organización 120):
 *
 *   - POST /api/ai-assistant/chat      (patrón `let ctx; try { ctx = … }` + body JSON)
 *   - POST /api/crm/whatsapp/send      (`withWhatsAppRoute` + zod `parseWith`)
 *   - POST /api/crm/activities         (`getServerOrgContext` + `.catch(() => null)`)
 *   - DELETE /api/crm/teams/[id]       (sin body: la organización ajena viaja en la query)
 *
 * Contrato (regla dura 5 b): organización ajena en body o query → 403
 * `FOREIGN_ORGANIZATION`, `console.warn` estructurado y NINGUNA escritura. Sin
 * organización, o con la de la sesión, sigue el camino feliz. Los servicios de
 * negocio se doblan y registran si fueron llamados. Organizaciones ficticias.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

const session = { organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', memberId: 1, supabase: {} as never };
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContext: jest.fn(async () => session),
  requireOrgAdmin: jest.fn(),
  requireOrgAdminOrPermission: jest.fn(async () => undefined),
  isOrgAdminContext: () => true,
}));

// ── dobles de servicios (ninguno debe ejecutarse cuando la organización es ajena) ──
const createActivity = jest.fn(async () => ({ id: 'act-1' }));
jest.mock('@/lib/services/crm/activityService', () => ({
  // El esquema real vive en el servicio doblado: aquí «null» (JSON inválido) falla y un objeto pasa.
  activityInputSchema: { safeParse: (v: unknown) => (v && typeof v === 'object' ? { success: true, data: v } : { success: false, error: { flatten: () => ({}) } }) },
  createActivity: (...a: unknown[]) => createActivity(...(a as [])),
  DuplicateActivityError: class extends Error {},
  RelatedNotFoundError: class extends Error {},
}));

const deleteSalesTeam = jest.fn(async () => undefined);
jest.mock('@/lib/services/crm/salesStructureService', () => ({
  updateSalesTeam: jest.fn(),
  deleteSalesTeam: (...a: unknown[]) => deleteSalesTeam(...(a as [])),
}));

const sendWhatsApp = jest.fn(async () => ({ message_id: 'm-1', conversation_id: 'c-1', activity_id: null, customer_id: 'cu-1', channel_id: 'ch-1', scheduled: false }));
jest.mock('@/lib/services/crm/whatsapp/outboundService', () => ({
  sendWhatsApp: (...a: unknown[]) => sendWhatsApp(...(a as [])),
}));

const assistantChat = jest.fn(async () => ({ content: 'hola', usage: null, action: null }));
jest.mock('@/lib/services/aiAssistantService', () => ({
  aiAssistantService: { sendMessage: (...a: unknown[]) => assistantChat(...(a as [])) },
}));
jest.mock('@/lib/ai/assistant/capabilities', () => ({ getAssistantCapabilities: jest.fn(async () => ({ modules: [], permissions: [], actions: [] })) }));
jest.mock('@/lib/ai/assistant/actionGuard', () => ({ evaluateAction: jest.fn(() => ({ allowed: false })) }));
jest.mock('@/lib/ai/assistant/actionCatalog', () => ({ getActionDefinition: jest.fn(), getActionSchema: jest.fn(), sanitizeActionFields: jest.fn() }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 9, resetAt: new Date(), count: 1 })) }));

import { NextRequest } from 'next/server';
import { POST as chatPost } from '../ai-assistant/chat/route';
import { POST as sendPost } from '../crm/whatsapp/send/route';
import { POST as activitiesPost } from '../crm/activities/route';
import { DELETE as teamDelete } from '../crm/teams/[id]/route';

const UUID = '11111111-1111-4111-8111-111111111111';

function json(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

let warn: jest.SpyInstance;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
beforeAll(() => { process.env.OPENAI_API_KEY = 'sk-test-clave-ficticia-solo-para-que-la-ruta-no-corte'; });
afterAll(() => { if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAiKey; });
beforeEach(() => {
  jest.clearAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function expectForeignWarn(key = 'organization_id') {
  expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${key} ajeno`)), expect.objectContaining({ session: 120, body: 999, userId: 'u-1' }));
}

describe('POST /api/ai-assistant/chat', () => {
  test('organization_id ajeno → 403 FOREIGN_ORGANIZATION, registro y el modelo NO se llama', async () => {
    const res = await chatPost(json('/api/ai-assistant/chat', 'POST', { message: 'hola', organization_id: 999 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expectForeignWarn();
    expect(assistantChat).not.toHaveBeenCalled();
  });

  test('sin organización, o la de la sesión (organizationId camelCase) → camino feliz', async () => {
    expect((await chatPost(json('/api/ai-assistant/chat', 'POST', { message: 'hola' }))).status).not.toBe(403);
    expect((await chatPost(json('/api/ai-assistant/chat', 'POST', { message: 'hola', organizationId: 120 }))).status).not.toBe(403);
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/ajeno/), expect.anything());
    expect(assistantChat).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/crm/whatsapp/send (withWhatsAppRoute)', () => {
  const body = { customerId: UUID, channelId: UUID, text: 'hola' };
  test('orgId ajeno → 403 (antes: 400 de zod sin registro) y no se envía nada', async () => {
    const res = await sendPost(json('/api/crm/whatsapp/send', 'POST', { ...body, orgId: 999 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expectForeignWarn('orgId');
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  test('la misma organización en el body ya no es un 400: se ignora y se envía', async () => {
    const res = await sendPost(json('/api/crm/whatsapp/send', 'POST', { ...body, organization_id: 120 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    const input = (sendWhatsApp.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(input).not.toHaveProperty('organization_id');
  });
});

describe('POST /api/crm/activities (getServerOrgContext + .catch(() => null))', () => {
  test('organization_id ajeno → 403 y createActivity no se invoca', async () => {
    const res = await activitiesPost(json('/api/crm/activities', 'POST', { type: 'note', organization_id: 999 }));
    expect(res.status).toBe(403);
    expectForeignWarn();
    expect(createActivity).not.toHaveBeenCalled();
  });

  test('JSON inválido sigue siendo 400 (la ruta conserva su propio manejo) y sin organización se crea', async () => {
    const bad = new NextRequest('http://localhost/api/crm/activities', { method: 'POST', body: '{no', headers: { 'content-type': 'application/json' } });
    expect((await activitiesPost(bad)).status).toBe(400);
    expect((await activitiesPost(json('/api/crm/activities', 'POST', { type: 'note' }))).status).toBe(201);
    expect(createActivity).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE /api/crm/teams/[id] (sin body)', () => {
  const params = { params: Promise.resolve({ id: 'team-1' }) };
  test('organización ajena en la QUERY → 403 y no se borra', async () => {
    const res = await teamDelete(new NextRequest('http://localhost/api/crm/teams/team-1?organization_id=999', { method: 'DELETE' }), params);
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ where: 'query', session: 120 }));
    expect(deleteSalesTeam).not.toHaveBeenCalled();
  });

  test('sin organización → se borra en la organización de la sesión', async () => {
    const res = await teamDelete(new NextRequest('http://localhost/api/crm/teams/team-1', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(deleteSalesTeam).toHaveBeenCalledWith('team-1', 120, expect.anything());
  });
});
