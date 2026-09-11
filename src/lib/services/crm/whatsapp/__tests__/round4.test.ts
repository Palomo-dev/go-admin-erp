/**
 * FASE-16 · ronda 4 — pruebas que MUERDEN para los defectos del tester r3:
 *
 *  - N-1: un error transitorio del proveedor pausaba la campaña entera en ~5 s.
 *  - N-2: el corte por «lotes sin progreso» (~5 s) y el rescate de testigos
 *    caducados (15 min) se estorbaban; el rescate no llegaba a ejecutarse.
 *  - F-4: `'415 555 0100'` acababa en `'co'` (un número colombiano REAL
 *    distinto) en vez de `'us'` o `null`, y el indicativo estaba cableado.
 *  - N-4: `findCustomerIdByPhone` sin orden estable, y sin una sola prueba que
 *    ejercitara su camino lento.
 *  - N-5: la clave de idempotencia cambiaba con el intento y nadie la
 *    consultaba.
 *  - N-6: editar `variable_map` de una plantilla importada era imposible.
 *  - N-7: `strictPaths` en el envío individual, el desempate por `claim_token`
 *    y el bloqueo de marketing a EE.UU. no tenían prueba que los mordiera.
 */
import { runCampaignBatch, campaignClientRequestId, claimableAt, STALE_CLAIM_MS } from '../campaignBatch';
import {
  countryFromPhone,
  defaultCountryOf,
  findCustomerIdByPhone,
  normalizePhoneDigits,
  resolveRecipient,
} from '../channelService';
import { sendWhatsApp } from '../outboundService';
import { zSettingsBody } from '../schemas';
import { updateHsm } from '../templateService';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));

const mockEnqueueJob = jest.fn(async (_args: unknown) => 'job-1');
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (args: unknown) => mockEnqueueJob(args) }));

// `buildContext` sí se dobla (necesita media base de datos); `renderVariables`
// es el REAL, que es justo lo que hace que `strictPaths` muerda.
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return {
    ...actual,
    buildContext: jest.fn(async (_org: number, refs: { custom?: Record<string, unknown> }) => ({
      ...actual.emptyContext(),
      contact: { first_name: 'Laura', full_name: 'Laura Gómez' },
      opportunity: { name: 'Plan Pro' },
      org: { name: 'ACME' },
      custom: refs.custom ?? {},
    })),
  };
});

beforeEach(() => {
  mockEnqueueJob.mockClear();
  delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
});

const UUID_C = '33333333-3333-4333-8333-333333333333';
const NOW_MS = Date.parse('2026-09-10T15:00:00.000Z');
const NOW = new Date(NOW_MS);
const runAtOf = (call: number): number => {
  const args = mockEnqueueJob.mock.calls[call][0] as { runAt: Date | string };
  return typeof args.runAt === 'string' ? Date.parse(args.runAt) : args.runAt.getTime();
};

// ─────────────────────────────────────────────────────────────────────────────
// N-1 / N-2 · esperar no es estar atascada
// ─────────────────────────────────────────────────────────────────────────────

function campaignRow(stats: Record<string, unknown> = {}): Row {
  return {
    id: UUID_C, organization_id: 7, name: 'c', channel: 'whatsapp', status: 'sending', scheduled_at: null,
    template_id: null, segment_id: null, content: 'hola',
    statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats },
    created_by: null, created_at: '', updated_at: '',
  };
}

/** Tablas del lote; `pausas` recoge los `statistics` con los que se pausó. */
function batchTables(contactos: Row[], stats: Record<string, unknown>, pausas: Record<string, unknown>[]): { tables: Record<string, TableResolver>; contacts: ReturnType<typeof fakeTable> } {
  const contacts = fakeTable(contactos);
  const tables: Record<string, TableResolver> = {
    campaigns: (ops) => {
      if (has(ops, 'update')) {
        const st = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? {}) as Record<string, unknown>;
        if (st.state === 'paused') pausas.push(st);
      }
      return { data: campaignRow(stats) };
    },
    campaign_contacts: contacts.resolver,
    messages: () => ({ data: [], count: 0 }),
    provider_configs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
  };
  return { tables, contacts };
}

