/**
 * FASE-16 · ronda 3 — pruebas que MUERDEN para los defectos abiertos del
 * tester r2: (a) parámetros literales, F-1 (`event_time` GENERATED ALWAYS),
 * F-2 (lote muerto que encadena trabajos sin fin), F-4 (normalización de
 * teléfonos) y F-13 (cambio de canal sin invalidar la materialización).
 *
 * A diferencia de `testerR2.test.ts` (que fija el comportamiento DEFECTUOSO),
 * este archivo afirma el comportamiento CORRECTO: con el código de la ronda 2
 * cada uno de estos tests falla.
 *
 * F-12 (auto-respuesta de IA sin ventana ni opt-out) vive en
 * `src/app/api/chat/ai/auto-response/__tests__/` porque necesita mockear
 * módulos de Next.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderVariables, emptyContext } from '@/lib/services/crm/email/variables';
import { resolveParam, renderTemplateComponents, validateHsm } from '../templateRender';
import { normalizePhoneDigits } from '../channelService';
import { runCampaignBatch } from '../campaignBatch';
import { updateCampaign } from '../campaignStore';
import { zCreateCampaignBody, zSendBody } from '../schemas';
import { makeSupabase, has, opArg, type Op, type TableResolver } from './mockSupabase';
import { WhatsAppError } from '../types';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const enqueueJob = jest.fn(async () => 'job-1');
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: () => enqueueJob() }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: async () => null }));

beforeEach(() => enqueueJob.mockClear());

const ROOT = path.resolve(__dirname, '../../../../../..');
const readSrc = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctx = () => ({ ...emptyContext(), contact: { first_name: 'Ana' } }) as unknown as Parameters<typeof renderVariables>[1];

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

// ─────────────────────────────────────────────────────────────────────────────
// (a) PARÁMETROS LITERALES
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r3 · (a) las llaves que no son ruta válida NO salen literales', () => {
  const casos = ['{{1}}', '{{2}}', '{{ 1 }}', '{{año}}', '{{nombre-cliente}}', '{{nombre cliente}}', '{{Nombre Completo}}'];
  for (const c of casos) {
    it(`«${c}» no llega al cuerpo y se registra en missing`, () => {
      const r = renderVariables(`Hola ${c}, gracias.`, ctx(), { escapeHtml: false, strictPaths: true });
      expect(r.out).not.toContain('{{');
      expect(r.missing.length).toBeGreaterThan(0);
    });
  }

  it('no rompe el caso normal: una ruta válida con valor se sustituye', () => {
    const r = renderVariables('Hola {{contact.first_name}}.', ctx(), { escapeHtml: false, strictPaths: true });
    expect(r.out).toBe('Hola Ana.');
    expect(r.missing).toEqual([]);
  });

  it('no rompe el default: una ruta válida sin valor usa su fallback', () => {
    const r = renderVariables('Hola {{contact.company_name|tu empresa}}.', ctx(), { escapeHtml: false, strictPaths: true });
    expect(r.out).toBe('Hola tu empresa.');
    expect(r.missing).toEqual([]);
  });
});

describe('F16 r3 · (a) HSM posicional: el parámetro NO se resuelve al literal «{{custom.N}}»', () => {
  it('resolveParam("1") devuelve null', () => {
    expect(resolveParam('1', { variable_map: {} } as never, ctx() as never, {})).toBeNull();
  });

  it('resolveParam("1") con override SÍ devuelve el valor del usuario', () => {
    expect(resolveParam('1', { variable_map: {} } as never, ctx() as never, { 1: 'Laura' })).toBe('Laura');
  });

  it('renderTemplateComponents con {{1}}/{{2}} los reporta como faltantes y no manda «{{» a Graph', () => {
    const t = {
      name: 'promo',
      body: 'Hola {{1}}, tu pedido {{2}} ya salio.',
      meta: { language: 'es', variable_map: {}, components: [{ type: 'BODY', text: 'Hola {{1}}, tu pedido {{2}} ya salio.' }] },
    };
    const out = renderTemplateComponents(t as never, ctx() as never, {});
    expect(out.missing.sort()).toEqual(['1', '2']);
    expect(out.values['1']).toBeUndefined();
    expect(JSON.stringify(out.payload)).not.toContain('{{');
  });

  it('(b) un valor que aún contiene «{{» no se acepta como resuelto', () => {
    const malicioso = { ...emptyContext(), custom: { nombre: 'Ana {{contact.email}}' } } as unknown as Parameters<typeof renderVariables>[1];
    expect(resolveParam('nombre', { variable_map: { nombre: 'custom.nombre' } } as never, malicioso as never, {})).toBeNull();
    expect(resolveParam('nombre', { variable_map: {} } as never, malicioso as never, {})).toBeNull();
    expect(resolveParam('nombre', { variable_map: {} } as never, malicioso as never, { nombre: 'Ana {{x}}' })).toBeNull();
  });
});

describe('F16 r3 · (c) validateHsm rechaza parámetros fuera de [a-z_][a-z0-9_]*', () => {
  const body = (text: string) => ({ name: 'promo_1', components: [{ type: 'BODY' as const, text }] });

  it('acepta parámetros nombrados en minúsculas', () => {
    expect(() => validateHsm(body('Hola {{nombre}}, tu pedido {{numero_pedido}} salio.'))).not.toThrow();
  });

  for (const malo of ['{{1}}', '{{Nombre}}', '{{nombre-cliente}}', '{{año}}', '{{_x}}{{2}}']) {
    it(`rechaza «${malo}»`, () => {
      let err: unknown = null;
      try { validateHsm(body(`Hola ${malo} gracias por tu compra.`)); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(WhatsAppError);
      expect((err as WhatsAppError).status).toBe(422);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F-1 · message_events.event_time es GENERATED ALWAYS AS (created_at)
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r3 · F-1 · nadie escribe message_events.event_time', () => {
  // Verificado contra la BD (information_schema): is_generated = ALWAYS,
  // generation_expression = created_at. Un INSERT que la incluya falla con
  // 428C9 y, si nadie mira el error, TODOS los eventos de estado se pierden.
  it('processStatusUpdate no manda event_time y comprueba el error del insert', async () => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    let inserted: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      messages: (ops) => (has(ops, 'update') ? { data: null } : { data: { id: UUID_A, metadata: {} } }),
      message_events: (ops) => {
        inserted = opArg<Record<string, unknown>>(ops, 'insert') ?? null;
        return { data: null, error: { message: 'cannot insert a non-DEFAULT value into column "event_time"' } };
      },
      campaign_contacts: () => ({ data: [] }),
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await (whatsappCloudService as unknown as {
      processStatusUpdate: (s: unknown, org: number, st: unknown) => Promise<void>;
    }).processStatusUpdate(sb, 7, { id: 'wamid.X', status: 'delivered', timestamp: '1757500000', recipient_id: '573109876543' });
    expect(inserted).not.toBeNull();
    expect(Object.keys(inserted as unknown as Record<string, unknown>)).not.toContain('event_time');
    // y el error del insert no se traga en silencio
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('la Edge Function channel-dispatch tampoco inserta event_time', () => {
    const src = readSrc('supabase/functions/channel-dispatch/index.ts');
    const i = src.indexOf('from("message_events")');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 500)).not.toContain('event_time');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-2 · lote muerto: claims caducados y encadenamiento sin fin
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-10T15:00:00.000Z');

function campaignRow(stats: Record<string, unknown> = {}) {
  return {
    id: UUID_C, organization_id: 7, name: 'c', channel: 'whatsapp', status: 'sending', scheduled_at: null,
    template_id: null, segment_id: null, content: 'hola',
    statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats },
    created_by: null, created_at: '', updated_at: '',
  };
}

/** Fila reclamada por un lote que murió: queda en 'queued' con su claim_token. */
function stuckRow(id: string, claimedAgoMs: number) {
  return {
    id, customer_id: `cust-${id}`, state: null,
    metadata: { state: 'queued', recipient: `57310000000${id.slice(-1)}`, attempts: 1, batch_no: 1, claim_token: `b1:muerto-${id}`, claimed_at: new Date(NOW - claimedAgoMs).toISOString() },
  };
}

