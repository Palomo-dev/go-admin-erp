/// <reference types="jest" />
/**
 * F10 — contrato de `/api/crm/contracts` (crear/enviar, status) y del webhook
 * de Documenso (`/api/crm/webhooks/documenso`, fallo cerrado).
 * Proveedor doblado por `EsignAdapter`; NUNCA se llama a Documenso.
 */
import { createHmac } from 'crypto';
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
// Extiende la clase real: `readOrgBody` (punto único) lanza la real y las rutas hacen `instanceof`.
class FakeOrgContextError extends RealOrgContextError { statusCode = 401; code = 'UNAUTHORIZED'; }
let db: FakeDb;
const REAL_KEY = 'api_documenso_real_key_abcdefghijklmnopqrstuvwxyz';
const WH_SECRET = 'whsec_documenso_0123456789abcdef';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      opportunities: [{ id: 'op-1', organization_id: 120, name: 'Op 1' }, { id: 'op-9', organization_id: 121, name: 'Ajena' }],
      quotations: [{ id: 'q-1', organization_id: 120, signature_id: null }, { id: 'q-9', organization_id: 121, signature_id: null }],
      provider_configs: [],
      contract_signatures: [
        { id: 'c-1', organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-1', provider: 'documenso', provider_document_id: 'doc-1', status: 'sent', signers: [{ name: 'Ana', email: 'ana@x.co' }] },
        { id: 'c-9', organization_id: 121, opportunity_id: 'op-9', quotation_id: 'q-9', provider: 'documenso', provider_document_id: 'doc-9', status: 'sent', signers: [] },
        { id: 'c-2', organization_id: 120, opportunity_id: 'op-1', quotation_id: null, provider: 'documenso', provider_document_id: 'doc-2', status: 'signed', signers: [] },
      ],
    },
  };
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError, // la clase real: `readOrgBody` lanza la real y las rutas hacen `instanceof`
  getServerOrgContext: jest.fn(async () => ({ organizationId: 120, userId: 'u-1', roleId: 2, roleName: 'x', isSuperAdmin: false, organizationName: 'Org', supabase: createFakeSupabase(db) })),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => createFakeSupabase(db) }));

const adapterCalls: unknown[] = [];
let adapterFails = false;
jest.mock('@/lib/services/crm/esignAdapter', () => ({
  EsignProviderError: class EsignProviderError extends Error {},
  documensoAdapter: {
    createDocument: jest.fn(async (input: unknown) => {
      adapterCalls.push(input);
      if (adapterFails) throw new Error('proveedor caído');
      return { providerDocumentId: 'doc-new-77' };
    }),
  },
}));

import { NextRequest } from 'next/server';
import { POST as contractsPost, GET as contractsGet } from '../route';
import { GET as statusGet } from '../status/route';
import { POST as webhookPost } from '@/app/api/crm/webhooks/documenso/route';
import { POST as legacyWebhookPost } from '../webhook/route';

const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } } : { headers }) });
const writesTo = (t: string) => db.writes.filter((w) => w.table === t);
const envBackup = { ...process.env };

beforeEach(() => {
  db = seed();
  adapterCalls.length = 0;
  adapterFails = false;
  delete process.env.DOCUMENSO_API_KEY;
  delete process.env.DOCUMENSO_WEBHOOK_SECRET;
});
afterAll(() => { process.env = envBackup; });

const validBody = { opportunity_id: 'op-1', quotation_id: 'q-1', signers: [{ name: 'Ana', email: 'ana@x.co' }] };

