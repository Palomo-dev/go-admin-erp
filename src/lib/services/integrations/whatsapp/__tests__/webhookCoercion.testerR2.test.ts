/// <reference types="jest" />
/**
 * F0-SEC r2 · tester · evidencia de los huecos H1/H2 en el servicio (no en la
 * ruta): por qué un `phone_number_id` numérico y una plantilla ajena dentro de
 * la entrada de A llegan a datos de B. Ver `webhook/__tests__/testerR2.f0sec.test.ts`.
 *
 *  - `findChannelByPhoneNumberId(123)` y `('123')` generan exactamente el mismo
 *    filtro PostgREST (`credentials->>phone_number_id=eq.123`): la firma de tipo
 *    `string` del método no protege nada en tiempo de ejecución.
 *  - `applyTemplateStatusUpdate` con `message_template_id` no filtra por
 *    organización ni por WABA: actualiza la plantilla de la organización 8 y
 *    pausa sus campañas aunque el webhook venga firmado por la organización 7.
 *  - `planWebhookAuthorization` dejaba pasar la entrada entera si UNA change
 *    resolvía a A (documentado como `test.failing` hasta que se cerró).
 *
 * F0-SEC r3 (constructor): H1/H2 cerrados. El plan resuelve POR CAMBIO y
 * normaliza los ids (`normalizeMetaId`); `applyTemplateStatusUpdate` exige
 * las organizaciones autorizadas y no consulta nada sin ellas. Los `test.failing`
 * pasan a `test` y las evidencias del hueco se reescriben como evidencias del
 * cierre. La primera (filtro PostgREST idéntico para 123 y "123") se conserva
 * tal cual: sigue siendo cierta y es la razón por la que la normalización va
 * en la ENTRADA del webhook (plan y procesamiento), no en el método del servicio.
 */
import { planWebhookAuthorization, type ResolvedChannel, type WebhookChannelResolver } from '../webhookAuthorization';
import { applyTemplateStatusUpdate } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';
import type { WhatsAppWebhookEntry } from '../whatsappCloudTypes';

// ─── H1: coerción en el filtro PostgREST ─────────────────────────────────────
const captured: Array<{ table: string; filters: string[] }> = [];
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const rec = { table, filters: [] as string[] };
      captured.push(rec);
      const builder = {
        select() { return builder; },
        eq(col: string, v: unknown) { rec.filters.push(`${col}=eq.${v}`); return builder; },
        // Misma implementación que postgrest-js: `${operator}.${value}` (interpola el valor en la URL).
        filter(col: string, op: string, v: unknown) { rec.filters.push(`${col}=${op}.${v}`); return builder; },
        then(resolve: (r: unknown) => void) { resolve({ data: [{ channel_id: 'ch-b', channels: { organization_id: 8 } }], error: null }); },
      };
      return builder;
    },
  }),
}));

import { whatsappCloudService } from '../whatsappCloudService';

describe('H1 · findChannelByPhoneNumberId no distingue 123 de "123"', () => {
  beforeEach(() => { captured.length = 0; });

  test('el filtro PostgREST es idéntico para number y string → resuelve el canal de la org 8', async () => {
    const asString = await whatsappCloudService.findChannelByPhoneNumberId('123');
    const asNumber = await whatsappCloudService.findChannelByPhoneNumberId(123 as unknown as string);
    expect(asString).toEqual({ channelId: 'ch-b', organizationId: 8 });
    expect(asNumber).toEqual({ channelId: 'ch-b', organizationId: 8 });
    const [q1, q2] = captured;
    expect(q1.filters).toEqual(q2.filters);
    expect(q2.filters).toContain('credentials->>phone_number_id=eq.123');
  });
});

// ─── H1/H2: el plan autoriza por entrada, el procesamiento va por change ────
const CH_A: ResolvedChannel = { channelId: 'ch-a', organizationId: 7, appSecret: 'app-secret-org-7-0123456789abcdef' };
const CH_B: ResolvedChannel = { channelId: 'ch-b', organizationId: 8, appSecret: 'app-secret-org-8-fedcba9876543210' };
function resolver(): WebhookChannelResolver & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async byPhoneNumberId(id) { calls.push(`phone:${id}`); return ({ 'pn-a': CH_A, '123': CH_B } as Record<string, ResolvedChannel>)[id] ?? null; },
    async byBusinessAccountId(id) { calls.push(`waba:${id}`); return id === 'waba-b' ? [CH_B] : []; },
  };
}
const msg = (phoneNumberId: unknown) => ({ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId }, messages: [] } });
const tplB = { field: 'message_template_status_update', value: { event: 'DISABLED', message_template_id: 'meta-tpl-of-org-8' } };