function batchTables(rows: Array<Record<string, unknown>>, stats: Record<string, unknown> = {}, updates: Op[][] = []): Record<string, TableResolver> {
  return {
    campaigns: (ops) => (has(ops, 'update') ? { data: campaignRow(stats) } : { data: campaignRow(stats) }),
    campaign_contacts: (ops) => {
      if (has(ops, 'update')) {
        updates.push(ops);
        const id = ops.find((o) => o.method === 'eq' && o.args[0] === 'id')?.args[1];
        return { data: { id } };
      }
      return { data: rows };
    },
    messages: () => ({ data: [], count: 0 }),
    provider_configs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
  };
}

describe('F16 r3 · F-2 · un lote muerto no encadena trabajos indefinidamente', () => {
  it('recupera los claims caducados en vez de reclamar 0 para siempre', async () => {
    const rows = [stuckRow('cc-1', 60 * 60_000), stuckRow('cc-2', 60 * 60_000)];
    const { sb } = makeSupabase(batchTables(rows), () => ({ data: true }));
    const send = jest.fn(async () => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: 'x', channel_id: 'ch', scheduled: false }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send, now: () => NOW, sleep: async () => undefined });
    expect(r.claimed).toBe(2);
    expect(r.sent).toBe(2);
  });

  it('un claim RECIENTE (otro lote vivo) no se roba', async () => {
    const rows = [stuckRow('cc-1', 5_000)];
    const { sb } = makeSupabase(batchTables(rows), () => ({ data: true }));
    const send = jest.fn(async () => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: 'x', channel_id: 'ch', scheduled: false }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send, now: () => NOW, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  // CONTRATO CORREGIDO EN LA RONDA 4 (tester r3 · N-2). Antes esta prueba
  // afirmaba que un testigo TODAVÍA VIVO (5 s) pausaba la campaña al quinto
  // lote; eso es justo el defecto: el corte saltaba a los ~5 s y el rescate
  // del testigo es a los 15 min, así que el rescate NUNCA llegaba a correr.
  // Ahora la campaña espera al rescate. El caso que sí pausa —candidatos
  // reclamables que otro lote gana siempre— vive en `round4.test.ts`.
  it('con un testigo aún vivo la campaña espera al rescate en vez de pausarse', async () => {
    const rows = [stuckRow('cc-1', 5_000)];
    let paused: Record<string, unknown> | null = null;
    const tables = batchTables(rows, { stalled_batches: 5 });
    tables.campaigns = (ops) => {
      if (has(ops, 'update')) {
        const patch = opArg<Record<string, unknown>>(ops, 'update');
        const st = patch?.statistics as Record<string, unknown> | undefined;
        if (st?.state === 'paused') paused = st;
        return { data: campaignRow({ stalled_batches: 5 }) };
      }
      return { data: campaignRow({ stalled_batches: 5 }) };
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, sb, { now: () => NOW, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(paused).toBeNull();
    expect(enqueueJob).toHaveBeenCalled();
  });

  it('un lote que SÍ progresa reinicia el contador de lotes sin progreso', async () => {
    const rows = [stuckRow('cc-1', 60 * 60_000)];
    let lastStats: Record<string, unknown> | null = null;
    const tables = batchTables(rows, { stalled_batches: 3 });
    tables.campaigns = (ops) => {
      if (has(ops, 'update')) {
        lastStats = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? null) as Record<string, unknown> | null;
        return { data: campaignRow({ stalled_batches: 3 }) };
      }
      return { data: campaignRow({ stalled_batches: 3 }) };
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const send = jest.fn(async () => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: 'x', channel_id: 'ch', scheduled: false }));
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 4 }, sb, { send, now: () => NOW, sleep: async () => undefined });
    expect((lastStats as unknown as { stalled_batches?: number } | null)?.stalled_batches).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-4 · normalización de teléfonos
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r3 · F-4 · el mismo número en dos formatos es UN destinatario', () => {
  it('nacional a 10 dígitos (con el indicativo de la org) y E.164 dan el mismo wa_id', () => {
    expect(normalizePhoneDigits('310 987 6543', '57')).toBe('573109876543');
    expect(normalizePhoneDigits('+57 310 987 6543')).toBe('573109876543');
    expect(normalizePhoneDigits('3109876543', '57')).toBe(normalizePhoneDigits('+573109876543'));
  });

  it('el prefijo internacional 00 equivale a +', () => {
    expect(normalizePhoneDigits('0057 310 987 6543')).toBe('573109876543');
    expect(normalizePhoneDigits('001 415 555 0100')).toBe('14155550100');
  });

  // TÍTULO CORREGIDO EN LA RONDA 4 (tester r3 · F-4). El título anterior decía
  // «un número de EE.UU. en formato nacional no se disfraza de otro país»,
  // pero el número que afirmaba está en formato INTERNACIONAL, que el código
  // viejo ya normalizaba igual: no mordía nada. El caso nacional, que es el
  // que fallaba de verdad, está en `round4.test.ts`.
  it('un número de EE.UU. ya en formato internacional conserva su país', () => {
    expect(normalizePhoneDigits('+1 (415) 555-0100')).toBe('14155550100');
  });

  it('sigue rechazando basura', () => {
    expect(normalizePhoneDigits('12345')).toBeNull();
    expect(normalizePhoneDigits('sin teléfono')).toBeNull();
  });

  it('el sufijo de WhatsApp (@s.whatsapp.net) se sigue quitando', () => {
    expect(normalizePhoneDigits('573109876543@s.whatsapp.net')).toBe('573109876543');
  });
});

