/**
 * F16 · Consolidación de las rondas (2026-09-21) — CAMPAÑA y PLANTILLAS fuera
 * del lote: invalidación de la materialización en el PATCH (#3, F-13),
 * reapertura por reintento del proveedor (#4), edición de una plantilla
 * importada de Meta (N-6) y el webhook Cloud/QR con teléfonos (F-1, F-4).
 *
 * Casos únicos rescatados de: builder r2 (`round2.test.ts`), builder r3
 * (`round3.test.ts`), builder r4 (`round4.test.ts`). Los contratos sobre el
 * fuente de `testerR2.test.ts` (event_time, normalizePhoneDigits en
 * findOrCreateCustomer, isStaleClaim) se descartaron: aquí se ejecuta el
 * comportamiento que aquellos solo leían.
 */
import { updateCampaign, sameAudience } from '../campaignStore';
import { applyMessageEventToCampaign, reopenCampaignForRetry } from '../campaignEvents';
import { updateHsm } from '../templateService';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const enqueueJob = jest.fn(async (input: Record<string, unknown>) => (void input, 'job-1'));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (input: Record<string, unknown>) => enqueueJob(input) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: async () => null }));

beforeEach(() => enqueueJob.mockClear());

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

// ─── #3 · el PATCH del compositor masivo no invalida la materialización (r2) ────

describe('updateCampaign · materialized_at', () => {
  const AUDIENCE = { source: 'manual' as const, segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: ['b5f1e4e5-1111-4111-8111-111111111111'], customer_ids: [] };
  const base = { id: 'camp-1', organization_id: 7, name: 'Masivo', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: { audience: AUDIENCE, materialized_at: '2026-09-08T10:00:00Z', pending: 4, purpose: 'utility' }, created_by: null, created_at: '', updated_at: '' };
  const mk = () => makeSupabase({
    campaigns: (ops) => (has(ops, 'update') ? { data: { ...base, statistics: opArg<Record<string, unknown>>(ops, 'update')!.statistics } } : { data: base }),
    templates: () => ({ data: { id: 't', channel: 'whatsapp' } }),
    channels: () => ({ data: { id: 'chan-1' } }),
    segments: () => ({ data: { id: 's' } }),
  });
  const statsEscritas = (calls: ReturnType<typeof mk>['calls']) => opArg<Record<string, unknown>>(calls.find((c) => c.table === 'campaigns' && has(c.ops, 'update'))!.ops, 'update')!.statistics as Record<string, unknown>;

  it('B2.3 · misma audiencia y misma plantilla → materialized_at intacto', async () => {
    const { sb, calls } = mk();
    await updateCampaign(7, 'camp-1', { name: 'Masivo (2)', audience: { ...AUDIENCE }, template_id: null, content: 'hola' }, sb);
    expect(statsEscritas(calls).materialized_at).toBe('2026-09-08T10:00:00Z');
  });

  it('B2.3 · audiencia distinta, plantilla distinta o purpose distinto → materialized_at se anula', async () => {
    const patches = [
      { audience: { ...AUDIENCE, opportunity_ids: ['b5f1e4e5-2222-4222-8222-222222222222'] } },
      { template_id: 'b5f1e4e5-3333-4333-8333-333333333333' },
      { purpose: 'marketing' as const },
    ];
    for (const patch of patches) {
      const { sb, calls } = mk();
      await updateCampaign(7, 'camp-1', patch, sb);
      expect(statsEscritas(calls).materialized_at).toBeNull();
    }
  });

  it('B2.3 · sameAudience ignora el orden de los ids y distingue source', () => {
    expect(sameAudience({ source: 'manual', customer_ids: ['a', 'b'] }, { source: 'manual', customer_ids: ['b', 'a'] })).toBe(true);
    expect(sameAudience({ source: 'manual', customer_ids: ['a'] }, { source: 'manual', customer_ids: ['a', 'b'] })).toBe(false);
    expect(sameAudience({ source: 'stage', stage_ids: ['s1'] }, { source: 'segment', segment_id: 's1' })).toBe(false);
  });

  // F-13 (tester r2): la ventana de 24 h se calcula POR CANAL y el proveedor
  // (QR o no) sale del canal; cambiar channel_id lanzaba la campaña con
  // contactos calculados contra OTRO canal (3 pending → 3 skipped:window_required).
  const conCanal = (channelDevuelto: string) => {
    const stats = { audience: { source: 'manual', segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: [], customer_ids: [UUID_B] }, channel_id: UUID_A, materialized_at: '2026-09-09T00:00:00.000Z', pending: 3, purpose: 'utility' };
    const row = { id: UUID_C, organization_id: 2, name: 'C', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: stats, created_by: null, created_at: '', updated_at: '' };
    const escrito: { statistics?: { materialized_at?: string | null; channel_id?: string | null } } = {};
    const { sb } = makeSupabase({
      campaigns: (ops) => {
        const upd = ops.find((o) => o.method === 'update');
        if (!upd) return { data: row };
        Object.assign(escrito, upd.args[0]);
        return { data: { ...row, statistics: escrito.statistics } };
      },
      channels: () => ({ data: { id: channelDevuelto } }),
    });
    return { sb, escrito };
  };

  it('B3.F13 · cambiar channel_id anula materialized_at; reenviar el MISMO channel_id no invalida nada', async () => {
    const a = conCanal(UUID_B);
    await updateCampaign(2, UUID_C, { channel_id: UUID_B }, a.sb);
    expect(a.escrito.statistics).toMatchObject({ channel_id: UUID_B, materialized_at: null });
    const b = conCanal(UUID_A);
    await updateCampaign(2, UUID_C, { channel_id: UUID_A }, b.sb);
    expect(b.escrito.statistics?.materialized_at).toBe('2026-09-09T00:00:00.000Z');
  });
});

