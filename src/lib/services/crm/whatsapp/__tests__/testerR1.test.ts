/**
 * Tests añadidos por el TESTER (ronda 1 de F16) para cubrir huecos detectados
 * al romper la implementación:
 *
 *  1. `MISSING_VARIABLES` en la rama de TEXTO PLANO (el test del builder solo
 *     cubría el camino feliz: su mock de `renderVariables` devolvía siempre
 *     `missing: []`, así que la mitad del bug B —no enviar el marcador cuando
 *     falta la variable— quedaba sin ejercitar).
 *  2. Reclamación concurrente de contactos en `campaignBatch` (dos lotes
 *     simultáneos reclaman el MISMO contacto → doble envío). Test rojo a
 *     propósito: documenta el defecto en `claimContacts`.
 *  3. `contactState` cuando la columna dice 'sent' y `metadata.state` dice
 *     'replied'.
 *  4. `providerErrorAction` / `planDelay` en los bordes.
 */

import { sendWhatsApp } from '../outboundService';
import { classifySendError, planDelay, PER_RECIPIENT_MIN_MS } from '../campaignBatch';
import { providerErrorAction } from '../campaignEvents';
import { contactState } from '../types';
import { countContacts } from '../campaignService';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/email/variables', () => ({
  buildContext: jest.fn(async () => ({ contact: { first_name: 'Laura' }, opportunity: {}, org: {}, custom: {} })),
  // Motor realista: lo que no se resuelve se acumula en `missing` (como F7).
  renderVariables: (tpl: string, ctx: Record<string, Record<string, unknown>>) => {
    const missing: string[] = [];
    const out = tpl.replace(/\{\{\s*([^}|]+)(?:\|([^}]*))?\s*\}\}/g, (_m, p: string, d?: string) => {
      const [a, b] = p.trim().split('.');
      const v = (ctx[a] as Record<string, unknown> | undefined)?.[b];
      if (v != null && v !== '') return String(v);
      if (d !== undefined) return d;
      missing.push(p.trim());
      return '';
    });
    return { out, missing };
  },
}));

const NOW = new Date('2026-09-08T15:00:00Z');
const OPEN = new Date(NOW.getTime() - 3600_000).toISOString();

function baseTables(overrides: Partial<Record<string, TableResolver>> = {}): Record<string, TableResolver> {
  return {
    customers: () => ({ data: { id: 'cust-1', full_name: 'Laura Gómez', first_name: 'Laura', phone: '+57 310 987 6543' } }),
    opportunities: () => ({ data: { id: 'opp-1', customer_id: 'cust-1' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas CO', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations: (ops) => (has(ops, 'select') && has(ops, 'order') ? { data: { id: 'conv-1', last_inbound_at: OPEN } } : has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1' } }),
    provider_configs: () => ({ data: null }),
    messages: (ops) => (has(ops, 'insert') ? { data: { id: 'msg-1', created_at: NOW.toISOString() } } : { data: [], count: 0 }),
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    templates: () => ({ data: null }),
    ...overrides,
  };
}
const rpcOk = () => ({ data: true });

describe('TESTER · texto plano con variables sin resolver', () => {
  test('variable inexistente → MISSING_VARIABLES y NO se inserta en messages', async () => {
    const { sb, calls } = makeSupabase(baseTables(), rpcOk);
    await expect(
      sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}, tu saldo es {{invoice.total}}' }, sb, sb, NOW),
    ).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  test('el literal {{...}} nunca llega a messages.content cuando falta la variable', async () => {
    const { sb, calls } = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}' }, sb, sb, NOW).catch(() => undefined);
    const inserts = calls.filter((c) => c.table === 'messages' && has(c.ops, 'insert'));
    for (const ins of inserts) {
      const row = opArg<Record<string, unknown>>(ins.ops, 'insert')!;
      expect(String(row.content)).not.toContain('{{');
    }
  });

  test('variable con default `|` se resuelve y no cuenta como faltante', async () => {
    const { sb, calls } = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.nickname|cliente}}' }, sb, sb, NOW);
    const row = opArg<Record<string, unknown>>(calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!.ops, 'insert')!;
    expect(row.content).toBe('Hola cliente');
  });

  test('MISSING_VARIABLES se mapea a skip/missing_variables en el lote', () => {
    const err = Object.assign(new Error('x'), { name: 'WhatsAppError' });
    // clasificación real con la clase del módulo
    const { WhatsAppError } = jest.requireActual('../types') as typeof import('../types');
    expect(classifySendError(new WhatsAppError('MISSING_VARIABLES', 'faltan', 422), 1)).toEqual({ action: 'skip', reason: 'missing_variables' });
    expect(err).toBeDefined();
  });
});