const okSend = () => jest.fn(async () => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: 'x', channel_id: 'ch', scheduled: false }));

function pendingRow(id: string, retryAfterMs: number | null): Row {
  return {
    id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-10T14:00:00.000Z',
    metadata: { state: 'pending', recipient: '573100000001', attempts: 1, retry_after: retryAfterMs === null ? null : new Date(retryAfterMs).toISOString() },
  };
}

function queuedRow(id: string, claimedAgoMs: number, token = 'b1:vivo'): Row {
  return {
    id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-10T14:00:00.000Z',
    metadata: { state: 'queued', recipient: '573100000002', attempts: 1, batch_no: 1, claim_token: token, claimed_at: new Date(NOW_MS - claimedAgoMs).toISOString() },
  };
}

describe('F16 r4 · N-1 · un backoff del proveedor NO pausa la campaña', () => {
  it('un lote que no reclama nada porque todo está en backoff no cuenta como «sin progreso»', async () => {
    const pausas: Record<string, unknown>[] = [];
    // Cuarto lote seguido sin reclamar: con el corte anterior, este pausaba.
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], { stalled_batches: 4 }, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 5 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(pausas).toHaveLength(0);
  });

  it('el siguiente lote se programa cuando VENCE el backoff, no dentro de 1 s', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], {}, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(runAtOf(0)).toBe(NOW_MS + 60_000);
  });

  it('el contador de lotes sin progreso no sube mientras se espera', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], { stalled_batches: 2 }, pausas);
    let guardado: Record<string, unknown> | null = null;
    tables.campaigns = (ops) => {
      if (has(ops, 'update')) {
        const st = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? {}) as Record<string, unknown>;
        if (st.stalled_batches !== undefined) guardado = st;
        if (st.state === 'paused') pausas.push(st);
      }
      return { data: campaignRow({ stalled_batches: 2 }) };
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect((guardado as unknown as { stalled_batches?: number } | null)?.stalled_batches).toBe(2);
  });
});