describe('GET /api/crm/contracts/status', () => {
  it('sin proveedor (provider=none como hoy en BD) → configured:false con `missing` sin nombres de variables', async () => {
    db.rows.provider_configs.push({ organization_id: 120, category: 'esign', provider: 'none', is_active: false, credentials: {} });
    const res = await statusGet();
    const json = await res.json();
    expect(json.data.configured).toBe(false);
    expect(JSON.stringify(json)).not.toMatch(/DOCUMENSO|apiKey|process\.env/);
    expect(json.data.missing.length).toBeGreaterThan(0);
  });

  it('con clave real de la organización → configured:true sin exponer la clave; placeholder de plataforma → false', async () => {
    db.rows.provider_configs.push({ organization_id: 120, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: REAL_KEY } });
    db.rows.provider_configs.push({ organization_id: 121, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: 'otra_clave_real_de_otra_org_zzzzzzzzzzzzzzz' } });
    const json = await (await statusGet()).json();
    expect(json.data).toMatchObject({ configured: true, provider: 'documenso', source: 'organization' });
    expect(JSON.stringify(json)).not.toContain(REAL_KEY);
    db.rows.provider_configs = [];
    process.env.DOCUMENSO_API_KEY = 'your-documenso-api-key';
    expect((await (await statusGet()).json()).data.configured).toBe(false);
  });
});