// ─── #4 · un reintento sobre una campaña cerrada la reabre (r2) ─────────────────

describe('campaignEvents · reapertura por 131056', () => {
  it('B2.4 · 131056 con la campaña en sent → encola el lote next_batch_no y vuelve a sending', async () => {
    const contact = { id: 'cc-1', campaign_id: 'camp-1', customer_id: 'cust-1', state: 'sent', metadata: { state: 'sent', message_id: 'msg-1', attempts: 1 }, replied_at: null };
    const closed = { id: 'camp-1', organization_id: 7, status: 'sent', statistics: { next_batch_no: 4, finished_at: '2026-09-08T09:00:00Z' } };
    const { sb, calls } = makeSupabase({
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: null } : { data: contact }),
      campaigns: () => ({ data: closed }),
      contact_consents: () => ({ data: null }),
    });
    const r = await applyMessageEventToCampaign({ message_id: 'msg-1', event_type: 'failed', error_code: '131056' }, sb);
    expect(r).toMatchObject({ applied: true, state: 'pending' });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const job = enqueueJob.mock.calls[0][0] as { kind: string; payload: Record<string, unknown> };
    expect(job.kind).toBe('campaign_batch');
    expect(job.payload).toEqual({ campaign_id: 'camp-1', batch_no: 4 });
    const reopened = calls.filter((c) => c.table === 'campaigns' && has(c.ops, 'update')).pop()!;
    expect(opArg<Record<string, unknown>>(reopened.ops, 'update')!.status).toBe('sending');
  });

  it('B2.4 · una campaña que sigue enviando o está cancelada no se reabre ni encola nada', async () => {
    const enviando = makeSupabase({ campaigns: () => ({ data: { id: 'camp-1', organization_id: 7, status: 'sending', statistics: {} } }) });
    expect(await reopenCampaignForRetry('camp-1', new Date(), enviando.sb)).toEqual({ reopened: false });
    const cancelada = makeSupabase({ campaigns: () => ({ data: { id: 'camp-1', organization_id: 7, status: 'sent', statistics: { state: 'canceled' } } }) });
    expect(await reopenCampaignForRetry('camp-1', new Date(), cancelada.sb)).toEqual({ reopened: false });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

// ─── N-6 · una plantilla importada de Meta se puede ARREGLAR (r4) ───────────────

const IMPORTADA = {
  id: 'tpl-meta', organization_id: 7, name: 'recordatorio_cita', description: null, body_html: 'Hola {{1}}, te esperamos el {{2}}.', is_active: true, created_at: '', updated_at: '',
  metadata: { provider: 'meta', status: 'DRAFT', category: 'utility', language: 'es', parameter_format: 'positional', components: [{ type: 'BODY', text: 'Hola {{1}}, te esperamos el {{2}}.' }], variable_map: {}, meta_template_id: null },
};

describe('updateHsm · plantilla importada', () => {
  const tablas = (guardado: { row?: Record<string, unknown> } = {}) => makeSupabase({
    templates: (ops) => {
      if (has(ops, 'update')) {
        guardado.row = opArg<Record<string, unknown>>(ops, 'update');
        return { data: { ...IMPORTADA, metadata: { ...IMPORTADA.metadata, ...(guardado.row?.metadata as Record<string, unknown>) } } };
      }
      return { data: IMPORTADA };
    },
  });

  it('B4.N6 · editar solo variable_map, categoría o descripción NO valida los componentes (es lo único que la hace enviable)', async () => {
    const t = await updateHsm(7, 'tpl-meta', { variable_map: { '1': 'contact.first_name', '2': 'custom.fecha' } }, tablas().sb);
    expect(t.meta.variable_map).toMatchObject({ '1': 'contact.first_name', '2': 'custom.fecha' });
    await expect(updateHsm(7, 'tpl-meta', { category: 'marketing' }, tablas().sb)).resolves.toBeDefined();
    await expect(updateHsm(7, 'tpl-meta', { description: 'importada de Meta' }, tablas().sb)).resolves.toBeDefined();
  });

  it('B4.N6 · si se TOCAN los componentes la validación vuelve; un nombre inválido se rechaza aunque no cambien', async () => {
    await expect(updateHsm(7, 'tpl-meta', { components: [{ type: 'BODY', text: 'Hola {{Nombre}}, mal parámetro.' }] }, tablas().sb)).rejects.toMatchObject({ code: 'INVALID_COMPONENTS' });
    await expect(updateHsm(7, 'tpl-meta', { name: 'Nombre Inválido' }, tablas().sb)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

// ─── F-1 / F-4 · el webhook Cloud/QR: event_time y teléfonos (r3 · r4) ──────────

type ProveedorConAlta = { findOrCreateCustomer: (s: unknown, org: number, ch: string, phone: string, name: string) => Promise<string> };

describe('whatsappCloudService / whatsappQrService', () => {
  it('B3.F1 · processStatusUpdate no manda event_time (GENERATED ALWAYS) y NO se traga el error del insert', async () => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    let inserted: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      messages: (ops) => (has(ops, 'update') ? { data: null } : { data: { id: UUID_A, metadata: {} } }),
      message_events: (ops) => { inserted = opArg<Record<string, unknown>>(ops, 'insert') ?? null; return { data: null, error: { message: 'cannot insert a non-DEFAULT value into column "event_time"' } }; },
      campaign_contacts: () => ({ data: [] }),
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await (whatsappCloudService as unknown as { processStatusUpdate: (s: unknown, org: number, st: unknown) => Promise<void> }).processStatusUpdate(sb, 7, { id: 'wamid.X', status: 'delivered', timestamp: '1757500000', recipient_id: '573109876543' });
    expect(inserted).not.toBeNull();
    expect(Object.keys(inserted as unknown as Record<string, unknown>)).not.toContain('event_time');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  const existente = (extra: Record<string, TableResolver> = {}) => {
    const estado = { inserted: false };
    const { sb } = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      customers: (ops) => { if (has(ops, 'insert')) { estado.inserted = true; return { data: { id: 'nuevo' } }; } return { data: [{ id: 'cust-existente', phone: '+57 310 987 6543' }] }; },
      ...extra,
    });
    return { sb, estado };
  };

  it('B3.F4 · el webhook Cloud encuentra al cliente guardado como «+57 310 987 6543» y no lo duplica', async () => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    const { sb, estado } = existente();
    await expect((whatsappCloudService as unknown as ProveedorConAlta).findOrCreateCustomer(sb, 7, UUID_A, '573109876543', 'Ana')).resolves.toBe('cust-existente');
    expect(estado.inserted).toBe(false);
  });

  it('B3.F4 · el proveedor QR (gemelo copiado) tampoco duplica clientes', async () => {
    const { whatsappQrService } = await import('@/lib/services/integrations/whatsapp/whatsappQrService');
    const { sb, estado } = existente({ branches: () => ({ data: { id: 1 } }) });
    await expect((whatsappQrService as unknown as ProveedorConAlta).findOrCreateCustomer(sb, 7, UUID_A, '573109876543', 'Ana')).resolves.toBe('cust-existente');
    expect(estado.inserted).toBe(false);
  });

  const altaDesdeProveedor = async (phone: string): Promise<string | undefined> => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    let insertado: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      customers: (ops) => { if (has(ops, 'insert')) { insertado = opArg<Record<string, unknown>>(ops, 'insert') ?? null; return { data: { id: 'nuevo' } }; } return { data: [] }; },
    });
    await (whatsappCloudService as unknown as ProveedorConAlta).findOrCreateCustomer(sb, 7, 'chan-1', phone, 'Ann');
    return (insertado as unknown as { phone?: string } | null)?.phone;
  };

  it('B4.F4 · el identificador que llega del PROVEEDOR se guarda tal cual, sin añadirle indicativo (ni al colombiano ni al de EE.UU.)', async () => {
    await expect(altaDesdeProveedor('3109876543')).resolves.toBe('+3109876543');
    await expect(altaDesdeProveedor('4155550100')).resolves.toBe('+4155550100');
  });
});