describe('F16 r4 · N-2 · el corte y el rescate de testigos usan el MISMO reloj', () => {
  it('con un testigo aún vivo la campaña espera a que caduque en vez de pausarse', async () => {
    const pausas: Record<string, unknown>[] = [];
    const claimedAgo = 5_000;
    const { tables } = batchTables([queuedRow('cc-1', claimedAgo)], { stalled_batches: 4 }, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 5 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(pausas).toHaveLength(0);
    // …y el siguiente lote cae justo cuando el rescate puede actuar.
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(runAtOf(0)).toBe(NOW_MS - claimedAgo + STALE_CLAIM_MS);
  });

  it('sigue pausando cuando NO hay nada que esperar (candidatos siempre disputados)', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', null)], { stalled_batches: 4 }, pausas);
    // El UPDATE de reclamación nunca cuaja: otro lote se le adelanta siempre.
    const contacts = fakeTable([pendingRow('cc-1', null)]);
    tables.campaign_contacts = (ops, call) => (has(ops, 'update') ? { data: null } : contacts.resolver(ops, call));
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 5 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.reason).toBe('stalled_no_progress');
    expect(pausas).toHaveLength(1);
  });

  it('`claimableAt` es el único juez: pendiente sin backoff = ya; enviado = nunca', () => {
    expect(claimableAt({ state: null, metadata: { state: 'pending' } })).toBe(0);
    expect(claimableAt({ state: null, metadata: { state: 'sent' } })).toBeNull();
    expect(claimableAt({ state: null, metadata: { state: 'queued', claimed_at: new Date(NOW_MS).toISOString() } })).toBe(NOW_MS + STALE_CLAIM_MS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-5 · idempotencia estable y comprobada
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r4 · N-5 · la clave de idempotencia no depende del intento', () => {
  it('es la misma para (campaña, cliente) sea cual sea el número de intento', () => {
    expect(campaignClientRequestId(UUID_C, 'cust-1')).toBe(`campaign:${UUID_C}:cust-1`);
    expect(campaignClientRequestId(UUID_C, 'cust-1')).not.toMatch(/:\d+$/);
  });

  it('el lote la usa tal cual (un rescate no genera una clave nueva)', async () => {
    const pausas: Record<string, unknown>[] = [];
    const fila = queuedRow('cc-1', 60 * 60_000, 'b1:muerto');
    (fila.metadata as Record<string, unknown>).attempts = 4;
    const { tables } = batchTables([fila], {}, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const send = okSend();
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send, now: () => NOW_MS, sleep: async () => undefined });
    expect(send).toHaveBeenCalledTimes(1);
    const input = (send.mock.calls as unknown as [unknown[]])[0][0] as unknown as { clientRequestId: string };
    expect(input.clientRequestId).toBe(campaignClientRequestId(UUID_C, 'cust-cc-1'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-4 · normalización de teléfonos
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r4 · F-4 · un número nacional de EE.UU. nunca se disfraza de colombiano', () => {
  it('«415 555 0100» con indicativo por defecto 57 da null, NUNCA 574155550100', () => {
    // El arreglo de la ronda 3 devolvía '574155550100' → país 'co', así que el
    // bloqueo de marketing a EE.UU. NO se aplicaba.
    //
    // PRECISIÓN (medida en la base, ronda 4): '574155550100' no es «un número
    // colombiano real», como se dijo antes — Colombia no asigna ningún número
    // que empiece por 4 tras el +57, así que es un identificador INVENTADO e
    // irrutable. El riesgo de escribirle a un TERCERO real está acotado al
    // rango 3XX, donde los indicativos de área de EE.UU. y los prefijos de
    // móvil colombianos se solapan (310 es a la vez Los Ángeles y Claro); ahí
    // el indicativo por defecto sigue siendo una conjetura y no hay forma de
    // deshacerla sin más información. Ver la nota de `NATIONAL_PATTERNS`.
    expect(normalizePhoneDigits('415 555 0100', '57')).toBeNull();
  });

  it('con el indicativo de EE.UU. configurado, el país resultante es «us»', () => {
    const d = normalizePhoneDigits('415 555 0100', '1');
    expect(d).toBe('14155550100');
    expect(countryFromPhone(d!)).toBe('us');
  });

  it('sin indicativo por defecto NO se completa nada: el número nacional se queda en null', () => {
    expect(normalizePhoneDigits('310 987 6543')).toBeNull();
    expect(normalizePhoneDigits('310 987 6543', '57')).toBe('573109876543');
  });

  it('los 7 teléfonos reales que hoy se convertirían en un destinatario inventado quedan fuera', () => {
    // Los 7 son cédulas y números de EE.UU. escritos en el campo teléfono.
    // Medidos en la base el 2026-09-10 sobre 12.522 clientes con teléfono:
    // 11.505 están guardados como nacional de 10 dígitos, y EXACTAMENTE estos
    // 7 dejan de completarse. Ninguno de los 7 apunta hoy a otro cliente del
    // CRM (comprobado con un cruce en la base): el daño era mandar el mensaje
    // a un identificador que no es de nadie, o de un tercero fuera del CRM.
    for (const malo of ['1036395459', '1010062107', '1000406387', '1151441736', '4072899547', '8325517404']) {
      expect(normalizePhoneDigits(malo, '57')).toBeNull();
    }
    // …y los 11.498 que sí son colombianos (11.494 móviles 3XX + 4 fijos 60X)
    // siguen funcionando: el arreglo no cuesta ni un destinatario legítimo.
    expect(normalizePhoneDigits('3109876543', '57')).toBe('573109876543');
    expect(normalizePhoneDigits('6012345678', '57')).toBe('576012345678');
  });

  it('un indicativo sin regla conocida no completa: mejor null que un destinatario inventado', () => {
    expect(normalizePhoneDigits('123456789 0', '999')).toBeNull();
  });
});

describe('F16 r4 · F-4 · el indicativo sale de la configuración, no del código', () => {
  it('ajuste de la organización → variable de entorno → último recurso', () => {
    expect(defaultCountryOf({ default_country_code: '52' })).toBe('52');
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '1';
    expect(defaultCountryOf({ default_country_code: null })).toBe('1');
    delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
    expect(defaultCountryOf({ default_country_code: null })).toBe('57');
  });

  const altaDesdeProveedor = async (phone: string): Promise<string | undefined> => {
    const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
    let insertado: Record<string, unknown> | null = null;
    const { sb } = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      customers: (ops) => {
        if (has(ops, 'insert')) { insertado = opArg<Record<string, unknown>>(ops, 'insert') ?? null; return { data: { id: 'nuevo' } }; }
        return { data: [] };
      },
    });
    await (whatsappCloudService as unknown as {
      findOrCreateCustomer: (s: unknown, org: number, ch: string, phone: string, name: string) => Promise<string>;
    }).findOrCreateCustomer(sb, 7, 'chan-1', phone, 'Ann');
    return (insertado as unknown as { phone?: string } | null)?.phone;
  };

  it('los ajustes de la organización admiten el indicativo (y rechazan basura)', () => {
    expect(zSettingsBody.parse({ default_country_code: '52' })).toMatchObject({ default_country_code: '52' });
    expect(zSettingsBody.parse({ default_country_code: null })).toMatchObject({ default_country_code: null });
    expect(() => zSettingsBody.parse({ default_country_code: '+57' })).toThrow();
    expect(() => zSettingsBody.parse({ default_country_code: 'co' })).toThrow();
  });

  it('el identificador que llega del PROVEEDOR se guarda tal cual, sin añadirle indicativo', async () => {
    // Aunque el número tuviera forma de nacional colombiano, el wa_id es lo
    // que el proveedor afirma: completarlo es inventarse un destinatario.
    await expect(altaDesdeProveedor('3109876543')).resolves.toBe('+3109876543');
  });

  it('y un número de EE.UU. del proveedor NUNCA se convierte en uno colombiano', async () => {
    // Con el indicativo aplicado a ciegas esto era «+574155550100», un número
    // colombiano real que no es el remitente.
    await expect(altaDesdeProveedor('4155550100')).resolves.toBe('+4155550100');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-4 / N-7 · findCustomerIdByPhone, con un doble que SÍ falla la igualdad
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r4 · N-4 · findCustomerIdByPhone: camino lento y orden estable', () => {
  const clientes = (rows: Row[]) => makeSupabase({ customers: fakeTable(rows).resolver });

  it('encuentra al cliente guardado con separadores (la igualdad exacta NO acierta)', async () => {
    const { sb, calls } = clientes([
      { id: 'c-1', organization_id: 7, phone: '+57 310 987 6543', created_at: '2021-01-01T00:00:00Z' },
    ]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBe('c-1');
    // …y para llegar ahí ha tenido que usar el prefiltro, no la igualdad.
    expect(calls.some((c) => has(c.ops, 'ilike'))).toBe(true);
  });

  it('no engancha a un cliente cuyo teléfono solo COINCIDE EN EL SUFIJO', async () => {
    const { sb } = clientes([
      { id: 'c-otro', organization_id: 7, phone: '+57 320 111 6543', created_at: '2021-01-01T00:00:00Z' },
    ]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBeNull();
  });

  it('no cruza de organización', async () => {
    const { sb } = clientes([
      { id: 'c-ajeno', organization_id: 8, phone: '+57 310 987 6543', created_at: '2021-01-01T00:00:00Z' },
    ]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBeNull();
  });

  it('con 2 clientes en colisión devuelve SIEMPRE el más antiguo (263 grupos reales)', async () => {
    const filas: Row[] = [
      { id: 'c-nuevo', organization_id: 7, phone: '310 987 6543', created_at: '2024-05-05T00:00:00Z' },
      { id: 'c-viejo', organization_id: 7, phone: '+57 310-987-6543', created_at: '2019-02-02T00:00:00Z' },
    ];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(filas).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
    // El orden de llegada de las filas no puede cambiar la respuesta.
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([...filas].reverse()).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
  });

  it('el camino rápido (E.164 exacto) también ordena por antigüedad', async () => {
    const filas: Row[] = [
      { id: 'c-nuevo', organization_id: 7, phone: '+573109876543', created_at: '2024-05-05T00:00:00Z' },
      { id: 'c-viejo', organization_id: 7, phone: '573109876543', created_at: '2019-02-02T00:00:00Z' },
    ];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(filas).sb)).resolves.toBe('c-viejo');
  });

  it('sin indicativo de la org, un teléfono nacional guardado NO se da por bueno', async () => {
    const { sb } = clientes([{ id: 'c-1', organization_id: 7, phone: '310 987 6543', created_at: '2021-01-01T00:00:00Z' }]);
    await expect(findCustomerIdByPhone(7, '573109876543', sb)).resolves.toBeNull();
    await expect(findCustomerIdByPhone(7, '573109876543', sb, { defaultCountry: '57' })).resolves.toBe('c-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-7 · el desempate por claim_token en el rescate
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r4 · N-7 · dos lotes que rescatan el MISMO testigo caducado', () => {
  it('solo uno se lo queda: el testigo viejo es la condición que desempata', async () => {
    const original = queuedRow('cc-1', 60 * 60_000, 'b1:muerto');
    const contacts = fakeTable([original]);
    // El lote B leyó ANTES de que A escribiera: ve la fila todavía caducada.
    let instantanea: Row[] | null = null;
    const pausas: Record<string, unknown>[] = [];
    const tables: Record<string, TableResolver> = {
      campaigns: () => ({ data: campaignRow() }),
      campaign_contacts: (ops, call) => {
        if (!has(ops, 'update') && !has(ops, 'insert') && instantanea) {
          return fakeTable(instantanea).resolver(ops, call);
        }
        return contacts.resolver(ops, call);
      },
      messages: () => ({ data: [], count: 0 }),
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));

    // A: se queda bloqueado DENTRO del envío, con la fila ya reclamada.
    let liberar!: () => void;
    const puerta = new Promise<void>((r) => { liberar = r; });
    let reclamado!: () => void;
    const yaReclamo = new Promise<void>((r) => { reclamado = r; });
    const enviosA: string[] = [];
    const sendA = jest.fn(async (i: { customerId: string }) => {
      enviosA.push(i.customerId);
      reclamado();
      await puerta;
      return { message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false };
    });
    const pa = runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send: sendA as never, now: () => NOW_MS, sleep: async () => undefined });
    await yaReclamo;

    // B: entra con la lectura vieja y trata de rescatar la misma fila.
    instantanea = [original];
    const enviosB: string[] = [];
    const sendB = jest.fn(async (i: { customerId: string }) => {
      enviosB.push(i.customerId);
      return { message_id: 'm2', conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false };
    });
    const rb = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, { send: sendB as never, now: () => NOW_MS, sleep: async () => undefined });

    liberar();
    await pa;
    expect(pausas).toHaveLength(0);
    expect(rb.claimed).toBe(0);
    expect(enviosB).toHaveLength(0);
    expect([...enviosA, ...enviosB]).toEqual(['cust-cc-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-7 · strictPaths, bloqueo de EE.UU. e idempotencia POR EL CAMINO DE ENVÍO
// ─────────────────────────────────────────────────────────────────────────────

const APROBADA_MKT = {
  id: 'tpl-mkt', organization_id: 7, name: 'promo', description: null, body_html: 'Hola {{nombre}}, tenemos promo.', is_active: true, created_at: '', updated_at: '',
  metadata: { provider: 'meta', status: 'APPROVED', category: 'marketing', language: 'es', parameter_format: 'named', components: [{ type: 'BODY', text: 'Hola {{nombre}}, tenemos promo.' }], variable_map: { nombre: 'contact.first_name|cliente' } },
};

function sendTables(over: Partial<Record<string, TableResolver>> = {}, phone = '+57 310 987 6543'): Record<string, TableResolver> {
  return {
    customers: () => ({ data: { id: 'cust-1', full_name: 'Laura Gómez', first_name: 'Laura', phone } }),
    opportunities: () => ({ data: { id: 'opp-1', customer_id: 'cust-1' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas CO', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations: (ops) => (has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1', last_inbound_at: new Date(NOW_MS - 3600_000).toISOString() } }),
    provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    messages: (ops) => (has(ops, 'insert') ? { data: { id: 'msg-1', created_at: NOW.toISOString() } } : { data: [], count: 0 }),
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    templates: () => ({ data: null }),
    ...over,
  };
}
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'deduct_comm_credits' ? true : null });

describe('F16 r4 · N-7 · el envío INDIVIDUAL aplica el modo estricto de variables', () => {
  it('un {{1}} posicional en texto libre para el envío en 422, no sale literal', async () => {
    const { sb, calls } = makeSupabase(sendTables(), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{1}}, tu pedido llegó' }, sb, sb, NOW))
      .rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  it('lo mismo con una llave que no es ruta válida ({{nombre cliente}})', async () => {
    const { sb, calls } = makeSupabase(sendTables(), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{nombre cliente}}, ¿todo bien?' }, sb, sb, NOW))
      .rejects.toMatchObject({ code: 'MISSING_VARIABLES' });
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  it('una ruta válida y resoluble sí se envía interpolada', async () => {
    const { sb, calls } = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}' }, sb, sb, NOW);
    const ins = calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!;
    expect(opArg<Record<string, unknown>>(ins.ops, 'insert')!.content).toBe('Hola Laura');
  });
});

describe('F16 r4 · N-7 · el bloqueo de marketing a EE.UU. en el envío individual', () => {
  it('plantilla de marketing a un número de EE.UU. → 422 US_MARKETING_BLOCKED', async () => {
    const { sb, calls } = makeSupabase(sendTables({ templates: () => ({ data: APROBADA_MKT }) }, '+1 415 555 0100'), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-mkt' } }, sb, sb, NOW))
      .rejects.toMatchObject({ code: 'US_MARKETING_BLOCKED', status: 422 });
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  it('la misma plantilla a un número colombiano sí sale', async () => {
    const { sb, calls } = makeSupabase(sendTables({ templates: () => ({ data: APROBADA_MKT }) }), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-mkt' } }, sb, sb, NOW);
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(true);
  });
});

describe('F16 r4 · N-5 · la clave de idempotencia se COMPRUEBA antes de insertar', () => {
  it('dos envíos con la misma clientRequestId insertan UN solo mensaje', async () => {
    const mensajes = fakeTable([], { onInsert: (row) => { row.created_at = NOW.toISOString(); row.id = 'msg-1'; return row; } });
    const { sb, calls } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    const a = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'campaign:x:cust-1' }, sb, sb, NOW);
    const b = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'campaign:x:cust-1' }, sb, sb, NOW);
    expect(calls.filter((c) => c.table === 'messages' && has(c.ops, 'insert'))).toHaveLength(1);
    expect(b.message_id).toBe(a.message_id);
    expect(b.duplicate).toBe(true);
  });

  it('el duplicado no vuelve a descontar créditos', async () => {
    const mensajes = fakeTable([], { onInsert: (row) => { row.created_at = NOW.toISOString(); row.id = 'msg-1'; return row; } });
    const { sb, rpcCalls } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-1' }, sb, sb, NOW);
    const antes = rpcCalls.filter((r) => r.fn === 'deduct_comm_credits').length;
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-1' }, sb, sb, NOW);
    expect(rpcCalls.filter((r) => r.fn === 'deduct_comm_credits')).toHaveLength(antes);
  });

  it('claves distintas siguen insertando mensajes distintos', async () => {
    const mensajes = fakeTable([], { onInsert: (row) => { row.created_at = NOW.toISOString(); return row; } });
    const { sb, calls } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-1' }, sb, sb, NOW);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-2' }, sb, sb, NOW);
    expect(calls.filter((c) => c.table === 'messages' && has(c.ops, 'insert'))).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// N-6 · la trampa de validateHsm
// ─────────────────────────────────────────────────────────────────────────────

const IMPORTADA = {
  id: 'tpl-meta', organization_id: 7, name: 'recordatorio_cita', description: null,
  body_html: 'Hola {{1}}, te esperamos el {{2}}.', is_active: true, created_at: '', updated_at: '',
  metadata: { provider: 'meta', status: 'DRAFT', category: 'utility', language: 'es', parameter_format: 'positional', components: [{ type: 'BODY', text: 'Hola {{1}}, te esperamos el {{2}}.' }], variable_map: {}, meta_template_id: null },
};

describe('F16 r4 · N-6 · una plantilla importada de Meta se puede ARREGLAR', () => {
  const tablas = (guardado: { row?: Record<string, unknown> }) => makeSupabase({
    templates: (ops) => {
      if (has(ops, 'update')) {
        guardado.row = opArg<Record<string, unknown>>(ops, 'update');
        return { data: { ...IMPORTADA, metadata: { ...IMPORTADA.metadata, ...(guardado.row?.metadata as Record<string, unknown>) } } };
      }
      return { data: IMPORTADA };
    },
  });

  it('editar solo `variable_map` no valida los componentes (y es lo único que la hace enviable)', async () => {
    const guardado: { row?: Record<string, unknown> } = {};
    const { sb } = tablas(guardado);
    const t = await updateHsm(7, 'tpl-meta', { variable_map: { '1': 'contact.first_name', '2': 'custom.fecha' } }, sb);
    expect(t.meta.variable_map['1']).toBe('contact.first_name');
    expect(t.meta.variable_map['2']).toBe('custom.fecha');
  });

  it('editar solo la categoría o la descripción tampoco', async () => {
    const { sb } = tablas({});
    await expect(updateHsm(7, 'tpl-meta', { category: 'marketing' }, sb)).resolves.toBeDefined();
    await expect(updateHsm(7, 'tpl-meta', { description: 'importada de Meta' }, sb)).resolves.toBeDefined();
  });

  it('pero si se TOCAN los componentes, la validación vuelve a aplicarse', async () => {
    const { sb } = tablas({});
    await expect(updateHsm(7, 'tpl-meta', { components: [{ type: 'BODY', text: 'Hola {{Nombre}}, mal parámetro.' }] }, sb))
      .rejects.toMatchObject({ code: 'INVALID_COMPONENTS' });
  });

  it('y un nombre inválido se sigue rechazando aunque no cambien los componentes', async () => {
    const { sb } = tablas({});
    await expect(updateHsm(7, 'tpl-meta', { name: 'Nombre Inválido' }, sb)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HUECOS QUE DESTAPÓ LA PASADA DE MUTACIÓN DE LA RONDA 4
//
// Las dos guardas de abajo estaban escritas y NINGUNA prueba se ponía roja al
// quitarlas — el mismo defecto de proceso que el tester r3 apuntó en N-7. Se
// documentan aquí con la reversión concreta que ahora sí muerden.
// ─────────────────────────────────────────────────────────────────────────────

describe('F16 r4 · N-1/N-2 · una campaña REANUDADA a mano no se vuelve a pausar sola', () => {
  // Reversión que muerde: `if (!esperando && stalled >= MAX_STALLED_BATCHES)`
  // → `if (stalled >= MAX_STALLED_BATCHES)` en `campaignBatch.ts`.
  //
  // Este es el único estado en el que la mitad `!esperando` de la guarda decide
  // algo, y es justo el escenario que pide N-2: la campaña ya se pausó con
  // `stalled_batches` en el tope, alguien la reanuda, y el primer lote tras la
  // reanudación se encuentra todo en backoff. Sin `!esperando`, el contador
  // sigue en el tope (no baja: no hay progreso) y la campaña se RE-PAUSA al
  // instante — reanudarla no serviría de nada nunca.
  it('con el contador ya en el tope, si solo está esperando NO se re-pausa: encola', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], { stalled_batches: 5 }, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(pausas).toHaveLength(0);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(runAtOf(0)).toBe(NOW_MS + 60_000);
  });

  it('y lo mismo con un testigo aún vivo: se espera al rescate, no se re-pausa', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([queuedRow('cc-1', 5_000)], { stalled_batches: 5 }, pausas);
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(pausas).toHaveLength(0);
    expect(runAtOf(0)).toBe(NOW_MS - 5_000 + STALE_CLAIM_MS);
  });

  it('pero con el contador en el tope y NADA que esperar sí se pausa', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', null)], { stalled_batches: 5 }, pausas);
    const contacts = fakeTable([pendingRow('cc-1', null)]);
    tables.campaign_contacts = (ops, call) => (has(ops, 'update') ? { data: null } : contacts.resolver(ops, call));
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, sb, { send: okSend(), now: () => NOW_MS, sleep: async () => undefined });
    expect(r.reason).toBe('stalled_no_progress');
    expect(pausas).toHaveLength(1);
  });
});

describe('F16 r4 · F-4 · resolveRecipient no reescribe el identificador del proveedor', () => {
  // Reversión que muerde: en `resolveRecipient`,
  // `normalizePhoneDigits(fromIdentity)` → `normalizePhoneDigits(fromIdentity, defaultCountry)`.
  //
  // La prueba que ya existía para esto ejercitaba `whatsappCloudService`, no
  // `resolveRecipient`, así que esta guarda —la que decide el destinatario de
  // TODO envío— no tenía ninguna. El número elegido tiene forma de móvil
  // colombiano a propósito: es el único caso en el que aplicar el indicativo
  // cambia el resultado, y lo convierte en un número REAL distinto.
  const conIdentidad = (identity: string) =>
    makeSupabase({
      customer_channel_identities: () => ({ data: { identity_value: identity } }),
      customers: () => ({ data: { phone: '+573001112233' } }),
    }).sb;

  it('un wa_id ya en E.164 se respeta tal cual', async () => {
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', conIdentidad('+57 310 987 6543'), '57')).resolves.toBe('573109876543');
  });

  it('un wa_id malformado (10 dígitos pelados) NO se completa a 573109876543', async () => {
    // Sin indicativo es un identificador inválido: NO_PHONE es la respuesta
    // correcta. Completarlo sería inventarse un destinatario.
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', conIdentidad('3109876543'), '57')).resolves.toBeNull();
  });

  it('el teléfono de `customers` (texto libre de la org) SÍ se completa', async () => {
    // El contraste importa: la diferencia no es el número, es de dónde viene.
    const sb = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      customers: () => ({ data: { phone: '310 987 6543' } }),
    }).sb;
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sb, '57')).resolves.toBe('573109876543');
  });

  // REGRESIÓN ENCONTRADA EN LA RONDA 4, no por el tester.
  //
  // Al convertir el indicativo en un parámetro, `resolveRecipient` se quedó con
  // `defaultCountry = null` por defecto y DOS llamadores se quedaron sin
  // pasarlo: `GET /api/crm/whatsapp/window/[customerId]` y
  // `POST /api/crm/whatsapp/templates/[id]/preview`. Como 11.505 de los 12.522
  // teléfonos de la base (92 %) están guardados como nacional de 10 dígitos,
  // esos dos endpoints devolvían `recipient: null` para la mayoría de los
  // clientes —y la ventana y el coste estimado con él— mientras que
  // `sendWhatsApp` sí resolvía el número y enviaba. Dos respuestas distintas
  // para el mismo cliente.
  //
  // El arreglo es quitar el pie del que tropezar: omitir el argumento ya no
  // significa «no completes», significa «resuélvelo tú».
  it('omitir el indicativo NO es «no completes»: se resuelve de los ajustes de la org', async () => {
    const sb = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      customers: () => ({ data: { phone: '310 987 6543' } }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    }).sb;
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sb)).resolves.toBe('573109876543');
  });

  it('y pasar `null` explícitamente SÍ sigue queriendo decir «no completes»', async () => {
    const sb = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      customers: () => ({ data: { phone: '310 987 6543' } }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    }).sb;
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sb, null)).resolves.toBeNull();
  });

  it('con el indicativo resuelto de la org, un número que no encaja sigue dando null', async () => {
    const sb = makeSupabase({
      customer_channel_identities: () => ({ data: null }),
      customers: () => ({ data: { phone: '415 555 0100' } }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    }).sb;
    await expect(resolveRecipient(7, 'cust-1', 'chan-1', sb)).resolves.toBeNull();
  });
});