describe('POST /api/crm/contracts', () => {
  it('sin proveedor → 409 y CERO escrituras (no se crea un contrato que no puede enviarse)', async () => {
    const res = await contractsPost(req('POST', '/api/crm/contracts', validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.configured).toBe(false);
    expect(db.writes).toHaveLength(0);
    expect(adapterCalls).toHaveLength(0);
  });

  it('con proveedor: inserta pending, envía por el adaptador y actualiza a sent con provider_document_id (filtrando por organización)', async () => {
    process.env.DOCUMENSO_API_KEY = 'api_platform_key_abcdefghijklmnopqrstuvwxyz';
    const res = await contractsPost(req('POST', '/api/crm/contracts', validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toMatchObject({ status: 'sent', provider_document_id: 'doc-new-77', organization_id: 120 });
    const ins = writesTo('contract_signatures').find((w) => w.op === 'insert');
    expect(ins?.row).toMatchObject({ organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-1', status: 'pending', provider: 'documenso' });
    const upd = writesTo('contract_signatures').find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ organization_id: 120 });
    expect(adapterCalls[0]).toMatchObject({ meta: { organization_id: 120 }, signers: [{ name: 'Ana', email: 'ana@x.co' }] });
  });

  it('oportunidad o cotización de otra organización → 404 sin escrituras; organización en body → 403', async () => {
    process.env.DOCUMENSO_API_KEY = 'api_platform_key_abcdefghijklmnopqrstuvwxyz';
    expect((await contractsPost(req('POST', '/api/crm/contracts', { ...validBody, opportunity_id: 'op-9' }))).status).toBe(404);
    expect((await contractsPost(req('POST', '/api/crm/contracts', { ...validBody, quotation_id: 'q-9' }))).status).toBe(404);
    expect(db.writes).toHaveLength(0);
    expect((await contractsPost(req('POST', '/api/crm/contracts', { ...validBody, organization_id: 121 }))).status).toBe(403);
  });

  it('firmantes inválidos → 400', async () => {
    process.env.DOCUMENSO_API_KEY = 'api_platform_key_abcdefghijklmnopqrstuvwxyz';
    expect((await contractsPost(req('POST', '/api/crm/contracts', { ...validBody, signers: [] }))).status).toBe(400);
    expect((await contractsPost(req('POST', '/api/crm/contracts', { ...validBody, signers: [{ name: 'x', email: 'no-es-email' }] }))).status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it('el proveedor rechaza → 502 con contract_id y la fila queda pending (sin fingir envío)', async () => {
    process.env.DOCUMENSO_API_KEY = 'api_platform_key_abcdefghijklmnopqrstuvwxyz';
    adapterFails = true;
    const res = await contractsPost(req('POST', '/api/crm/contracts', validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).contract_id).toBeTruthy();
    expect(writesTo('contract_signatures').filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('GET lista solo contratos de la organización', async () => {
    const json = await (await contractsGet(req('GET', '/api/crm/contracts?opportunity_id=op-1'))).json();
    expect(json.data.map((c: Row) => c.id).sort()).toEqual(['c-1', 'c-2']);
  });
});

describe('POST /api/crm/webhooks/documenso (fallo cerrado)', () => {
  const body = JSON.stringify({ event: 'DOCUMENT_COMPLETED', payload: { id: 'doc-1', recipients: [{ email: 'ana@x.co', signingStatus: 'SIGNED' }] } });
  const sig = (secret: string, b = body) => createHmac('sha256', secret).update(b).digest('hex');

  it('sin secreto configurado → 401 y ninguna escritura (aunque la firma "coincida" con un placeholder)', async () => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = 'your-documenso-webhook-secret';
    const res = await webhookPost(req('POST', '/api/crm/webhooks/documenso', body, { 'x-documenso-signature': sig('your-documenso-webhook-secret') }));
    expect(res.status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it('firma inválida → 401 sin escrituras; sin cabecera → 401', async () => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = WH_SECRET;
    expect((await webhookPost(req('POST', '/x', body, { 'x-documenso-signature': sig('otro_secreto_incorrecto_xxxxxxxx') }))).status).toBe(401);
    expect((await webhookPost(req('POST', '/x', body))).status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it('firma válida (secreto de la organización de la fila) → actualiza SOLO esa fila con id + organización y vincula la cotización', async () => {
    db.rows.provider_configs.push({ organization_id: 120, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: REAL_KEY, DOCUMENSO_WEBHOOK_SECRET: WH_SECRET } });
    const res = await webhookPost(req('POST', '/x', body, { 'x-documenso-signature': sig(WH_SECRET) }));
    expect(res.status).toBe(200);
    const upd = writesTo('contract_signatures').find((w) => w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'c-1', organization_id: 120, status: 'sent' });
    expect(upd?.row).toMatchObject({ status: 'signed', signed_at: expect.any(String) });
    expect((upd?.row as Row).signers).toEqual([{ name: 'Ana', email: 'ana@x.co', status: 'signed', signed_at: null }]);
    const quot = writesTo('quotations').find((w) => w.op === 'update');
    expect(quot?.filters).toMatchObject({ id: 'q-1', organization_id: 120 });
    expect(quot?.row).toEqual({ signature_id: 'c-1' });
    expect(db.rows.contract_signatures.find((c) => c.id === 'c-9')?.status).toBe('sent');
  });

  it('el secreto de otra organización no vale para la fila de esta', async () => {
    db.rows.provider_configs.push({ organization_id: 121, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: REAL_KEY, DOCUMENSO_WEBHOOK_SECRET: WH_SECRET } });
    const res = await webhookPost(req('POST', '/x', body, { 'x-documenso-signature': sig(WH_SECRET) }));
    expect(res.status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it('documento desconocido → 404; reenvío (signed → signed) → 409 sin escribir; retroceso (signed → viewed) → 409', async () => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = WH_SECRET;
    const unknown = JSON.stringify({ event: 'document.completed', document_id: 'nope' });
    expect((await webhookPost(req('POST', '/x', unknown, { 'x-documenso-signature': sig(WH_SECRET, unknown) }))).status).toBe(404);
    const replay = JSON.stringify({ event: 'document.completed', document_id: 'doc-2' });
    expect((await webhookPost(req('POST', '/x', replay, { 'x-documenso-signature': sig(WH_SECRET, replay) }))).status).toBe(409);
    const back = JSON.stringify({ event: 'document.viewed', document_id: 'doc-2' });
    expect((await webhookPost(req('POST', '/x', back, { 'x-documenso-signature': sig(WH_SECRET, back) }))).status).toBe(409);
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('un `status` libre en el body no se acepta; el `organization_id` del body se ignora (sale de la fila)', async () => {
    process.env.DOCUMENSO_WEBHOOK_SECRET = WH_SECRET;
    const free = JSON.stringify({ event: 'document.whatever', document_id: 'doc-1', status: 'signed', organization_id: 121 });
    expect((await webhookPost(req('POST', '/x', free, { 'x-documenso-signature': sig(WH_SECRET, free) }))).status).toBe(409);
    expect(db.writes.filter((w) => w.op === 'update')).toHaveLength(0);
  });

  it('JSON inválido → 400; la ruta histórica `/api/crm/contracts/webhook` es la misma implementación verificada', async () => {
    expect((await webhookPost(req('POST', '/x', '{no json'))).status).toBe(400);
    expect((await legacyWebhookPost(req('POST', '/x', body))).status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });
});