describe('TESTER · reclamación de contactos concurrente (CORREGIDO en r2)', () => {
  /**
   * Ronda 1 (defecto): `claimContacts` filtraba solo por `.is('state', null)`,
   * condición que no cambia al reclamar (el estado real vive en
   * `metadata.state`), así que dos lotes simultáneos reclamaban la misma fila
   * y la enviaban dos veces (E2E: `claimed 8 / claimed 8`, 16 mensajes para 8
   * destinatarios).
   *
   * Ronda 2 (corregido): el UPDATE lleva la condición sobre `metadata->>state`
   * (además de escribir un `claim_token`), que Postgres reevalúa bajo el lock
   * de la fila, así que solo uno de los dos UPDATE concurrentes actualiza.
   * Este test EXIGE ahora esa condición (antes exigía su ausencia).
   */
  test('el UPDATE de claim discrimina por metadata.state → reclamación atómica', async () => {
    const rows = [{ id: 'cc-1', customer_id: 'cust-1', state: null, metadata: { state: 'pending', recipient: '573109876543', attempts: 0 } }];
    const { sb, calls } = makeSupabase({
      campaigns: () => ({ data: { id: 'camp-1', organization_id: 7, name: 'c', channel: 'whatsapp', status: 'sending', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: { throttle_mps: 10, respect_allowed_hours: false }, created_by: null, created_at: '', updated_at: '' } }),
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: { id: 'cc-1' } } : { data: rows }),
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
      messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    const { default: mod } = { default: await import('../campaignBatch') };
    await mod.runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, {
      send: async () => ({ message_id: 'm1', conversation_id: 'c1', activity_id: null, customer_id: 'cust-1', channel_id: 'chan-1', scheduled: false }),
      sleep: async () => undefined,
      deadlineMs: 5_000,
    });
    const claimUpdate = calls.find((c) => c.table === 'campaign_contacts' && has(c.ops, 'update') && has(c.ops, 'is', 'state', null));
    expect(claimUpdate).toBeDefined();
    const filtersMetaState = claimUpdate!.ops.some((o) => String(o.args[0] ?? '').includes('metadata->>state'));
    expect(filtersMetaState).toBe(true);
    // …y la fila reclamada queda marcada con un claim_token propio del lote.
    const claimed = opArg<Record<string, unknown>>(claimUpdate!.ops, 'update')!;
    expect(String((claimed.metadata as Record<string, unknown>).claim_token)).toMatch(/^b1:/);
  });
});

describe('TESTER · estados y conteos', () => {
  // r1 documentaba el defecto (la columna 'sent' ganaba y 'replied' se perdía);
  // r2 lo corrige: el avance del ciclo guardado en metadata gana sobre 'sent'.
  test('contactState: metadata "replied" gana sobre la columna "sent"', () => {
    expect(contactState({ state: 'sent', metadata: { state: 'replied' } })).toBe('replied');
    expect(contactState({ state: 'sent', metadata: { state: 'read' } })).toBe('read');
    expect(contactState({ state: 'sent', metadata: null })).toBe('sent');
    expect(contactState({ state: 'replied', metadata: { state: 'replied' } })).toBe('replied');
    expect(contactState({ state: null, metadata: { state: 'skipped' } })).toBe('skipped');
    expect(contactState({ state: null, metadata: null })).toBe('pending');
  });

  test('countContacts: replied_at compensa el estado perdido', () => {
    const c = countContacts([
      { state: 'sent', metadata: { state: 'replied' }, replied_at: '2026-09-08T10:00:00Z' },
      { state: null, metadata: { state: 'skipped', skipped_reason: 'opted_out' } },
      { state: null, metadata: { state: 'failed' } },
      { state: null, metadata: { state: 'pending' } },
    ]);
    expect(c).toMatchObject({ total: 4, sent: 1, replied: 1, skipped: 1, failed: 1, pending: 1 });
  });

  test('providerErrorAction cubre 131048/131049/131056/130429 y desconocidos', () => {
    expect(providerErrorAction('131049')).toEqual({ state: 'skipped', skipped_reason: 'rate_limited_24h' });
    expect(providerErrorAction('131048')).toEqual({ state: 'skipped', skipped_reason: 'rate_limited_24h' });
    expect(providerErrorAction('131056')).toEqual({ state: 'pending', retry_after_ms: 6_000 });
    expect(providerErrorAction('130429')).toEqual({ state: 'pending', retry_after_ms: 30_000 });
    expect(providerErrorAction('470')).toEqual({ state: 'failed' });
    expect(providerErrorAction(null)).toEqual({ state: 'failed' });
  });

  test('planDelay respeta el mínimo por destinatario y el throttle global', () => {
    expect(planDelay({ now: 1_000, lastGlobalAt: null, throttleMps: 10, lastToRecipientAt: null })).toBe(0);
    expect(planDelay({ now: 1_000, lastGlobalAt: 950, throttleMps: 10, lastToRecipientAt: null })).toBe(50);
    expect(planDelay({ now: 1_000, lastGlobalAt: null, throttleMps: 10, lastToRecipientAt: 1_000 })).toBe(PER_RECIPIENT_MIN_MS);
    // throttle fuera de rango se acota a [1, 80] mps
    expect(planDelay({ now: 0, lastGlobalAt: 0, throttleMps: 0, lastToRecipientAt: null })).toBe(1000);
    expect(planDelay({ now: 0, lastGlobalAt: 0, throttleMps: 10_000, lastToRecipientAt: null })).toBe(Math.ceil(1000 / 80));
  });
});
