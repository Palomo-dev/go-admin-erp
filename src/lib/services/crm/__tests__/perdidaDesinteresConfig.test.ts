/**
 * El agente de voz ante el desinterés definitivo respeta la configuración de
 * la organización (modo, excepción por valor y por etapa, política de la
 * etapa) y avisa al vendedor EN EL MOMENTO (decisión del dueño, 2026-10-07).
 *
 * Doble de Supabase de las rutas del CRM (`ola1Fake`): filtra de verdad por
 * columna, así que una lectura sin `organization_id` no encontraría la fila.
 */

const changeStage = jest.fn();
jest.mock('@/lib/services/crm/opportunityStageService', () => ({
  CLAVE_CIERRE_AGENTE_VOZ: 'cierre_agente_voz',
  changeStage: (...a: unknown[]) => changeStage(...a),
}));
const despachar = jest.fn(async () => ({ revisados: 0, enviados: 1, omitidos: 0, fallidos: 0, enPausa: 0 }));
jest.mock('@/lib/services/avisos/despachoAvisos', () => ({ despacharAvisosPendientes: (...a: unknown[]) => despachar(...(a as [])) }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: jest.fn(async () => ({ code: 'COP', decimals: 0 })) }));
jest.mock('@/lib/services/crm/reunionCorreo.server', () => ({ notificarReunion: jest.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { fakeSupabase, makeDb, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db, type Row } from '@/app/api/crm/__tests__/ola1Fake';
import { marcarPerdidaPorDesinteres, ETIQUETA_TAREA_DESINTERES, type ContextoPerdida } from '@/lib/services/crm/voiceAgent/perdidaPorDesinteres';
import type { ObjecionRegistrada } from '@/lib/services/crm/voiceAgent/cierreLlamada';

const OBJECION: ObjecionRegistrada = { texto: 'ya tiene un software que le funciona', detalle: null, tipo: 'desinteres' };
const PIPE = U(40);
const LLAMADA = U(70);

let db: Ola1Db;

function semilla(opp: Partial<Row> = {}, config: Row | null = null, extra: Record<string, Row[]> = {}): Ola1Db {
  const etapa = (id: string, position: number, is_lost = false) => ({ id, pipeline_id: PIPE, position, is_won: false, is_lost, 'pipelines.organization_id': ORG });
  const d = makeDb({
    opportunities: [
      { id: U(1), organization_id: ORG, name: 'Renovación licencias', pipeline_id: PIPE, stage_id: U(42), status: 'open', salesperson_id: OTRO_VENDEDOR, created_by: YO, amount: 25_000_000, currency: 'COP', ...opp },
    ],
    pipelines: [{ id: PIPE, organization_id: ORG, pipeline_type: 'sales' }],
    stages: [etapa(U(41), 1), etapa(U(42), 2), etapa(U(43), 3), etapa(U(49), 9, true)],
    voice_agent_calls: [{ id: 'vac-1', organization_id: ORG, call_id: LLAMADA }],
    crm_voice_disinterest_settings: [
      // Señuelo de otra organización: nunca debe leerse.
      { organization_id: OTRA, mode: 'log_only', value_exception_enabled: false, value_threshold: null, value_currency: null, stage_exception_enabled: false, advanced_stage_id: null, updated_by: null, updated_at: null },
      ...(config ? [config] : []),
    ],
    exchange_rates: [{ organization_id: ORG, base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-10-01' }],
    ...extra,
  });
  d.rpc.fn_avisos_miembro_poner = { data: U(80) };
  return d;
}

function cfg(parcial: Partial<Row>): Row {
  return { organization_id: ORG, mode: 'mark_lost', value_exception_enabled: false, value_threshold: null, value_currency: null, stage_exception_enabled: false, advanced_stage_id: null, updated_by: YO, updated_at: '2026-10-07T15:00:00Z', ...parcial };
}

function ctx(extra: Partial<ContextoPerdida> = {}): ContextoPerdida {
  return {
    orgId: ORG,
    supabase: fakeSupabase(db) as unknown as SupabaseClient,
    voiceAgentCallId: 'vac-1',
    customerId: U(10),
    opportunityId: U(1),
    agentId: 'agente-1',
    objetivo: 'sell_product',
    politicaEtapa: null,
    resumenLlamada: 'Llamada de 1 min 42 s; el cliente dijo: «No, gracias».',
    ...extra,
  };
}

const escrituras = (tabla: string) => db.writes.filter((w) => w.table === tabla);
const avisos = () => db.rpcCalls.filter((c) => c.fn === 'fn_avisos_miembro_poner').map((c) => c.args);

beforeEach(() => {
  changeStage.mockReset();
  changeStage.mockResolvedValue({ ok: true, opportunity: {}, stage: { id: U(49), name: 'Perdida', is_won: false, is_lost: true }, gate: null, overridden: false });
  despachar.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('sin configuración: el comportamiento de hoy (perdida directo) + aviso inmediato', () => {
  test('marca perdida con la marca del agente y avisa al responsable en el momento', async () => {
    db = semilla();
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(r).toMatchObject({ aplicada: true, stageId: U(49), aviso: { enviado: true, destinatario: OTRO_VENDEDOR } });
    const [org, actor, params] = changeStage.mock.calls[0];
    expect(org).toBe(ORG);
    expect(actor).toBe('voice_agent:agente-1');
    expect(params).toMatchObject({
      opportunityId: U(1),
      stageId: U(49),
      lossData: { lossReasonLabel: 'Sin interés: ya tiene un software que le funciona' },
      cierreAgenteVoz: { call_id: LLAMADA, voice_agent_call_id: 'vac-1', etapa_anterior_id: U(42), motivo: 'Sin interés: ya tiene un software que le funciona' },
    });
    const [aviso] = avisos();
    expect(aviso).toMatchObject({
      p_org: ORG,
      p_recipient: OTRO_VENDEDOR,
      p_actor: null,
      p_event: 'oportunidad.perdida',
      p_entity_type: 'opportunity',
      p_entity_id: U(1),
      p_href: `/app/crm/oportunidades/${U(1)}?llamada=${LLAMADA}`,
      p_key: `${ORG}:voz.desinteres.perdida:${U(1)}:vac-1`,
    });
    expect(String(aviso.p_title)).toBe('El agente de voz marcó perdida «Renovación licencias»');
    expect(String(aviso.p_body)).toContain('Motivo: Sin interés: ya tiene un software que le funciona.');
    expect(String(aviso.p_body)).toContain('Llamada de 1 min 42 s');
    expect(despachar).toHaveBeenCalledWith(ORG, expect.anything());
  });

  test('la configuración de otra organización no se lee (filtra por la de la llamada)', async () => {
    db = semilla();
    await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(changeStage).toHaveBeenCalledTimes(1);
  });

  test('sin responsable, el aviso va a quien la creó', async () => {
    db = semilla({ salesperson_id: null });
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(avisos()[0].p_recipient).toBe(YO);
    expect(r.aviso).toMatchObject({ enviado: true, destinatario: YO });
  });

  test('si el aviso falla, la pérdida queda igual y se registra', async () => {
    db = semilla();
    db.rpc.fn_avisos_miembro_poner = { error: { code: '42501', message: 'denegado' } };
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(r).toMatchObject({ aplicada: true, aviso: { enviado: false, motivo: 'error' } });
    expect(despachar).not.toHaveBeenCalled();
  });
});

describe('modos de la organización', () => {
  test('«Solo dejar tarea»: no cierra; tarea etiquetada al responsable y aviso de tarea', async () => {
    db = semilla({}, cfg({ mode: 'task_only' }));
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(changeStage).not.toHaveBeenCalled();
    expect(r).toMatchObject({ aplicada: false, motivo: 'configuracion_tarea', tareaCreada: true, aviso: { enviado: true } });
    const tarea = escrituras('tasks')[0].payload as Row;
    expect(tarea).toMatchObject({ organization_id: ORG, assigned_to: OTRO_VENDEDOR, related_to_id: U(1), tags: [ETIQUETA_TAREA_DESINTERES] });
    const [aviso] = avisos();
    expect(aviso).toMatchObject({ p_event: 'tarea.asignada', p_entity_type: 'task', p_recipient: OTRO_VENDEDOR });
    expect(String(aviso.p_title)).toBe('Decide sobre «Renovación licencias»: el cliente no tiene interés');
    expect(String(aviso.p_body)).toContain('Tu organización pidió que el agente no cierre oportunidades');
    expect(despachar).toHaveBeenCalledTimes(1);
  });

  test('«No hacer nada»: ni etapa, ni tarea, ni aviso; solo la objeción en la actividad', async () => {
    db = semilla({}, cfg({ mode: 'log_only' }));
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(r).toEqual({ aplicada: false, motivo: 'solo_registro' });
    expect(changeStage).not.toHaveBeenCalled();
    expect(escrituras('tasks')).toHaveLength(0);
    expect(avisos()).toHaveLength(0);
    expect(despachar).not.toHaveBeenCalled();
    expect(escrituras('activities')[0].payload).toMatchObject({ organization_id: ORG, related_id: U(1), outcome: 'not_interested' });
    expect(escrituras('voice_agent_tool_runs')[0].payload).toMatchObject({ status: 'denied' });
  });

  test('«Marcar perdida» explícito: igual que sin configuración', async () => {
    db = semilla({}, cfg({ mode: 'mark_lost' }));
    expect((await marcarPerdidaPorDesinteres(ctx(), OBJECION)).aplicada).toBe(true);
  });
});

describe('excepción por valor', () => {
  test.each([
    ['por debajo del monto', 25_000_001, 'perdida'],
    ['igual al monto', 25_000_000, 'tarea'],
    ['por encima del monto', 24_999_999, 'tarea'],
  ])('oportunidad de 25.000.000 COP %s (umbral %d COP) → %s', async (_caso, umbral, accion) => {
    db = semilla({}, cfg({ value_exception_enabled: true, value_threshold: String(umbral), value_currency: 'COP' }));
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    if (accion === 'perdida') {
      expect(r.aplicada).toBe(true);
    } else {
      expect(r).toMatchObject({ aplicada: false, motivo: 'excepcion_valor' });
      expect(String(avisos()[0].p_body)).toContain('No se cerró porque vale');
    }
  });

  test('oportunidad en USD contra umbral en COP: convierte con exchange_rates de la organización', async () => {
    db = semilla({ amount: 6_000, currency: 'USD' }, cfg({ value_exception_enabled: true, value_threshold: 20_000_000, value_currency: 'COP' }));
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(r).toMatchObject({ aplicada: false, motivo: 'excepcion_valor' });
  });

  test('oportunidad en una moneda sin tasa: deja la tarea (la tasa no se inventa)', async () => {
    db = semilla({ amount: 10, currency: 'EUR' }, cfg({ value_exception_enabled: true, value_threshold: 20_000_000, value_currency: 'COP' }));
    const r = await marcarPerdidaPorDesinteres(ctx(), OBJECION);
    expect(r).toMatchObject({ aplicada: false, motivo: 'excepcion_valor' });
    expect(String(avisos()[0].p_body)).toContain('no hay tasa de cambio');
  });
});

describe('excepción por etapa avanzada', () => {
  test('desde la etapa configurada en adelante: tarea', async () => {
    db = semilla({}, cfg({ stage_exception_enabled: true, advanced_stage_id: U(42) }));
    expect(await marcarPerdidaPorDesinteres(ctx(), OBJECION)).toMatchObject({ aplicada: false, motivo: 'excepcion_etapa' });
  });

  test('antes de la etapa configurada: se marca perdida', async () => {
    db = semilla({}, cfg({ stage_exception_enabled: true, advanced_stage_id: U(43) }));
    expect((await marcarPerdidaPorDesinteres(ctx(), OBJECION)).aplicada).toBe(true);
  });
});

describe('precedencia con la etapa (`action_policy`)', () => {
  test('etapa en «Sugerir» + organización en marcar perdida → tarea', async () => {
    db = semilla();
    expect(await marcarPerdidaPorDesinteres(ctx({ politicaEtapa: 'suggest' }), OBJECION)).toMatchObject({ aplicada: false, motivo: 'politica_sugerir' });
    expect(String(avisos()[0].p_body)).toContain('«Sugerir»');
  });

  test('etapa en «Sugerir» + organización en no hacer nada → no hace nada (la más restrictiva)', async () => {
    db = semilla({}, cfg({ mode: 'log_only' }));
    expect(await marcarPerdidaPorDesinteres(ctx({ politicaEtapa: 'suggest' }), OBJECION)).toEqual({ aplicada: false, motivo: 'solo_registro' });
  });

  test('etapa en «auto» no relaja «solo tarea» de la organización', async () => {
    db = semilla({}, cfg({ mode: 'task_only' }));
    expect(await marcarPerdidaPorDesinteres(ctx({ politicaEtapa: 'auto' }), OBJECION)).toMatchObject({ aplicada: false, motivo: 'configuracion_tarea' });
  });
});