describe('planWebhookAuthorization · granularidad entrada vs change', () => {
  test('r3: un phone_number_id numérico SE consulta (normalizado a "123") y cuenta para el ámbito', async () => {
    const r = resolver();
    const entry = { id: 'waba-zz', changes: [msg('pn-a'), msg(123)] } as unknown as WhatsAppWebhookEntry;
    const plan = await planWebhookAuthorization({ object: 'whatsapp_business_account', entry: [entry] }, r, null);
    expect(r.calls).toContain('phone:123');
    expect(plan.kind).toBe('reject');
  });

  test('H1: {pn-a, 123 (number → B)} en una entrada → mixed_channels', async () => {
    const entry = { id: 'waba-zz', changes: [msg('pn-a'), msg(123)] } as unknown as WhatsAppWebhookEntry;
    const plan = await planWebhookAuthorization({ object: 'whatsapp_business_account', entry: [entry] }, resolver(), null);
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'mixed_channels' });
    expect((plan as { detail: string }).detail).toContain('7, 8');
  });

  test('H2: {mensaje de A, plantilla de B} con WABA desconocido → la change de plantilla se queda fuera; la de A sigue', async () => {
    const entry = { id: 'waba-desconocido', changes: [msg('pn-a'), tplB] } as unknown as WhatsAppWebhookEntry;
    const plan = await planWebhookAuthorization({ object: 'whatsapp_business_account', entry: [entry] }, resolver(), null);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: CH_A.appSecret, droppedEntryIndexes: [], organizationIds: [7] });
    expect(plan).toMatchObject({ droppedChanges: [{ entryIndex: 0, changeIndex: 1, reason: 'unknown_waba' }] });
    const entries = (plan as { entries: WhatsAppWebhookEntry[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].changes).toHaveLength(1);
    expect(entries[0].changes[0].field).toBe('messages');
  });

  test('H1: un phone_number_id de tipo inutilizable (objeto, booleano, decimal) no se consulta y se descarta', async () => {
    const r = resolver();
    const entry = { id: 'waba-zz', changes: [msg('pn-a'), msg({ $gt: 0 }), msg(true), msg(12.5)] } as unknown as WhatsAppWebhookEntry;
    const plan = await planWebhookAuthorization({ object: 'whatsapp_business_account', entry: [entry] }, r, null);
    // r4: los tipos inutilizables siguen sin consultarse; la consulta del WABA
    // de la entrada es la comprobación de coherencia número ↔ WABA (regla 1).
    expect(r.calls).toEqual(['phone:pn-a', 'waba:waba-zz']);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', droppedChanges: [
      { entryIndex: 0, changeIndex: 1, reason: 'invalid_phone_number_id' },
      { entryIndex: 0, changeIndex: 2, reason: 'invalid_phone_number_id' },
      { entryIndex: 0, changeIndex: 3, reason: 'invalid_phone_number_id' },
    ] });
    expect((plan as { entries: WhatsAppWebhookEntry[] }).entries[0].changes).toHaveLength(1);
  });
});

// ─── H2: applyTemplateStatusUpdate cruza organizaciones por meta_template_id ─
type Row = { id: string; organization_id: number; channel: string; metadata: Record<string, unknown> | null };
function fakeService(templates: Row[], campaigns: Array<{ id: string; organization_id: number; template_id: string; status: string; statistics: null }>) {
  const updates: Array<{ table: string; id: string; patch: Record<string, unknown> }> = [];
  const q = (rows: Array<Record<string, unknown>>) => {
    let list = rows;
    const b = {
      select() { return b; },
      eq(col: string, v: unknown) { list = list.filter((r) => (col.includes('->>') ? String(((r.metadata as Record<string, unknown>) ?? {})[col.split('->>')[1]]) : String(r[col])) === String(v)); return b; },
      in(col: string, vs: unknown[]) { list = list.filter((r) => vs.map(String).includes(String(r[col]))); return b; },
      limit() { return Promise.resolve({ data: list, error: null }); },
      then(res: (x: unknown) => void) { res({ data: list, error: null }); },
      update(patch: Record<string, unknown>) {
        return { eq: (_c: string, id: string) => { updates.push({ table: 'templates', id, patch }); return Promise.resolve({ error: null }); } };
      },
    };
    return b;
  };
  const service = { from: (table: string) => (table === 'templates' ? q(templates) : q(campaigns)) };
  return { service: service as never, updates };
}

const TPL_8 = { id: 'tpl-8', organization_id: 8, channel: 'whatsapp', metadata: { meta_template_id: 'meta-tpl-of-org-8', status: 'APPROVED', waba_id: 'waba-b' } };
const CAMP_8 = { id: 'camp-8', organization_id: 8, template_id: 'tpl-8', status: 'sending', statistics: null };
const DISABLE_TPL_8 = { event: 'DISABLED' as const, message_template_id: 'meta-tpl-of-org-8', message_template_name: null, message_template_language: null, reason: 'ABUSIVE_CONTENT', quality_score: null, field: 'message_template_status_update' as const };

describe('H2 · applyTemplateStatusUpdate exige las organizaciones autorizadas (r3)', () => {
  test('con el meta_template_id de la org 8 pero autorizado SOLO para la org 7 → no toca nada', async () => {
    const { service, updates } = fakeService([TPL_8], [CAMP_8]);
    const r = await applyTemplateStatusUpdate(DISABLE_TPL_8, null, service, [7]);
    expect(r).toEqual({ updated: 0, paused_campaigns: 0 });
    expect(updates).toEqual([]);
  });

  test('sin organizaciones autorizadas → no consulta ni toca nada (fail-closed)', async () => {
    const { service, updates } = fakeService([TPL_8], [CAMP_8]);
    const r = await applyTemplateStatusUpdate(DISABLE_TPL_8, 'waba-b', service, []);
    expect(r).toEqual({ updated: 0, paused_campaigns: 0 });
    expect(updates).toEqual([]);
  });

  test('autorizado para la org 8 (dueña del WABA) → actualiza su plantilla y pausa su campaña (camino feliz intacto)', async () => {
    const { service, updates } = fakeService([TPL_8], [CAMP_8]);
    const r = await applyTemplateStatusUpdate(DISABLE_TPL_8, 'waba-b', service, [8]);
    expect(r.updated).toBe(1);
    expect(updates[0]).toMatchObject({ table: 'templates', id: 'tpl-8' });
    expect((updates[0].patch.metadata as Record<string, unknown>).status).toBe('DISABLED');
  });
});
