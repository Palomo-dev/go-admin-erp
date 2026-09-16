/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-parte C) — integración sobre cuatro rutas representativas con
 * `getServerOrgContext` doblado (sesión de la organización 120):
 *
 *   - POST /api/ai-assistant/chat      (patrón `let ctx; try { ctx = … }` + body JSON)
 *   - POST /api/crm/whatsapp/send      (`withWhatsAppRoute` + zod `parseWith`)
 *   - POST /api/crm/activities         (`getServerOrgContext` + `.catch(() => null)`)
 *   - DELETE /api/crm/teams/[id]       (sin body: la organización ajena viaja en la query)
 *   - POST /api/ai-assistant/{attachments,transcribe} (multipart: el 403 ya no
 *     se convierte en 400 dentro del `try` del `formData()` — QA C+D r2 §1)
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

// Rutas multipart del asistente: se doblan créditos y la cadena STT.
jest.mock('@/lib/services/aiCreditsService', () => ({ checkAICredits: jest.fn(async () => ({ allowed: true, balance: 100 })) }));
jest.mock('@/lib/services/crm/aiCostService', () => ({ chargeAiCredits: jest.fn(async () => ({ ok: true })) }));
const transcribeWithFallback = jest.fn(async () => ({ result: { text: 'hola', segments: [], duration_seconds: 1, model: 'm', cost_usd: 0 }, provider: 'x', fellBack: false }));
jest.mock('@/lib/services/crm/stt', () => ({ SttChainError: class extends Error {}, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallback(...(a as [])) }));

import { NextRequest } from 'next/server';
import { POST as chatPost } from '../ai-assistant/chat/route';
import { POST as sendPost } from '../crm/whatsapp/send/route';
import { POST as activitiesPost } from '../crm/activities/route';
import { DELETE as teamDelete } from '../crm/teams/[id]/route';
import { POST as attachmentsPost } from '../ai-assistant/attachments/route';
import { POST as transcribePost } from '../ai-assistant/transcribe/route';

const UUID = '11111111-1111-4111-8111-111111111111';

function json(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

function multipart(url: string, fields: Record<string, string | Blob>): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest(`http://localhost${url}`, { method: 'POST', body: fd });
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

describe('POST /api/ai-assistant/transcribe (multipart)', () => {
  const audio = new Blob([new Uint8Array(4)], { type: 'audio/webm' });
  test('organization_id ajeno en el formulario → 403 FOREIGN_ORGANIZATION, registro y la cadena STT no se llama (antes: 400 «Petición mal formada»)', async () => {
    const res = await transcribePost(multipart('/api/ai-assistant/transcribe', { audio, organization_id: '999' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organization_id ajeno/), expect.objectContaining({ session: 120, body: '999', route: 'ai-assistant/transcribe' }));
    expect(transcribeWithFallback).not.toHaveBeenCalled();
  });

  test('la misma organización (orgId) no es 403; un cuerpo que no es multipart sigue siendo 400', async () => {
    // Sin `audio` la ruta corta en 400 FILE antes de tocar servicios: basta para probar que el 403 no salta.
    const res = await transcribePost(multipart('/api/ai-assistant/transcribe', { orgId: '120' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/audio/i) });
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/ajeno/), expect.anything());
    const notMultipart = new NextRequest('http://localhost/api/ai-assistant/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect((await transcribePost(notMultipart)).status).toBe(400);
  });
});

describe('POST /api/ai-assistant/attachments (multipart)', () => {
  const file = new Blob([new Uint8Array(4)], { type: 'image/png' });
  test('orgId ajeno en el formulario → 403 FOREIGN_ORGANIZATION y registro (antes: 400 «multipart/form-data»)', async () => {
    const res = await attachmentsPost(multipart('/api/ai-assistant/attachments', { file, orgId: '999' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FOREIGN_ORGANIZATION' });
    // En multipart el valor llega como cadena: '999', no 999.
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/orgId ajeno/), expect.objectContaining({ session: 120, body: '999', userId: 'u-1', route: 'ai-assistant/attachments' }));
  });

  test('la misma organización no es 403 (sin archivo → 400 FILE_REQUIRED); un cuerpo que no es multipart → 400 BAD_REQUEST', async () => {
    const res = await attachmentsPost(multipart('/api/ai-assistant/attachments', { organization_id: '120' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'FILE_REQUIRED' });
    expect(warn).not.toHaveBeenCalledWith(expect.stringMatching(/ajeno/), expect.anything());
    const notMultipart = new NextRequest('http://localhost/api/ai-assistant/attachments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const bad = await attachmentsPost(notMultipart);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'BAD_REQUEST' });
  });
});