describe('F16 r3 · F-4 · el webhook no duplica clientes por el formato del teléfono', () => {
  it('findOrCreateCustomer encuentra al cliente guardado como «+57 310 987 6543»', async () => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    let inserted = false;
    const { sb } = makeSupabase({
      customer_channel_identities: (ops) => (has(ops, 'insert') ? { data: null } : { data: null }),
      // El indicativo por defecto sale de los ajustes de la org (r4 · F-4).
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      customers: (ops) => {
        if (has(ops, 'insert')) { inserted = true; return { data: { id: 'nuevo' } }; }
        return { data: [{ id: 'cust-existente', phone: '+57 310 987 6543' }] };
      },
    });
    const id = await (whatsappCloudService as unknown as {
      findOrCreateCustomer: (s: unknown, org: number, ch: string, phone: string, name: string) => Promise<string>;
    }).findOrCreateCustomer(sb, 7, UUID_A, '573109876543', 'Ana');
    expect(inserted).toBe(false);
    expect(id).toBe('cust-existente');
  });

  // GEMELO encontrado en la pasada: el proveedor QR (baileys) tenía el MISMO
  // findOrCreateCustomer copiado, con la misma búsqueda por igualdad exacta.
  it('el proveedor QR tampoco duplica clientes', async () => {
    const { whatsappQrService } = await import('@/lib/services/integrations/whatsapp/whatsappQrService');
    let inserted = false;
    const { sb } = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      branches: () => ({ data: { id: 1 } }),
      customers: (ops) => {
        if (has(ops, 'insert')) { inserted = true; return { data: { id: 'nuevo' } }; }
        return { data: [{ id: 'cust-existente', phone: '+57 310 987 6543' }] };
      },
    });
    const id = await (whatsappQrService as unknown as {
      findOrCreateCustomer: (s: unknown, org: number, ch: string, phone: string, name: string) => Promise<string>;
    }).findOrCreateCustomer(sb, 7, UUID_A, '573109876543', 'Ana');
    expect(inserted).toBe(false);
    expect(id).toBe('cust-existente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-13 · cambiar de canal invalida la materialización
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r3 · F-13 · cambiar channel_id invalida la materialización', () => {
  it('materialized_at vuelve a null al cambiar de canal', async () => {
    const stats = {
      audience: { source: 'manual', segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: [], customer_ids: [UUID_B] },
      channel_id: UUID_A, materialized_at: '2026-09-09T00:00:00.000Z', pending: 3, purpose: 'utility',
    };
    const row = { id: UUID_C, organization_id: 2, name: 'C', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: stats, created_by: null, created_at: '', updated_at: '' };
    let written: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      campaigns: (ops) => {
        const upd = ops.find((o) => o.method === 'update');
        if (!upd) return { data: row };
        written = upd.args[0] as Record<string, unknown>;
        return { data: { ...row, statistics: (written as { statistics: unknown }).statistics } };
      },
      channels: () => ({ data: { id: UUID_B } }),
    });
    await updateCampaign(2, UUID_C, { channel_id: UUID_B }, sb);
    const s = (written as unknown as { statistics: { materialized_at?: string | null; channel_id?: string | null } }).statistics;
    expect(s.channel_id).toBe(UUID_B);
    expect(s.materialized_at).toBeNull();
  });

  it('reenviar el MISMO channel_id no invalida nada', async () => {
    const stats = {
      audience: { source: 'manual', segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: [], customer_ids: [UUID_B] },
      channel_id: UUID_A, materialized_at: '2026-09-09T00:00:00.000Z', pending: 3, purpose: 'utility',
    };
    const row = { id: UUID_C, organization_id: 2, name: 'C', channel: 'whatsapp', status: 'draft', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: stats, created_by: null, created_at: '', updated_at: '' };
    let written: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      campaigns: (ops) => {
        const upd = ops.find((o) => o.method === 'update');
        if (!upd) return { data: row };
        written = upd.args[0] as Record<string, unknown>;
        return { data: { ...row, statistics: (written as { statistics: unknown }).statistics } };
      },
      channels: () => ({ data: { id: UUID_A } }),
    });
    await updateCampaign(2, UUID_C, { channel_id: UUID_A }, sb);
    const s = (written as unknown as { statistics: { materialized_at?: string | null } }).statistics;
    expect(s.materialized_at).toBe('2026-09-09T00:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Extra (mismo informe del tester r2): el body nunca trae la organización
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r3 · el body con organization_id se RECHAZA (no se ignora)', () => {
  const body = {
    name: 'Masivo', channel: 'whatsapp', channel_id: UUID_A, template_id: null, content: 'hola',
    audience: { source: 'manual', customer_ids: [UUID_B] },
    throttle_mps: 5, respect_allowed_hours: true, purpose: 'utility',
  };

  it('createCampaign con organization_id en el body falla la validación', () => {
    expect(zCreateCampaignBody.safeParse({ ...body, organization_id: 999 }).success).toBe(false);
  });

  it('send con orgId en el body falla la validación', () => {
    expect(zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola', orgId: 7 }).success).toBe(false);
  });

  it('un body limpio sigue pasando', () => {
    expect(zCreateCampaignBody.safeParse(body).success).toBe(true);
    expect(zSendBody.safeParse({ customerId: UUID_B, channelId: UUID_A, text: 'hola' }).success).toBe(true);
  });
});
