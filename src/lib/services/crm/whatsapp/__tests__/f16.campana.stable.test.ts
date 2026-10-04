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
  const mk = () => makeSupabase({ campaigns: () => ({ data: base }) }, (_fn, args) => ({
    data: { ...base, ...(args.p_values as Record<string, unknown>) },
  }));
  const statsEscritas = (calls: ReturnType<typeof mk>['rpcCalls']) =>
    (calls.at(-1)!.args.p_values as Record<string, unknown>).statistics as Record<string, unknown>;

  it('B2.3 · misma audiencia y misma plantilla → materialized_at intacto', async () => {
    const { sb, rpcCalls } = mk();
    await updateCampaign(7, 'camp-1', { name: 'Masivo (2)', audience: { ...AUDIENCE }, template_id: null, content: 'hola' }, sb, UUID_A, sb);
    expect(statsEscritas(rpcCalls).materialized_at).toBe('2026-09-08T10:00:00Z');
  });

  it('B2.3 · audiencia distinta, plantilla distinta o purpose distinto → materialized_at se anula', async () => {
    const patches = [
      { audience: { ...AUDIENCE, opportunity_ids: ['b5f1e4e5-2222-4222-8222-222222222222'] } },
      { template_id: 'b5f1e4e5-3333-4333-8333-333333333333' },
      { purpose: 'marketing' as const },
    ];
    for (const patch of patches) {
      const { sb, rpcCalls } = mk();
      await updateCampaign(7, 'camp-1', patch, sb, UUID_A, sb);
      expect(statsEscritas(rpcCalls).materialized_at).toBeNull();
    }
  });

  it('B2.3 · sameAudience ignora el orden de los ids y distingue source', () => {
    expect(sameAudience({ source: 'manual', customer_ids: ['a', 'b'] }, { source: 'manual', customer_ids: ['b', 'a'] })).toBe(true);
    expect(sameAudience({ source: 'manual', customer_ids: ['a'] }, { source: 'manual', customer_ids: ['a', 'b'] })).toBe(false);
    expect(sameAudience({ source: 'stage', stage_ids: ['s1'] }, { source: 'segment', segment_id: 's1' })).toBe(false);
  });

  it('compara únicamente los campos activos de cada origen y conserva las diferencias de pipeline y destinatarios', () => {
    expect(sameAudience({ source: 'stage', pipeline_id: 'p1', stage_ids: ['s2', 's1'], customer_ids: ['inactivo'] },
      { source: 'stage', pipeline_id: 'p1', stage_ids: ['s1', 's2'] })).toBe(true);
    expect(sameAudience({ source: 'stage', pipeline_id: 'p1', stage_ids: ['s1'] },
      { source: 'stage', pipeline_id: 'p2', stage_ids: ['s1'] })).toBe(false);
    expect(sameAudience({ source: 'manual', customer_ids: ['a'], segment_id: 'inactivo', pipeline_id: 'inactivo' },
      { source: 'manual', customer_ids: ['a'] })).toBe(true);
    expect(sameAudience({ source: 'manual', customer_ids: ['a'], opportunity_ids: ['o1'] },
      { source: 'manual', customer_ids: ['a'], opportunity_ids: ['o2'] })).toBe(false);
  });

  // F-13 (tester r2): la ventana de 24 h se calcula POR CANAL y el proveedor
  // (QR o no) sale del canal; cambiar channel_id lanzaba la campaña con
  // contactos calculados contra OTRO canal (3 pending → 3 skipped:window_required).
  const conCanal = (channelDevuelto: string) => {
    const stats = { audience: { source: 'manual', segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: [], customer_ids: [UUID_B] }, channel_id: UUID_A, materialized_at: '2026-09-09T00:00:00.000Z', pending: 3, purpose: 'utility' };
    const row = { id: UUID_C, organization_id: 2, name: 'C', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: stats, created_by: null, created_at: '', updated_at: '' };
    const escrito: { statistics?: { materialized_at?: string | null; channel_id?: string | null } } = {};
    const { sb } = makeSupabase({ campaigns: () => ({ data: row }) }, (_fn, args) => {
      Object.assign(escrito, args.p_values);
      return { data: { ...row, statistics: escrito.statistics } };
    });
    void channelDevuelto;
    return { sb, escrito };
  };

  it('B3.F13 · cambiar channel_id anula materialized_at; reenviar el MISMO channel_id no invalida nada', async () => {
    const a = conCanal(UUID_B);
    await updateCampaign(2, UUID_C, { channel_id: UUID_B }, a.sb, UUID_A, a.sb);
    expect(a.escrito.statistics).toMatchObject({ channel_id: UUID_B, materialized_at: null });
    const b = conCanal(UUID_A);
    await updateCampaign(2, UUID_C, { channel_id: UUID_A }, b.sb, UUID_A, b.sb);
    expect(b.escrito.statistics?.materialized_at).toBe('2026-09-09T00:00:00.000Z');
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

  // Cloud usa recepción transaccional; su contrato completo está en recepcionCloud.test.ts.

  it('B3.F4 · el proveedor QR (gemelo copiado) tampoco duplica clientes', async () => {
    const { whatsappQrService } = await import('@/lib/services/integrations/whatsapp/whatsappQrService');
    const { sb, estado } = existente({ branches: () => ({ data: { id: 1 } }) });
    await expect((whatsappQrService as unknown as ProveedorConAlta).findOrCreateCustomer(sb, 7, UUID_A, '573109876543', 'Ana')).resolves.toBe('cust-existente');
    expect(estado.inserted).toBe(false);
  });

});
