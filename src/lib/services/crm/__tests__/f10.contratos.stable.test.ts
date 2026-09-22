/// <reference types="jest" />
/**
 * F10 — `contractService` a nivel de servicio, lo que el contrato de ruta
 * (`f10Contracts.contract`) no afirmaba: el webhook de Documenso no es un
 * oráculo de existencia (documento desconocido → 401 salvo firma de plataforma
 * válida), el UPDATE condicionado por `status` que no afecta filas (carrera
 * entre dos webhooks) → 409 sin vincular la cotización, y «signed» a mano que
 * enlaza `quotations.signature_id` filtrando por organización (viewed no).
 * Consolidado el 2026-09-21 desde los testers r1 (`f10Round1Tester` C6/C8),
 * r2 (`f10Round2Tester` E2) y r4 (`f10Round4TesterB` C3). Sin datos reales.
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import { processDocumensoWebhook, updateContractStatus } from '@/lib/services/crm/contractService';

let db: FakeDb;
const ORG_SECRET = 'secret-org-120-0123456789abcdef';

function seed(): FakeDb {
  return {
    writes: [],
    rows: {
      contract_signatures: [
        { id: 'ct-1', organization_id: 120, opportunity_id: 'op-1', quotation_id: 'q-1', provider: 'documenso', provider_document_id: 'doc-120', status: 'sent', signers: [{ name: 'A', email: 'a@example.com' }] },
        { id: 'ct-9', organization_id: 121, opportunity_id: 'op-9', quotation_id: null, provider: 'documenso', provider_document_id: 'doc-121', status: 'sent', signers: [{ name: 'B', email: 'b@example.com' }] },
      ],
      provider_configs: [
        { id: 'pc-120', organization_id: 120, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: 'api_realkey_0123456789abcdef', DOCUMENSO_WEBHOOK_SECRET: ORG_SECRET }, priority: 10 },
        { id: 'pc-121', organization_id: 121, category: 'esign', provider: 'documenso', is_active: true, credentials: { DOCUMENSO_API_KEY: 'api_realkey_zzzzzzzzzzzzzzzz', DOCUMENSO_WEBHOOK_SECRET: 'secret-org-121-0123456789abcdef' }, priority: 10 },
      ],
      quotations: [{ id: 'q-1', organization_id: 120, signature_id: null }, { id: 'q-9', organization_id: 121, signature_id: null }],
      activities: [],
    },
  };
}
const client = () => createFakeSupabase(db);
const headersFor = (secret: string) => ({ 'x-documenso-signature': null, 'x-documenso-secret': secret });
const quotationWrites = () => db.writes.filter((w) => w.table === 'quotations');

beforeEach(() => { db = seed(); });

describe('webhook de Documenso (tester r1 T-C)', () => {
  it('C6 documento desconocido → 401 si la firma no verifica con el secreto de plataforma (sin oráculo de existencia); 404 solo con firma de plataforma válida', async () => {
    const body = JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'no-existe' });
    expect((await processDocumensoWebhook(body, headersFor('lo-que-sea-0123456789abcdef'), { serviceClient: client() as never, env: {} })).status).toBe(401);
    const env = { DOCUMENSO_API_KEY: 'api_platform_0123456789abcdef', DOCUMENSO_WEBHOOK_SECRET: 'secret-platform-0123456789abcdef' };
    expect((await processDocumensoWebhook(body, headersFor(ORG_SECRET), { serviceClient: client() as never, env })).status).toBe(401);
    expect((await processDocumensoWebhook(body, headersFor('secret-platform-0123456789abcdef'), { serviceClient: client() as never, env })).status).toBe(404);
    expect(db.writes).toEqual([]);
  });

  it('C8 el UPDATE condicionado por `status` que no afecta filas (carrera entre dos webhooks) → 409 y no se vincula la cotización', async () => {
    const base = client();
    // Entre la lectura y el UPDATE otro webhook ya firmó: la fila deja de coincidir con eq(status,'sent').
    // (se sustituye el objeto: el doble devuelve referencias vivas y mutarlo cambiaría también lo leído por el servicio)
    let armed = true;
    const patched = { ...base, from: (t: string) => { const c = base.from(t); if (t === 'contract_signatures' && armed) { const upd = c.update as (r: Record<string, unknown>) => unknown; c.update = (r: Record<string, unknown>) => { armed = false; db.rows.contract_signatures[0] = { ...db.rows.contract_signatures[0], status: 'signed' }; return upd(r); }; } return c; } };
    const out = await processDocumensoWebhook(JSON.stringify({ event: 'DOCUMENT_COMPLETED', document_id: 'doc-120' }), headersFor(ORG_SECRET), { serviceClient: patched as never, env: {} });
    expect(out.status).toBe(409);
    expect(quotationWrites()).toHaveLength(0);
  });
});

describe('firma manual (testers r2 E2 / r4 C3)', () => {
  it('«viewed» a mano no enlaza; «signed» vincula quotations.signature_id como el webhook, filtrando por organización (el señuelo q-9 no se toca); sin quotation_id no toca quotations', async () => {
    await updateContractStatus('ct-1', 120, 'viewed', client() as never, { userId: 'u-1' });
    expect(quotationWrites()).toHaveLength(0);
    const r = await updateContractStatus('ct-1', 120, 'signed', client() as never, { userId: 'u-1' });
    expect(r?.status).toBe('signed');
    expect(db.rows.quotations[0].signature_id).toBe('ct-1');
    expect(quotationWrites()[0]).toMatchObject({ op: 'update', filters: { id: 'q-1', organization_id: 120 }, row: { signature_id: 'ct-1' } });
    expect(db.rows.quotations[1].signature_id).toBeNull();
    db = seed();
    db.rows.contract_signatures[0].quotation_id = null;
    await updateContractStatus('ct-1', 120, 'signed', client() as never, { userId: 'u-1' });
    expect(quotationWrites()).toHaveLength(0);
    expect(db.rows.activities).toHaveLength(1);
  });
});
