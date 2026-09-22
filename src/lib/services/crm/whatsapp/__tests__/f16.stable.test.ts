/**
 * F16 · Consolidación de las rondas (2026-09-21) — helpers PUROS del módulo:
 * modo estricto de variables, HSM posicional, clasificación de errores y
 * estados del lote, claves de idempotencia/reclamación, esquemas y el coste
 * estimado por país.
 *
 * Casos únicos rescatados de: tester r1 (`testerR1.test.ts`), tester r2
 * (`testerR2.test.ts`), builder r3 (`round3.test.ts`), builder r4
 * (`round4.test.ts`), builder r6 (`round6.test.ts`). Lo que ya afirmaban
 * `campaignBatch.test.ts` y `templateRender.test.ts` se descartó.
 * El único contrato sobre el FUENTE que se conserva es el de la Edge Function
 * `channel-dispatch` (Deno: no se puede ejecutar en jest).
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderVariables, emptyContext } from '@/lib/services/crm/email/variables';
import { resolveParam, renderTemplateComponents, validateHsm } from '../templateRender';
import { classifySendError, planDelay, PER_RECIPIENT_MIN_MS, claimableAt, campaignClientRequestId, CLAIMABLE_STATE_FILTER, STALE_CLAIM_MS } from '../campaignBatch';
import { providerErrorAction } from '../campaignEvents';
import { countContacts } from '../campaignService';
import { estimateCampaignCost } from '../campaignMaterialize';
import { zCreateCampaignBody, zSendBody } from '../schemas';
import { WhatsAppError, contactState } from '../types';
import { rowPasses, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));

const ROOT = path.resolve(__dirname, '../../../../../..');
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const ctx = () => ({ ...emptyContext(), contact: { first_name: 'Ana' } }) as unknown as Parameters<typeof renderVariables>[1];

// ─── (a) modo estricto: las llaves que no son ruta válida NO salen literales (r3 · tester r2-bis) ──

describe('renderVariables strictPaths', () => {
  const casos = ['{{1}}', '{{2}}', '{{ 1 }}', '{{año}}', '{{nombre-cliente}}', '{{nombre cliente}}', '{{Nombre Completo}}'];
  for (const c of casos) {
    it(`B3.a · «${c}» no llega al cuerpo y se registra en missing`, () => {
      const r = renderVariables(`Hola ${c}, gracias.`, ctx(), { escapeHtml: false, strictPaths: true });
      expect(r.out).not.toContain('{{');
      expect(r.missing.length).toBeGreaterThan(0);
    });
  }

  it('B3.a · no rompe el caso normal ni el default; «{{nombre}}» (ruta válida sin valor) se marca faltante', () => {
    expect(renderVariables('Hola {{contact.first_name}}.', ctx(), { escapeHtml: false, strictPaths: true })).toMatchObject({ out: 'Hola Ana.', missing: [] });
    expect(renderVariables('Hola {{contact.company_name|tu empresa}}.', ctx(), { escapeHtml: false, strictPaths: true })).toMatchObject({ out: 'Hola tu empresa.', missing: [] });
    expect(renderVariables('Hola {{nombre}}, gracias.', ctx(), { escapeHtml: false, strictPaths: true }).missing).toContain('nombre');
  });
});

// ─── HSM posicional: el parámetro NO se resuelve al literal «{{custom.N}}» (r3 · tester r2-bis) ──

describe('templateRender · parámetros posicionales y validateHsm', () => {
  it('B3.b · resolveParam("1") devuelve null sin override y el valor del usuario con override', () => {
    expect(resolveParam('1', { variable_map: {} } as never, ctx() as never, {})).toBeNull();
    expect(resolveParam('1', { variable_map: {} } as never, ctx() as never, { 1: 'Laura' })).toBe('Laura');
  });

  it('B3.b · renderTemplateComponents con {{1}}/{{2}} los reporta como faltantes y no manda «{{» a Graph', () => {
    const t = { name: 'promo', body: 'Hola {{1}}, tu pedido {{2}} ya salio.', meta: { language: 'es', variable_map: {}, components: [{ type: 'BODY', text: 'Hola {{1}}, tu pedido {{2}} ya salio.' }] } };
    const out = renderTemplateComponents(t as never, ctx() as never, {});
    expect(out.missing.sort()).toEqual(['1', '2']);
    expect(out.values['1']).toBeUndefined();
    expect(JSON.stringify(out.payload)).not.toContain('{{');
  });

  it('B3.b · un valor que aún contiene «{{» no se acepta como resuelto (por mapa, por custom ni por override)', () => {
    const malicioso = { ...emptyContext(), custom: { nombre: 'Ana {{contact.email}}' } } as unknown as Parameters<typeof renderVariables>[1];
    expect(resolveParam('nombre', { variable_map: { nombre: 'custom.nombre' } } as never, malicioso as never, {})).toBeNull();
    expect(resolveParam('nombre', { variable_map: {} } as never, malicioso as never, {})).toBeNull();
    expect(resolveParam('nombre', { variable_map: {} } as never, malicioso as never, { nombre: 'Ana {{x}}' })).toBeNull();
  });

  it('B3.c · validateHsm acepta parámetros [a-z_][a-z0-9_]* y rechaza (422) posicionales, mayúsculas, guiones y acentos', () => {
    const body = (text: string) => ({ name: 'promo_1', components: [{ type: 'BODY' as const, text }] });
    expect(() => validateHsm(body('Hola {{nombre}}, tu pedido {{numero_pedido}} salio.'))).not.toThrow();
    for (const malo of ['{{1}}', '{{Nombre}}', '{{nombre-cliente}}', '{{año}}', '{{_x}}{{2}}']) {
      let err: unknown = null;
      try { validateHsm(body(`Hola ${malo} gracias por tu compra.`)); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(WhatsAppError);
      expect((err as WhatsAppError).status).toBe(422);
    }
  });
});

// ─── Estados, conteos y clasificación (tester r1) ────────────────────────────────

describe('estados y clasificación del lote', () => {
  it('T1.4 · MISSING_VARIABLES se mapea a skip/missing_variables', () => {
    expect(classifySendError(new WhatsAppError('MISSING_VARIABLES', 'faltan', 422), 1)).toEqual({ action: 'skip', reason: 'missing_variables' });
  });

  it('T1.3 · contactState: el avance guardado en metadata gana sobre la columna "sent"', () => {
    expect(contactState({ state: 'sent', metadata: { state: 'replied' } })).toBe('replied');
    expect(contactState({ state: 'sent', metadata: { state: 'read' } })).toBe('read');
    expect(contactState({ state: 'sent', metadata: null })).toBe('sent');
    expect(contactState({ state: 'replied', metadata: { state: 'replied' } })).toBe('replied');
    expect(contactState({ state: null, metadata: { state: 'skipped' } })).toBe('skipped');
    expect(contactState({ state: null, metadata: null })).toBe('pending');
  });

  it('T1.3 · countContacts: replied_at compensa el estado perdido en la columna', () => {
    const c = countContacts([
      { state: 'sent', metadata: { state: 'replied' }, replied_at: '2026-09-08T10:00:00Z' },
      { state: null, metadata: { state: 'skipped', skipped_reason: 'opted_out' } },
      { state: null, metadata: { state: 'failed' } },
      { state: null, metadata: { state: 'pending' } },
    ]);
    expect(c).toMatchObject({ total: 4, sent: 1, replied: 1, skipped: 1, failed: 1, pending: 1 });
  });

  it('T1.4 · providerErrorAction: 131048 también es rate_limited_24h; desconocido y null → failed', () => {
    expect(providerErrorAction('131048')).toEqual({ state: 'skipped', skipped_reason: 'rate_limited_24h' });
    expect(providerErrorAction('470')).toEqual({ state: 'failed' });
    expect(providerErrorAction(null)).toEqual({ state: 'failed' });
  });

  it('T1.4 · planDelay: sin historial 0; mismo destinatario ahora mismo = PER_RECIPIENT_MIN_MS; throttle se acota a [1, 80] mps', () => {
    expect(planDelay({ now: 1_000, lastGlobalAt: null, throttleMps: 10, lastToRecipientAt: null })).toBe(0);
    expect(planDelay({ now: 1_000, lastGlobalAt: null, throttleMps: 10, lastToRecipientAt: 1_000 })).toBe(PER_RECIPIENT_MIN_MS);
    expect(planDelay({ now: 0, lastGlobalAt: 0, throttleMps: 0, lastToRecipientAt: null })).toBe(1000);
    expect(planDelay({ now: 0, lastGlobalAt: 0, throttleMps: 10_000, lastToRecipientAt: null })).toBe(Math.ceil(1000 / 80));
  });
});

// ─── Claves y filtro de reclamación (r4 N-2/N-5 · r6 T11) ───────────────────────

describe('campaignBatch · claves y filtro de reclamación', () => {
  const NOW_MS = Date.parse('2026-09-10T15:00:00.000Z');

  it('B4.N2 · claimableAt es el único juez: pendiente sin backoff = ya; enviado = nunca; queued = claimed_at + STALE', () => {
    expect(claimableAt({ state: null, metadata: { state: 'pending' } })).toBe(0);
    expect(claimableAt({ state: null, metadata: { state: 'sent' } })).toBeNull();
    expect(claimableAt({ state: null, metadata: { state: 'queued', claimed_at: new Date(NOW_MS).toISOString() } })).toBe(NOW_MS + STALE_CLAIM_MS);
  });

  it('B4.N5 · la clave de idempotencia es la misma para (campaña, cliente) sea cual sea el intento', () => {
    expect(campaignClientRequestId(UUID_C, 'cust-1')).toBe(`campaign:${UUID_C}:cust-1`);
    expect(campaignClientRequestId(UUID_C, 'cust-1')).not.toMatch(/:\d+$/);
  });

  it('B6.T11 · el filtro de reclamación conserva la rama `metadata->>state.is.null`: `{}` (DEFAULT) y NULL pasan; skipped no', () => {
    expect(CLAIMABLE_STATE_FILTER).toContain('metadata->>state.in.(pending,queued)');
    expect(CLAIMABLE_STATE_FILTER).toContain('metadata->>state.is.null');
    const ops = [{ method: 'or', args: [CLAIMABLE_STATE_FILTER] }];
    const base = (metadata: unknown): Row => ({ id: 'a', campaign_id: UUID_C, customer_id: 'cust-a', state: null, replied_at: null, created_at: '', metadata });
    expect(rowPasses(base({}), ops)).toBe(true);
    expect(rowPasses(base(null), ops)).toBe(true);
    expect(rowPasses(base({ state: 'skipped' }), ops)).toBe(false);
  });

  it('B6.N5 · fakeTable.filter() evalúa match/imatch y LANZA con cualquier otro operador (no se traga filtros)', () => {
    const row: Row = { phone: '+57 310 987 6543' };
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'imatch', '6543$'] }])).toBe(true);
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'match', '^\\+57'] }])).toBe(true);
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'match', '^\\+1'] }])).toBe(false);
    expect(() => rowPasses(row, [{ method: 'filter', args: ['phone', 'ilike', '%6543'] }])).toThrow(/filter\(\) no soportado/);
    expect(() => rowPasses(row, [{ method: 'filter', args: ['phone', 'eq', 'x'] }])).toThrow(/filter\(\) no soportado/);
  });
});

// ─── El body nunca trae la organización: el esquema descarta la clave (r3) ──────

describe('schemas · organization_id en el body', () => {
  const body = { name: 'Masivo', channel: 'whatsapp', channel_id: UUID_A, template_id: null, content: 'hola', audience: { source: 'manual', customer_ids: [UUID_B] }, throttle_mps: 5, respect_allowed_hours: true, purpose: 'utility' };

  it('B3 · el esquema NO decide (readOrgBody respondió 403 antes) y descarta organization_id / orgId como desconocidas', () => {
    const r = zCreateCampaignBody.safeParse({ ...body, organization_id: 999 });
    expect(r.success).toBe(true);
    expect(r.success && 'organization_id' in r.data).toBe(false);
    const s = zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola', orgId: 7 });
    expect(s.success).toBe(true);
    expect(s.success && 'orgId' in s.data).toBe(false);
    expect(zCreateCampaignBody.safeParse(body).success).toBe(true);
    expect(zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola' }).success).toBe(true);
  });
});

// ─── El coste estimado usa el indicativo de la org, no «57» (r4 F-4) ────────────

describe('estimateCampaignCost', () => {
  it('B4.F4 · con indicativo 52 consulta la tarifa de México y con 57 la de Colombia', async () => {
    const { getUnitCost } = jest.requireMock('@/lib/services/crm/pricingService') as { getUnitCost: jest.Mock };
    getUnitCost.mockClear();
    const r = await estimateCampaignCost({ provider: 'meta', category: 'marketing', isTemplate: true, pending: 3, defaultCountry: '52' });
    expect(getUnitCost).toHaveBeenCalledWith('meta', 'wa_marketing_mx');
    expect(r).toBe(0.0375);
    await estimateCampaignCost({ provider: 'meta', category: 'utility', isTemplate: true, pending: 1, defaultCountry: '57' });
    expect(getUnitCost).toHaveBeenCalledWith('meta', 'wa_utility_co');
  });
});

// ─── Contrato sobre el fuente: la Edge Function no escribe event_time (tester r2 · F-1) ──

describe('channel-dispatch (Edge Function, Deno) · message_events.event_time es GENERATED ALWAYS', () => {
  it('T2.F1 · el INSERT no lleva event_time y se comprueba el error', () => {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/channel-dispatch/index.ts'), 'utf8');
    const i = src.indexOf('from("message_events").insert(');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).not.toMatch(/^\s*event_time:/m);
    expect(src.slice(i - 60, i)).toContain('error');
  });
});
